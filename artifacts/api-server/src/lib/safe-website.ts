import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_HTML_BYTES = 1_000_000;
const MAX_TEXT_CHARS = 40_000;
const MAX_REDIRECTS = 3;

function blockedIpv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function blockedIpv6(ip: string): boolean {
  const value = ip.toLowerCase();
  return (
    value === "::" ||
    value === "::1" ||
    value.startsWith("fe8") ||
    value.startsWith("fe9") ||
    value.startsWith("fea") ||
    value.startsWith("feb") ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    value.startsWith("ff")
  );
}

function blockedIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return blockedIpv4(ip);
  if (family === 6) return blockedIpv6(ip);
  return true;
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Enter a valid public website URL.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http and https websites can be scanned.");
  }
  if (url.username || url.password) {
    throw new Error("Website URLs with embedded credentials are not supported.");
  }
  if (
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    url.hostname.endsWith(".local") ||
    url.hostname.endsWith(".internal")
  ) {
    throw new Error("Local or private network addresses cannot be scanned.");
  }
  if (url.port && !["80", "443"].includes(url.port)) {
    throw new Error("Only standard website ports can be scanned.");
  }

  if (isIP(url.hostname)) {
    if (blockedIp(url.hostname)) throw new Error("Private or reserved IP addresses cannot be scanned.");
  } else {
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((entry) => blockedIp(entry.address))) {
      throw new Error("The website resolved to a private or reserved network address.");
    }
  }
  return url;
}

async function readCappedBody(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length") || "0");
  if (declared && declared > MAX_HTML_BYTES) {
    throw new Error("The website page is too large to scan safely.");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    size += value.byteLength;
    if (size > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new Error("The website page is too large to scan safely.");
    }
    chunks.push(value);
  }

  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(all);
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_m, d: string) => {
      const n = Number(d);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
    });
}

function visibleText(html: string): string {
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h1|h2|h3|h4|section|article|header|footer|main)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(cleaned)
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

export async function fetchPublicWebsiteText(rawUrl: string): Promise<{
  requestedUrl: string;
  finalUrl: string;
  title: string | null;
  text: string;
}> {
  let url = await assertPublicUrl(rawUrl.trim());
  const requestedUrl = url.toString();

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
      headers: {
        "User-Agent": "CREWON-Business-Setup/1.0 (+website-profile-preview)",
        Accept: "text/html,application/xhtml+xml;q=0.9,text/plain;q=0.5",
      },
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (hop === MAX_REDIRECTS) throw new Error("The website redirected too many times.");
      const location = response.headers.get("location");
      if (!location) throw new Error("The website returned an invalid redirect.");
      url = await assertPublicUrl(new URL(location, url).toString());
      continue;
    }

    if (!response.ok) {
      throw new Error(`The website returned HTTP ${response.status}.`);
    }

    const type = (response.headers.get("content-type") || "").toLowerCase();
    if (type && !type.includes("text/html") && !type.includes("application/xhtml+xml") && !type.includes("text/plain")) {
      throw new Error("The supplied URL is not a readable website page.");
    }

    const html = await readCappedBody(response);
    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    const title = titleMatch ? decodeEntities(titleMatch[1]).replace(/\s+/g, " ").trim().slice(0, 300) : null;
    const text = visibleText(html);
    if (text.length < 80) throw new Error("The website did not contain enough readable business information.");
    return { requestedUrl, finalUrl: url.toString(), title, text };
  }

  throw new Error("The website could not be scanned.");
}
