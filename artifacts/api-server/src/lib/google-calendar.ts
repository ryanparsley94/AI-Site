/**
 * Google Calendar API helpers — create/update/delete calendar events for jobs.
 */
import { logger } from "./logger";
import { getAccessToken } from "./oauth-tokens";

const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";
const CALENDAR_ID = "primary";

export type CalendarBusyInterval = {
  startMs: number;
  endMs: number;
};

interface CalendarEventBody {
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location?: string;
}

/** Build the event payload from a job row. */
function buildEventBody(job: {
  title: string;
  contactName: string;
  address?: string | null;
  serviceType: string;
  scheduledAt: Date | string;
  estimatedDuration?: number | null;
}): CalendarEventBody {
  const startMs = new Date(job.scheduledAt).getTime();
  const durationMs = (job.estimatedDuration ?? 60) * 60 * 1000;
  const endMs = startMs + durationMs;

  return {
    summary: job.title,
    description: `Customer: ${job.contactName}\nService: ${job.serviceType}${job.address ? `\nAddress: ${job.address}` : ""}`,
    location: job.address ?? undefined,
    start: { dateTime: new Date(startMs).toISOString(), timeZone: "UTC" },
    end: { dateTime: new Date(endMs).toISOString(), timeZone: "UTC" },
  };
}

/**
 * Read busy periods from the connected primary Google Calendar.
 * Manual calendar events must be considered before the receptionist offers a slot.
 */
export async function getCalendarBusyIntervals(
  start: Date,
  end: Date,
): Promise<CalendarBusyInterval[]> {
  const token = await getAccessToken("google");
  if (!token) return [];

  try {
    const params = new URLSearchParams({
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "2500",
    });
    const res = await fetch(
      `${CALENDAR_BASE}/calendars/${encodeURIComponent(CALENDAR_ID)}/events?${params}`,
      { headers: { Authorization: `Bearer ${token.accessToken}` } },
    );
    if (!res.ok) {
      logger.error(
        { status: res.status, body: await res.text() },
        "Google Calendar busy-time lookup failed",
      );
      return [];
    }

    const data = (await res.json()) as {
      items?: Array<{
        status?: string;
        transparency?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
      }>;
    };

    return (data.items ?? [])
      .filter((event) => event.status !== "cancelled" && event.transparency !== "transparent")
      .map((event) => {
        const startValue = event.start?.dateTime ?? event.start?.date;
        const endValue = event.end?.dateTime ?? event.end?.date;
        const startMs = startValue ? new Date(startValue).getTime() : NaN;
        const endMs = endValue ? new Date(endValue).getTime() : NaN;
        return { startMs, endMs };
      })
      .filter((event) =>
        Number.isFinite(event.startMs) &&
        Number.isFinite(event.endMs) &&
        event.endMs > event.startMs
      );
  } catch (err) {
    logger.error({ err }, "Google Calendar busy-time lookup error");
    return [];
  }
}

/** Create a Google Calendar event. Returns the event ID on success. */
export async function createCalendarEvent(job: {
  title: string;
  contactName: string;
  address?: string | null;
  serviceType: string;
  scheduledAt: Date | string;
  estimatedDuration?: number | null;
}): Promise<string | null> {
  const token = await getAccessToken("google");
  if (!token) return null;

  try {
    const res = await fetch(`${CALENDAR_BASE}/calendars/${CALENDAR_ID}/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildEventBody(job)),
    });
    if (!res.ok) {
      logger.error({ status: res.status, body: await res.text() }, "Google Calendar create event failed");
      return null;
    }
    const data = (await res.json()) as { id: string };
    return data.id;
  } catch (err) {
    logger.error({ err }, "Google Calendar create event error");
    return null;
  }
}

/** Update an existing Google Calendar event. */
export async function updateCalendarEvent(eventId: string, job: {
  title: string;
  contactName: string;
  address?: string | null;
  serviceType: string;
  scheduledAt: Date | string;
  estimatedDuration?: number | null;
}): Promise<void> {
  const token = await getAccessToken("google");
  if (!token) return;

  try {
    const res = await fetch(`${CALENDAR_BASE}/calendars/${CALENDAR_ID}/events/${eventId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildEventBody(job)),
    });
    if (!res.ok) {
      logger.error({ status: res.status, body: await res.text() }, "Google Calendar update event failed");
    }
  } catch (err) {
    logger.error({ err }, "Google Calendar update event error");
  }
}

/** Delete a Google Calendar event. */
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const token = await getAccessToken("google");
  if (!token) return;

  try {
    const res = await fetch(`${CALENDAR_BASE}/calendars/${CALENDAR_ID}/events/${eventId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token.accessToken}` },
    });
    // 404 is fine (already deleted), 204 is success
    if (!res.ok && res.status !== 404) {
      logger.error({ status: res.status }, "Google Calendar delete event failed");
    }
  } catch (err) {
    logger.error({ err }, "Google Calendar delete event error");
  }
}
