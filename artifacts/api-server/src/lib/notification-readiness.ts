export async function emailNotificationReady(): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!key || !from || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) return false;
  try {
    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const payload = await response.json() as { data?: Array<{ name?: string; status?: string }> };
    const domain = from.split("@")[1]?.toLowerCase();
    return payload.data?.some(item => item.name?.toLowerCase() === domain && item.status === "verified") ?? false;
  } catch {
    return false;
  }
}

export async function smsNotificationReady(): Promise<boolean> {
  const account = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_SMS_FROM?.trim();
  if (!account || !token || !from || !/^\+[1-9]\d{7,14}$/.test(from)) return false;
  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(account)}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(from)}`,
      {
        headers: { Authorization: `Basic ${Buffer.from(`${account}:${token}`).toString("base64")}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) return false;
    const payload = await response.json() as { incoming_phone_numbers?: Array<{ phone_number?: string; capabilities?: { SMS?: boolean; sms?: boolean } }> };
    return payload.incoming_phone_numbers?.some(
      number => number.phone_number === from && (number.capabilities?.SMS === true || number.capabilities?.sms === true),
    ) ?? false;
  } catch {
    return false;
  }
}
