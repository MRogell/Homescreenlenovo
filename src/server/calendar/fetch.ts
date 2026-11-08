import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export type CalendarFetchErrorCode = "invalid_url" | "blocked" | "failed" | "too_large";

const MESSAGES: Record<CalendarFetchErrorCode, string> = {
  invalid_url: "Adressen måste vara en https-länk till en iCal-kalender (eller webcal://).",
  blocked: "Den adressen går inte att använda.",
  failed: "Det gick inte att hämta kalendern. Kontrollera länken.",
  too_large: "Kalendern är för stor.",
};

/** Felmeddelandena nämner aldrig adressen: den är en hemlighet. */
export class CalendarFetchError extends Error {
  constructor(public code: CalendarFetchErrorCode) {
    super(MESSAGES[code]);
    this.name = "CalendarFetchError";
  }
}

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8_000;

/** webcal:// blir https://. Bara https, ingen inloggning i adressen och rimlig längd. */
export function normalizeCalendarUrl(input: string): string {
  const raw = input.trim().replace(/^webcal:\/\//i, "https://");
  if (raw.length === 0 || raw.length > 2000) throw new CalendarFetchError("invalid_url");
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new CalendarFetchError("invalid_url");
  }
  if (u.protocol !== "https:" || u.username || u.password) throw new CalendarFetchError("invalid_url");
  return u.toString();
}

function ipv4Blocked(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0);
}

/** Adresser som aldrig får hämtas: hemmanätet, loopback, länklokala och särskilda intervall. */
export function isBlockedAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return ipv4Blocked(ip);
  if (v === 6) {
    const s = ip.toLowerCase();
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return ipv4Blocked(mapped[1]!);
    return s === "::" || s === "::1" || s.startsWith("fc") || s.startsWith("fd") || /^fe[89ab]/.test(s);
  }
  return true; // inget giltigt IP-nummer
}

function blockedName(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan") || h.endsWith(".home.arpa");
}

export type Lookup = (host: string) => Promise<{ address: string; family: number }[]>;
const defaultLookup: Lookup = (host) => dnsLookup(host, { all: true });

async function assertPublic(url: string, lookup: Lookup): Promise<void> {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  if (blockedName(host)) throw new CalendarFetchError("blocked");
  if (isIP(host)) {
    if (isBlockedAddress(host)) throw new CalendarFetchError("blocked");
    return;
  }
  let addrs: { address: string; family: number }[];
  try {
    addrs = await lookup(host);
  } catch {
    throw new CalendarFetchError("failed");
  }
  if (addrs.length === 0 || addrs.some((a) => isBlockedAddress(a.address))) throw new CalendarFetchError("blocked");
}

async function readLimited(res: Response): Promise<string> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) throw new CalendarFetchError("too_large");
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => {});
      throw new CalendarFetchError("too_large");
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

/** Hämtar kalendertexten. Varje adress (även efter omdirigering) kontrolleras mot hemmanät och interna adresser. */
export async function fetchIcs(url: string, deps: { fetchFn?: typeof fetch; lookup?: Lookup } = {}): Promise<string> {
  const fetchFn = deps.fetchFn ?? fetch;
  const lookup = deps.lookup ?? defaultLookup;
  let current = normalizeCalendarUrl(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(current, lookup);
    let res: Response;
    try {
      res = await fetchFn(current, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: "text/calendar, text/plain, */*" } });
    } catch {
      throw new CalendarFetchError("failed");
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new CalendarFetchError("failed");
      try {
        current = normalizeCalendarUrl(new URL(loc, current).toString());
      } catch (e) {
        throw e instanceof CalendarFetchError ? e : new CalendarFetchError("failed");
      }
      continue;
    }
    if (!res.ok) throw new CalendarFetchError("failed");
    try {
      return await readLimited(res);
    } catch (e) {
      throw e instanceof CalendarFetchError ? e : new CalendarFetchError("failed");
    }
  }
  throw new CalendarFetchError("failed");
}
