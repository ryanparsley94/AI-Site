import { ReplitConnectors } from "@replit/connectors-sdk";

export type DeliveryResult = {
  deliveryStatus: "queued" | "sent" | "delivered" | "failed" | "unknown";
  providerMessageId?: string;
  deliveryError?: string | null;
};

function smsSender(): string | undefined {
  return process.env.TWILIO_SMS_FROM || process.env.TWILIO_PHONE_NUMBER;
}

async function providerConnected(provider: "twilio" | "resend"): Promise<boolean> {
  if (provider === "twilio" ? process.env.TWILIO_AUTH_TOKEN : process.env.RESEND_API_KEY) return true;
  try {
    const connections = await new ReplitConnectors().listConnections({ connector_names: provider });
    return connections.length === 1;
  } catch { return false; }
}

export async function validateMarketingDelivery(channel: string, phone: string | null, email: string | null, message: string | null): Promise<string | null> {
  if (!message?.trim() || message === "__FAILED__") return "Write a message before sending.";
  if (channel === "sms") {
    if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone)) return "Enter the client's phone in international format, for example +447700900123.";
    if (!process.env.TWILIO_ACCOUNT_SID || !smsSender() || !await providerConnected("twilio")) return "SMS is not configured. Configure Twilio and set the account SID and sending number before retrying.";
  } else if (channel === "email") {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid client email address.";
    if (!process.env.RESEND_FROM_EMAIL || !await providerConnected("resend")) return "Email is not configured. Connect Resend and set a verified sending address before retrying.";
  } else return "Choose SMS or email.";
  return null;
}

async function providerRequest(provider: "twilio" | "resend", path: string, init: RequestInit): Promise<Response> {
  const direct = provider === "twilio" ? process.env.TWILIO_AUTH_TOKEN : process.env.RESEND_API_KEY;
  if (!direct) {
    // The managed connector supplies auth; never retrieve or persist its credential.
    return new ReplitConnectors().createProxyFetch(provider)(path, init);
  }
  const authorization = provider === "twilio"
    ? `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${direct}`).toString("base64")}`
    : `Bearer ${direct}`;
  return fetch(`${provider === "twilio" ? "https://api.twilio.com" : "https://api.resend.com"}${path}`, {
    ...init, headers: { ...init.headers, Authorization: authorization },
  });
}

function smsStatus(status: string): DeliveryResult["deliveryStatus"] {
  if (status === "delivered" || status === "read") return "delivered";
  if (status === "failed" || status === "undelivered" || status === "canceled") return "failed";
  if (status === "sent") return "sent";
  return "queued";
}

export async function sendMarketingMessage(draft: {
  id: number; deliveryVersion: number; channel: string; clientPhone: string | null; clientEmail: string | null; companyName: string; type: string;
}, message: string): Promise<DeliveryResult> {
  try {
    if (draft.channel === "email") {
      const response = await providerRequest("resend", "/emails", {
        method: "POST", signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/json", "Idempotency-Key": `marketing-draft-${draft.id}-${draft.deliveryVersion}` },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL!,
          to: [draft.clientEmail!],
          subject: `${draft.type === "review_request" ? "Thank you" : "Following up"} from ${draft.companyName || "our team"}`,
          text: message,
        }),
      });
      if (!response.ok) {
        // A server error may occur after acceptance. Only definite rejections are retryable.
        const code = response.status;
        return code < 500 && code !== 408
          ? { deliveryStatus: "failed", deliveryError: "Resend rejected this email. Check the recipient and verified sender, then retry." }
          : { deliveryStatus: "unknown", deliveryError: "Email acceptance could not be confirmed. Check Resend before sending again to avoid duplicates." };
      }
      const data = await response.json() as { id?: string };
      if (!data.id) return { deliveryStatus: "unknown", deliveryError: "No email receipt was returned. Check Resend before sending again." };
      return { deliveryStatus: "sent", providerMessageId: data.id };
    }
    const response = await providerRequest("twilio", `/2010-04-01/Accounts/${encodeURIComponent(process.env.TWILIO_ACCOUNT_SID!)}/Messages.json`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: draft.clientPhone!, From: smsSender()!, Body: message }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      return response.status < 500 && response.status !== 408
        ? { deliveryStatus: "failed", deliveryError: `Twilio rejected this SMS (HTTP ${response.status}). Check the phone and sending number, then retry.` }
        : { deliveryStatus: "unknown", deliveryError: "SMS acceptance could not be confirmed. Check Twilio before sending again to avoid duplicates." };
    }
    const data = await response.json() as { sid?: string; status?: string };
    if (!data.sid) return { deliveryStatus: "unknown", deliveryError: "No SMS receipt was returned. Check Twilio before sending again." };
    const status = smsStatus(data.status ?? "queued");
    return { deliveryStatus: status, providerMessageId: data.sid, deliveryError: status === "failed" ? "Twilio could not deliver this SMS. Check the phone number and retry." : null };
  } catch {
    return { deliveryStatus: "unknown", deliveryError: "The delivery request timed out or lost connection. It may have been sent. Check the provider before sending again." };
  }
}

export async function checkMarketingDelivery(channel: string, id: string): Promise<DeliveryResult | null> {
  try {
    if (channel === "email") {
      const response = await providerRequest("resend", `/emails/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return null;
      const data = await response.json() as { last_event?: string };
      const event = data.last_event;
      if (event === "delivered" || event === "opened" || event === "clicked") return { deliveryStatus: "delivered", deliveryError: null };
      if (event === "bounced" || event === "failed" || event === "canceled") return { deliveryStatus: "failed", deliveryError: "Email delivery failed. Check the client's address before retrying." };
      return null;
    }
    if (!process.env.TWILIO_ACCOUNT_SID) return null;
    const response = await providerRequest("twilio", `/2010-04-01/Accounts/${encodeURIComponent(process.env.TWILIO_ACCOUNT_SID)}/Messages/${encodeURIComponent(id)}.json`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const data = await response.json() as { status: string };
    const status = smsStatus(data.status);
    return { deliveryStatus: status, deliveryError: status === "failed" ? "SMS delivery failed. Check the client's number before retrying." : null };
  } catch { return null; }
}
