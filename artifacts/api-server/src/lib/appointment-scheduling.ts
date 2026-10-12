import { pool } from "@workspace/db";
import { createCalendarEvent } from "./google-calendar";
import { logger } from "./logger";

export type AppointmentSlot = {
  iso: string;
  label: string;
};

type BookAppointmentInput = {
  companyId: number;
  callId: number;
  callSid: string;
  slotIso: string;
  callerName: string;
  serviceDescription: string;
  address: string;
};

type BookAppointmentResult =
  | { ok: true; jobId: number; iso: string; label: string }
  | { ok: false; reason: "slot_unavailable" | "missing_details" | "invalid_slot"; message: string };

const DEFAULT_TIME_ZONE = "Europe/London";
const SLOT_DURATION_MINUTES = 60;
const CONFLICT_WINDOW_MS = 2 * 60 * 60 * 1000;

type BookingHours = {
  day_of_week: number;
  open_time: string;
  close_time: string;
  bookable: boolean;
};

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function localDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));

  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(guess);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);

  const representedAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    0,
    0,
  );
  const offsetMs = representedAsUtc - guess.getTime();
  return new Date(guess.getTime() - offsetMs);
}

function addCalendarDays(
  ymd: { year: number; month: number; day: number },
  days: number,
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + days, 12));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

function timeMinutes(value: string): number {
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return -1;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? hour * 60 + minute : -1;
}

function weekdayFor(date: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short" })
    .format(date).slice(0, 3).toLowerCase();
  return ({ sun: 7, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 } as Record<string, number>)[name] ?? 0;
}

async function bookingHours(companyId: number): Promise<BookingHours[]> {
  const result = await pool.query<BookingHours>(
    `SELECT day_of_week,open_time::text,close_time::text,bookable
       FROM company_booking_hours WHERE company_id=$1 ORDER BY day_of_week`,
    [companyId],
  );
  if (result.rows.length) return result.rows.filter((row) => row.bookable);

  // The approved Parsley schedule is a code-backed pilot default as well as a
  // saved dev setting, so it remains available after schema-only deployment.
  const company = await pool.query<{ name: string }>(
    "SELECT name FROM companies WHERE id=$1 LIMIT 1",
    [companyId],
  );
  const name = company.rows[0]?.name.toLowerCase().trim().replace(/\s+(limited|ltd\.?)$/i, "");
  if (name !== "parsley electrical") return [];
  return [1, 2, 3, 4, 5].map((day_of_week) => ({
    day_of_week,
    open_time: "08:30",
    close_time: "16:30",
    bookable: true,
  }));
}

function buildCandidateSlots(timeZone: string, hours: BookingHours[]): AppointmentSlot[] {
  const now = new Date();
  let ymd = localParts(now, timeZone);
  const result: AppointmentSlot[] = [];
  const byDay = new Map(hours.map((row) => [row.day_of_week, row]));

  while (result.length < 80) {
    const weekday = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day, 12)).getUTCDay();
    const schedule = byDay.get(weekday || 7);
    if (schedule) {
      const opens = timeMinutes(schedule.open_time);
      const closes = timeMinutes(schedule.close_time);
      for (let start = opens; start >= 0 && start + SLOT_DURATION_MINUTES <= closes; start += SLOT_DURATION_MINUTES) {
        const instant = localDateTimeToUtc(
          ymd.year,
          ymd.month,
          ymd.day,
          Math.floor(start / 60),
          start % 60,
          timeZone,
        );
        if (instant <= now) continue;
        const label = new Intl.DateTimeFormat("en-GB", {
          timeZone,
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit",
          hourCycle: "h12",
        }).format(instant);
        result.push({ iso: instant.toISOString(), label });
      }
    }
    ymd = addCalendarDays(ymd, 1);
  }

  return result;
}

