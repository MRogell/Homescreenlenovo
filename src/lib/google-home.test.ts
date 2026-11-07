import { describe, expect, it } from "vitest";
import { GOOGLE_HOME_PACKAGE, GOOGLE_HOME_WEB, googleHomeLinks } from "./google-home";

const ANDROID_TABLET = "Mozilla/5.0 (Linux; Android 14; Lenovo TB-Q706F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0";

describe("googleHomeLinks", () => {
  it("Android gets an app link that falls back to the web version", () => {
    const l = googleHomeLinks(ANDROID_TABLET);
    expect(l.app).toBeDefined();
    expect(l.app).toMatch(/^intent:/);
    expect(l.app).toContain(GOOGLE_HOME_PACKAGE);
    expect(l.app).toContain(`S.browser_fallback_url=${encodeURIComponent(GOOGLE_HOME_WEB)}`);
    expect(l.app!.endsWith(";end")).toBe(true);
    expect(l.web).toBe(GOOGLE_HOME_WEB);
  });
  it("iPhone and desktop get only the web version", () => {
    expect(googleHomeLinks(IPHONE)).toEqual({ web: GOOGLE_HOME_WEB });
    expect(googleHomeLinks(WINDOWS)).toEqual({ web: GOOGLE_HOME_WEB });
  });
  it("missing user agent gets only the web version", () => {
    expect(googleHomeLinks("")).toEqual({ web: GOOGLE_HOME_WEB });
    expect(googleHomeLinks(undefined)).toEqual({ web: GOOGLE_HOME_WEB });
  });
  it("web link is https", () => expect(GOOGLE_HOME_WEB.startsWith("https://")).toBe(true));
});
