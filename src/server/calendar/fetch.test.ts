import { describe, expect, it } from "vitest";
import { CalendarFetchError, fetchIcs, isBlockedAddress, normalizeCalendarUrl } from "./fetch";

const ICS = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR";
const code = async (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof CalendarFetchError ? e.code : "other"));
const publicLookup = async () => [{ address: "142.250.74.14", family: 4 }];

describe("normalizeCalendarUrl", () => {
  it("webcal:// becomes https:// and the address is trimmed", () => {
    expect(normalizeCalendarUrl("  webcal://p01-caldav.icloud.com/published/2/abc  ")).toBe("https://p01-caldav.icloud.com/published/2/abc");
    expect(normalizeCalendarUrl("https://calendar.google.com/calendar/ical/x%40gmail.com/private-abc/basic.ics")).toContain("basic.ics");
  });
  it("only https is accepted, no passwords in the address, and a sane length", () => {
    for (const bad of ["http://example.com/a.ics", "ftp://example.com/a.ics", "javascript:alert(1)", "file:///etc/passwd", "inte en adress", "", "https://user:pw@example.com/a.ics", `https://example.com/${"a".repeat(2100)}`]) {
      expect(() => normalizeCalendarUrl(bad), bad).toThrow(CalendarFetchError);
    }
  });
});

describe("isBlockedAddress", () => {
  it("private, loopback, link-local and special IPv4 ranges are blocked", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "224.0.0.1", "255.255.255.255"]) expect(isBlockedAddress(ip), ip).toBe(true);
  });
  it("public IPv4 addresses are allowed", () => {
    for (const ip of ["8.8.8.8", "142.250.74.14", "172.32.0.1", "172.15.0.1", "100.63.255.255"]) expect(isBlockedAddress(ip), ip).toBe(false);
  });
  it("IPv6: loopback, unique local, link-local and mapped private IPv4 are blocked", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.1.2.3"]) expect(isBlockedAddress(ip), ip).toBe(true);
    expect(isBlockedAddress("2a00:1450:4001:81b::200e")).toBe(false);
  });
});

describe("fetchIcs", () => {
  const ok = (body = ICS, headers: Record<string, string> = {}) => (async () => new Response(body, { status: 200, headers })) as unknown as typeof fetch;
  it("fetches the text of a public https address", async () => {
    expect(await fetchIcs("https://example.com/a.ics", { fetchFn: ok(), lookup: publicLookup })).toBe(ICS);
  });
  it("literal private addresses and local names are blocked without any request", async () => {
    let calls = 0;
    const fetchFn = (async () => { calls++; return new Response(ICS); }) as unknown as typeof fetch;
    for (const url of ["https://127.0.0.1/a.ics", "https://192.168.1.10/a.ics", "https://[::1]/a.ics", "https://localhost/a.ics", "https://printer.local/a.ics", "https://service.internal/a.ics", "https://169.254.169.254/latest/meta-data"]) {
      expect(await code(fetchIcs(url, { fetchFn, lookup: publicLookup })), url).toBe("blocked");
    }
    expect(calls).toBe(0);
  });
  it("a name that resolves to a private address is blocked", async () => {
    const lookup = async () => [{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.7", family: 4 }];
    expect(await code(fetchIcs("https://sneaky.example.com/a.ics", { fetchFn: ok(), lookup }))).toBe("blocked");
  });
  it("redirects are followed up to three times and each hop is checked again", async () => {
    let n = 0;
    const hops = ["https://b.example.com/x", "https://c.example.com/y"];
    const fetchFn = (async () => (n < hops.length ? new Response(null, { status: 302, headers: { location: hops[n++]! } }) : new Response(ICS))) as unknown as typeof fetch;
    expect(await fetchIcs("https://a.example.com/x", { fetchFn, lookup: publicLookup })).toBe(ICS);
    const toPrivate = (async () => new Response(null, { status: 302, headers: { location: "https://127.0.0.1/secret" } })) as unknown as typeof fetch;
    expect(await code(fetchIcs("https://a.example.com/x", { fetchFn: toPrivate, lookup: publicLookup }))).toBe("blocked");
    const loop = (async () => new Response(null, { status: 302, headers: { location: "https://a.example.com/x" } })) as unknown as typeof fetch;
    expect(await code(fetchIcs("https://a.example.com/x", { fetchFn: loop, lookup: publicLookup }))).toBe("failed");
  });
  it("an answer that is too large is refused, by header or by actual size", async () => {
    expect(await code(fetchIcs("https://example.com/a.ics", { fetchFn: ok(ICS, { "content-length": String(10 * 1024 * 1024) }), lookup: publicLookup }))).toBe("too_large");
    expect(await code(fetchIcs("https://example.com/a.ics", { fetchFn: ok("x".repeat(4 * 1024 * 1024)), lookup: publicLookup }))).toBe("too_large");
  });
  it("http errors, network errors and timeouts give failed", async () => {
    expect(await code(fetchIcs("https://example.com/a.ics", { fetchFn: (async () => new Response("nej", { status: 404 })) as unknown as typeof fetch, lookup: publicLookup }))).toBe("failed");
    expect(await code(fetchIcs("https://example.com/a.ics", { fetchFn: (async () => { throw new Error("nere"); }) as unknown as typeof fetch, lookup: publicLookup }))).toBe("failed");
    expect(await code(fetchIcs("https://example.com/a.ics", { fetchFn: ok(), lookup: async () => { throw new Error("ingen dns"); } }))).toBe("failed");
  });
  it("error messages never contain the address (it is a secret)", async () => {
    const e = (await fetchIcs("https://example.com/private-SECRET123/basic.ics", { fetchFn: (async () => new Response("", { status: 500 })) as unknown as typeof fetch, lookup: publicLookup }).catch((x) => x)) as Error;
    expect(e.message).not.toContain("SECRET123");
  });
});
