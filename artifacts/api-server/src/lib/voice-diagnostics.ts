import { pool } from "@workspace/db";
import { logger } from "./logger";

export type VoiceDiagnosticType =
  | "call_received"
  | "realtime_session_started"
  | "transcript_saved"
  | "transcript_persist_failed"
  | "booking_attempt"
  | "booking_result"
  | "contact_job_linkage"
  | "finalisation_succeeded"
  | "finalisation_failed"
  | "notification_result"
  | "technical_error";

type SafeDetail = string | number | boolean | null;

/**
 * Persist operational call events without transcript text, audio, phone numbers,
 * credentials, or provider error messages. Details are restricted to
 * caller-selected, non-sensitive status/count/id fields at each call site.
 */
export async function recordVoiceDiagnostic(input: {
  callSid: string;
  callId?: number | null;
  companyId?: number | null;
  eventType: VoiceDiagnosticType;
  summary: string;
  details?: Record<string, SafeDetail>;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO voice_call_diagnostics
         (call_sid,call_id,company_id,event_type,summary,details)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
      [
        input.callSid,
        input.callId ?? null,
        input.companyId ?? null,
        input.eventType,
        input.summary.slice(0, 180),
        JSON.stringify(input.details ?? {}),
      ],
    );
  } catch (error) {
    // Diagnostics must never interrupt a live caller or mask the underlying flow.
    logger.warn({ err: error, eventType: input.eventType }, "Could not persist voice call diagnostic");
  }
}