async function companyTimeZone(companyId: number): Promise<string> {
  const company = await pool.query<{ timezone: string; name: string }>(
    "SELECT timezone,name FROM companies WHERE id=$1 LIMIT 1",
    [companyId],
  );
  const name = company.rows[0]?.name.toLowerCase().trim().replace(/\s+(limited|ltd\.?)$/i, "");
  const value = name === "parsley electrical" ? DEFAULT_TIME_ZONE : company.rows[0]?.timezone || DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

async function occupiedTimes(
  companyId: number,
  start: Date,
  end: Date,
): Promise<number[]> {
  const rows = await pool.query<{ scheduled_at: Date }>(
    `SELECT scheduled_at
       FROM jobs
      WHERE scheduled_at >= $2
        AND scheduled_at <= $3
        AND (company_id=$1 OR company_id IS NULL)
        AND status NOT IN ('cancelled','dismissed')`,
    [companyId, start, end],
  );
  return rows.rows.map((row) => new Date(row.scheduled_at).getTime());
}

export async function getAvailableAppointmentSlots(
  companyId: number,
  limit = 6,
): Promise<AppointmentSlot[]> {
  const timeZone = await companyTimeZone(companyId);
  const hours = await bookingHours(companyId);
  if (!hours.length) return [];
  const todayHours = hours.find((row) => row.day_of_week === weekdayFor(new Date(), timeZone));
  if (!todayHours) return [];
  const now = new Date();
  const localTime = new Intl.DateTimeFormat("en-GB", {
    timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(now);
  const currentMinute = timeMinutes(localTime);
  if (currentMinute < timeMinutes(todayHours.open_time) || currentMinute >= timeMinutes(todayHours.close_time)) return [];
  const candidates = buildCandidateSlots(timeZone, hours);
  if (!candidates.length) return [];

  const windowStart = new Date(new Date(candidates[0].iso).getTime() - CONFLICT_WINDOW_MS);
  const windowEnd = new Date(
    new Date(candidates[candidates.length - 1].iso).getTime() + CONFLICT_WINDOW_MS,
  );
  const booked = await occupiedTimes(companyId, windowStart, windowEnd);

  return candidates
    .filter((slot) => {
      const t = new Date(slot.iso).getTime();
      return !booked.some((existing) => Math.abs(existing - t) < CONFLICT_WINDOW_MS);
    })
    .slice(0, Math.max(1, Math.min(limit, 10)));
}

function validText(value: string, min = 1): boolean {
  return value.trim().length >= min;
}

export async function bookRealtimeAppointment(
  input: BookAppointmentInput,
): Promise<BookAppointmentResult> {
  if (
    !validText(input.callerName) ||
    !validText(input.serviceDescription) ||
    !validText(input.address)
  ) {
    return {
      ok: false,
      reason: "missing_details",
      message:
        "Before booking, collect the caller's name, job address/postcode, and what they need help with.",
    };
  }

  const parsed = new Date(input.slotIso);
  if (!Number.isFinite(parsed.getTime()) || parsed.getTime() <= Date.now()) {
    return {
      ok: false,
      reason: "invalid_slot",
      message: "That appointment time is invalid or has already passed.",
    };
  }

  const currentSlots = await getAvailableAppointmentSlots(input.companyId, 10);
  const matched = currentSlots.find((slot) => slot.iso === parsed.toISOString());
  if (!matched) {
    return {
      ok: false,
      reason: "slot_unavailable",
      message: "That time is no longer available. Check the available appointments again.",
    };
  }

  const session = await pool.query<{ caller_phone: string }>(
    "SELECT caller_phone FROM voice_call_sessions WHERE call_sid=$1 AND company_id=$2 LIMIT 1",
    [input.callSid, input.companyId],
  );
  const verifiedPhone = session.rows[0]?.caller_phone?.trim();
  if (!verifiedPhone) {
    return {
      ok: false,
      reason: "missing_details",
      message: "The verified caller number is unavailable, so the appointment cannot be booked automatically.",
    };
  }

  const client = await pool.connect();
  let job: {
    id: number;
    title: string;
    contact_name: string;
    address: string | null;
    service_type: string;
    scheduled_at: Date;
    estimated_duration: number | null;
  } | null = null;

  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      [`crewon-slot:${input.companyId}:${matched.iso}`],
    );

    const conflict = await client.query<{ id: number }>(
      `SELECT id
         FROM jobs
        WHERE (company_id=$1 OR company_id IS NULL)
          AND status NOT IN ('cancelled','dismissed')
          AND ABS(EXTRACT(EPOCH FROM (scheduled_at - $2::timestamptz))) < $3
        LIMIT 1`,
      [input.companyId, matched.iso, CONFLICT_WINDOW_MS / 1000],
    );
    if (conflict.rows[0]) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        reason: "slot_unavailable",
        message: "That time was just taken. Check the available appointments again.",
      };
    }

    let contact = await client.query<{ id: number }>(
      "SELECT id FROM contacts WHERE company_id=$1 AND phone=$2 ORDER BY id LIMIT 1",
      [input.companyId, verifiedPhone],
    );
    if (!contact.rows[0]) {
      contact = await client.query<{ id: number }>(
        `INSERT INTO contacts(company_id,name,phone,address,type,notes)
         VALUES ($1,$2,$3,$4,'lead',$5)
         RETURNING id`,
        [
          input.companyId,
          input.callerName.trim().slice(0, 300),
          verifiedPhone,
          input.address.trim().slice(0, 1500),
          "Created during AI receptionist appointment booking",
        ],
      );
    }

    const inserted = await client.query<{
      id: number;
      title: string;
      contact_name: string;
      address: string | null;
      service_type: string;
      scheduled_at: Date;
      estimated_duration: number | null;
    }>(
      `INSERT INTO jobs(
         title,description,status,scheduled_at,estimated_duration,
         contact_name,contact_phone,contact_id,company_id,service_type,address,notes
       ) VALUES ($1,$2,'scheduled',$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id,title,contact_name,address,service_type,scheduled_at,estimated_duration`,
      [
        `Site Visit – ${input.callerName.trim().slice(0, 200)}`,
        `Booked by CREWON AI receptionist from call #${input.callId}.\n\n${input.serviceDescription.trim().slice(0, 3000)}`,
        matched.iso,
        SLOT_DURATION_MINUTES,
        input.callerName.trim().slice(0, 300),
        verifiedPhone,
        contact.rows[0].id,
        input.companyId,
        "Site Visit",
        input.address.trim().slice(0, 1500),
        "Confirmed against CREWON availability during the live call.",
      ],
    );
    job = inserted.rows[0];

    await client.query(
      "UPDATE calls SET job_id=$2,outcome='Booked',status='booked',updated_at=now() WHERE id=$1 AND company_id=$3",
      [input.callId, job.id, input.companyId],
    );
    await client.query(
      "UPDATE assistants SET jobs_booked=jobs_booked+1,updated_at=now() WHERE id=(SELECT assistant_id FROM voice_call_sessions WHERE call_sid=$1) AND company_id=$2",
      [input.callSid, input.companyId],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  if (!job) {
    return {
      ok: false,
      reason: "slot_unavailable",
      message: "The appointment could not be booked.",
    };
  }

  // Calendar sync is deliberately outside the booking transaction. A provider
  // outage must not undo a slot already reserved in CREWON.
  void createCalendarEvent({
    title: job.title,
    contactName: job.contact_name,
    address: job.address,
    serviceType: job.service_type,
    scheduledAt: job.scheduled_at,
    estimatedDuration: job.estimated_duration,
  })
    .then(async (eventId) => {
      if (eventId) {
        await pool.query(
          "UPDATE jobs SET google_event_id=$2,updated_at=now() WHERE id=$1 AND company_id=$3",
          [job!.id, eventId, input.companyId],
        );
      }
    })
    .catch((error) => {
      logger.warn({ err: error, jobId: job!.id }, "Calendar sync failed after realtime booking");
    });

  return { ok: true, jobId: job.id, iso: matched.iso, label: matched.label };
}
