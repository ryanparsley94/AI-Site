import { Router } from "express";
import { pool } from "@workspace/db";
import { CANONICAL_VOICE_PUBLIC_BASE_URL, getVoicePublicBaseUrl } from "../lib/voice-config";

const router = Router();
const configuredNumber = process.env.TWILIO_PHONE_NUMBER?.trim() ?? "";

type TwilioIncomingNumber = {
  sid?: string;
  phone_number?: string;
  capabilities?: { voice?: boolean };
  voice_url?: string;
  voice_method?: string;
  status_callback?: string;
  status_callback_method?: string;
};

function maskNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? `••••${digits.slice(-4)}` : "configured";
}

function normalizeNumber(value: string): string | null {
  const compact = value.replace(/[\s().-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null;
}

router.post("/telephony/readiness", async (_req, res): Promise<void> => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const openAiKey = process.env.OPENAI_API_KEY;
  const number = normalizeNumber(configuredNumber);
  const base = getVoicePublicBaseUrl();
  const expectedVoiceUrl = base ? new URL("/api/voice/incoming", base).toString() : null;
  const expectedStatusUrl = base ? new URL("/api/voice/status", base).toString() : null;

  const result: Record<string, unknown> = {
    configuredNumber: configuredNumber ? maskNumber(configuredNumber) : null,
    accountAuthentication: "not_checked",
    openAiAuthentication: "not_checked",
    numberExists: false,
    voiceCapable: false,
    voiceWebhookMatches: false,
    statusCallbackMatches: false,
    mapping: "not_checked",
    publicVoiceUrlValid: Boolean(base),
    expectedVoiceWebhook: expectedVoiceUrl,
    expectedStatusCallback: expectedStatusUrl,
    liveInboundReady: false,
    blockers: [] as string[],
  };
  const blockers = result.blockers as string[];

  if (!accountSid || !authToken) blockers.push("Twilio account authentication secrets are not configured.");
  if (!openAiKey) blockers.push("OPENAI_API_KEY is not configured.");
  if (!configuredNumber || !number) blockers.push("TWILIO_PHONE_NUMBER is missing or is not a valid international number.");
  if (!base) blockers.push(`VOICE_PUBLIC_BASE_URL must resolve to ${CANONICAL_VOICE_PUBLIC_BASE_URL}.`);

  let providerNumber: TwilioIncomingNumber | null = null;
  if (accountSid && authToken && number && base) {
    try {
      const endpoint = new URL(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/IncomingPhoneNumbers.json`,
      );
      endpoint.searchParams.set("PhoneNumber", number);
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (response.status === 401 || response.status === 403) {
        result.accountAuthentication = "failed";
        blockers.push("Twilio rejected the configured account credentials.");
      } else if (!response.ok) {
        result.accountAuthentication = "provider_error";
        blockers.push(`Twilio phone-number lookup returned HTTP ${response.status}.`);
      } else {
        result.accountAuthentication = "verified";
        const body = await response.json() as { incoming_phone_numbers?: TwilioIncomingNumber[] };
        const found = (body.incoming_phone_numbers ?? []).filter(
          (entry) => normalizeNumber(entry.phone_number ?? "") === number,
        );
        if (found.length === 1) {
          providerNumber = found[0];
          result.numberExists = true;
          result.voiceCapable = providerNumber.capabilities?.voice === true;
          result.voiceWebhookMatches =
            providerNumber.voice_url === expectedVoiceUrl && providerNumber.voice_method?.toUpperCase() === "POST";
          result.statusCallbackMatches =
            providerNumber.status_callback === expectedStatusUrl &&
            providerNumber.status_callback_method?.toUpperCase() === "POST";
          if (!result.voiceCapable) blockers.push("The configured Twilio number is not voice-capable.");
          if (!result.voiceWebhookMatches) blockers.push("The number's inbound voice webhook is not the expected CREWON endpoint using POST.");
          if (!result.statusCallbackMatches) blockers.push("The number's status callback is not the expected CREWON endpoint using POST.");
        } else {
          blockers.push(found.length ? "Twilio returned an ambiguous number match." : "The configured number was not found in the authenticated Twilio account.");
        }
      }
    } catch {
      result.accountAuthentication = "unavailable";
      blockers.push("Twilio could not be reached or the readiness request timed out.");
    }
  }

  const realtimeEnabled =
    process.env.VOICE_REALTIME_ENABLED === "true" && Boolean(openAiKey);
  if (!realtimeEnabled) blockers.push("OpenAI Realtime is not fully configured.");
  if (openAiKey && realtimeEnabled) {
    try {
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${openAiKey}`, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      result.openAiAuthentication = response.ok ? "verified" :
        response.status === 401 || response.status === 403 ? "failed" : "provider_error";
      if (!response.ok) blockers.push(response.status === 401 || response.status === 403
        ? "OpenAI rejected the configured API credential."
        : `OpenAI credential check returned HTTP ${response.status}.`);
    } catch {
      result.openAiAuthentication = "unavailable";
      blockers.push("OpenAI could not be reached or the credential check timed out.");
    }
  }

  // Restore only from positive provider evidence and unique Parsley company/assistant matches.
  if (providerNumber && providerNumber.capabilities?.voice === true && number) {
    try {
      const companies = await pool.query<{ id: number; name: string }>(
        "SELECT id,name FROM companies WHERE lower(name)='parsley electrical ltd' ORDER BY id",
      );
      if (companies.rows.length !== 1) {
        result.mapping = "not_restored_company_not_unique";
        blockers.push("Could not safely identify exactly one Parsley Electrical Ltd company.");
      } else {
        const assistants = await pool.query<{ id: number; name: string }>(
          `SELECT id,name FROM assistants
            WHERE company_id=$1 AND active=true AND type='phone'
            ORDER BY id`,
          [companies.rows[0].id],
        );
        if (assistants.rows.length !== 1) {
          result.mapping = "not_restored_assistant_not_unique";
          blockers.push("Could not safely identify exactly one active Parsley phone assistant.");
        } else {
          const existing = await pool.query<{ company_id: number; assistant_id: number | null }>(
            "SELECT company_id,assistant_id FROM phone_numbers WHERE phone_number=$1 LIMIT 1",
            [number],
          );
          if (existing.rows[0] &&
              (existing.rows[0].company_id !== companies.rows[0].id ||
               (existing.rows[0].assistant_id !== null && existing.rows[0].assistant_id !== assistants.rows[0].id))) {
            result.mapping = "conflict_not_overwritten";
            blockers.push("An existing number mapping points elsewhere; it was not changed.");
          } else {
            await pool.query(
              `INSERT INTO phone_numbers(company_id,assistant_id,provider,provider_sid,phone_number,label,active)
               VALUES ($1,$2,'twilio',$3,$4,'Parsley Electrical inbound',true)
               ON CONFLICT (phone_number) DO UPDATE
                 SET assistant_id=EXCLUDED.assistant_id,
                     provider_sid=COALESCE(EXCLUDED.provider_sid,phone_numbers.provider_sid),
                     label=COALESCE(phone_numbers.label,EXCLUDED.label),
                     active=true,
                     updated_at=now()
                 WHERE phone_numbers.company_id=EXCLUDED.company_id
                   AND (phone_numbers.assistant_id IS NULL OR phone_numbers.assistant_id=EXCLUDED.assistant_id)`,
              [companies.rows[0].id, assistants.rows[0].id, providerNumber.sid ?? null, number],
            );
            const verifiedMapping = await pool.query(
              "SELECT id FROM phone_numbers WHERE phone_number=$1 AND company_id=$2 AND assistant_id=$3 AND active=true",
              [number, companies.rows[0].id, assistants.rows[0].id],
            );
            result.mapping = verifiedMapping.rows.length === 1 ? "verified_or_restored" : "conflict_not_overwritten";
            if (!verifiedMapping.rows.length) blockers.push("The explicit phone-number mapping could not be safely restored.");
          }
        }
      }
    } catch {
      result.mapping = "database_error";
      blockers.push("The number was verified with Twilio, but the CREWON mapping check failed.");
    }
  }

  const mappingVerified = result.mapping === "verified_or_restored";
  const callRouteReady = Boolean(
    result.accountAuthentication === "verified" &&
    result.numberExists &&
    result.voiceCapable &&
    result.voiceWebhookMatches &&
    result.statusCallbackMatches &&
    mappingVerified &&
    result.openAiAuthentication === "verified" &&
    realtimeEnabled &&
    base,
  );
  result.liveInboundReady = callRouteReady;
  res.setHeader("Cache-Control", "no-store");
  res.json(result);
});

export default router;
