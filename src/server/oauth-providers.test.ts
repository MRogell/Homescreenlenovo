import { describe, expect, it } from "vitest";
import { getOAuthConfig } from "./oauth-providers";

describe("getOAuthConfig scopes", () => {
  it("spotify asks to read and to control playback", () => {
    const scopes = getOAuthConfig("spotify")!.scope.split(" ");
    expect(scopes).toEqual(expect.arrayContaining(["user-read-playback-state", "user-read-recently-played", "user-modify-playback-state"]));
  });
  it("sonos scope is unchanged", () => expect(getOAuthConfig("sonos")!.scope).toBe("playback-control-all"));
});
