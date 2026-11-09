import { describe, expect, it } from "vitest";
import { classifySupport, urlBase64ToBytes, type Env } from "./push-client";

const base: Env = { hasServiceWorker: true, hasPushManager: true, hasNotification: true, isIOS: false, standalone: false, permission: "default" };

describe("classifySupport", () => {
  it("fungerar i en vanlig webbläsare", () => expect(classifySupport(base)).toBe("ready"));
  it("iPhone i Safari-fliken: be om att lägga till på hemskärmen (även om API:erna saknas där)", () => {
    expect(classifySupport({ ...base, isIOS: true, hasPushManager: false, hasNotification: false })).toBe("ios-install");
  });
  it("iPhone som installerad app fungerar", () => expect(classifySupport({ ...base, isIOS: true, standalone: true })).toBe("ready"));
  it("saknat stöd", () => {
    expect(classifySupport({ ...base, hasPushManager: false })).toBe("unsupported");
    expect(classifySupport({ ...base, hasServiceWorker: false })).toBe("unsupported");
    expect(classifySupport({ ...base, hasNotification: false, permission: null })).toBe("unsupported");
  });
  it("nekad behörighet", () => expect(classifySupport({ ...base, permission: "denied" })).toBe("denied"));
});

describe("urlBase64ToBytes", () => {
  it("tolkar base64url med - och _ och utan fyllnad", () => {
    expect([...urlBase64ToBytes("-_8")]).toEqual([251, 255]);
    expect([...urlBase64ToBytes("AQID")]).toEqual([1, 2, 3]);
  });
  it("65 byte lång publik nyckel blir 65 byte", () => {
    const key = Buffer.from(Uint8Array.from({ length: 65 }, (_, i) => i)).toString("base64url");
    expect(urlBase64ToBytes(key).length).toBe(65);
  });
});
