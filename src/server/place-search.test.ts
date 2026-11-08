import { describe, expect, it } from "vitest";
import { PlaceSearchError, searchPlaces } from "./place-search";

function fake(status: number, body: unknown) {
  const calls: string[] = [];
  const fetchFn = (async (url: string) => { calls.push(url); return new Response(typeof body === "string" ? body : JSON.stringify(body), { status }); }) as unknown as typeof fetch;
  return { fetchFn, calls };
}
const RES = { results: [
  { name: "Umeå", latitude: 63.82842, longitude: 20.25972, country: "Sverige", admin1: "Västerbotten" },
  { name: "Umeå", latitude: 12.5, longitude: 99.5, country: "Land", admin1: "" },
  { name: "Trasig", latitude: "x", longitude: 1 },
  { name: "", latitude: 1, longitude: 1 },
  { name: "Utanför", latitude: 95, longitude: 1, country: "Y" },
] };

describe("searchPlaces", () => {
  it("asks Open-Meteo's geocoding in Swedish for a handful of hits", async () => {
    const f = fake(200, RES);
    await searchPlaces("Umeå", f.fetchFn);
    const u = new URL(f.calls[0]!);
    expect(u.origin + u.pathname).toBe("https://geocoding-api.open-meteo.com/v1/search");
    expect(u.searchParams.get("name")).toBe("Umeå");
    expect(u.searchParams.get("language")).toBe("sv");
    expect(u.searchParams.get("count")).toBe("5");
  });
  it("maps valid hits with region and country, and drops broken ones", async () => {
    const r = await searchPlaces("Umeå", fake(200, RES).fetchFn);
    expect(r).toEqual([
      { name: "Umeå", region: "Västerbotten, Sverige", lat: 63.8284, lon: 20.2597 },
      { name: "Umeå", region: "Land", lat: 12.5, lon: 99.5 },
    ]);
  });
  it("no hits or an odd answer gives an empty list", async () => {
    expect(await searchPlaces("Xyzzy", fake(200, {}).fetchFn)).toEqual([]);
    expect(await searchPlaces("Xyzzy", fake(200, { results: "x" }).fetchFn)).toEqual([]);
  });
  it("too short, too long or blank searches are refused without a call", async () => {
    const f = fake(200, RES);
    for (const q of ["", " ", "U", "x".repeat(61)]) await expect(searchPlaces(q, f.fetchFn)).rejects.toMatchObject({ code: "invalid" });
    expect(f.calls).toHaveLength(0);
  });
  it("trims the search and encodes it safely", async () => {
    const f = fake(200, RES);
    await searchPlaces("  Sala & Co?  ", f.fetchFn);
    expect(new URL(f.calls[0]!).searchParams.get("name")).toBe("Sala & Co?");
  });
  it("service errors, network errors and garbage give a failed error", async () => {
    for (const fetchFn of [fake(500, {}).fetchFn, fake(200, "<html>").fetchFn, (async () => { throw new Error("nere"); }) as unknown as typeof fetch]) {
      const e = await searchPlaces("Umeå", fetchFn).catch((x) => x);
      expect(e).toBeInstanceOf(PlaceSearchError);
      expect(e.code).toBe("failed");
    }
  });
});
