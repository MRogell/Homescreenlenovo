// Open-Meteos öppna ortssökning (samma leverantör som vädret): gratis och utan nyckel.
const GEOCODING = "https://geocoding-api.open-meteo.com/v1/search";

export interface PlaceHit { name: string; region: string; lat: number; lon: number }

export class PlaceSearchError extends Error {
  constructor(public code: "invalid" | "failed") {
    super(code === "invalid" ? "Skriv minst två tecken." : "Ortssökningen svarade inte. Försök igen strax.");
    this.name = "PlaceSearchError";
  }
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Upp till fem träffar för en ort. Träffar med trasiga eller omöjliga koordinater tas bort. */
export async function searchPlaces(query: string, fetchFn: typeof fetch = fetch): Promise<PlaceHit[]> {
  const q = query.trim();
  if (q.length < 2 || q.length > 60) throw new PlaceSearchError("invalid");
  const url = new URL(GEOCODING);
  url.searchParams.set("name", q);
  url.searchParams.set("count", "5");
  url.searchParams.set("language", "sv");
  url.searchParams.set("format", "json");
  let json: unknown;
  try {
    const res = await fetchFn(url.toString(), { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error("status");
    json = await res.json();
  } catch {
    throw new PlaceSearchError("failed");
  }
  const results = (json as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return [];
  return results.flatMap((r): PlaceHit[] => {
    const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    const name = str(o.name), lat = num(o.latitude), lon = num(o.longitude);
    if (!name || name.length > 80 || lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return [];
    return [{ name, region: [str(o.admin1), str(o.country)].filter(Boolean).join(", "), lat: round4(lat), lon: round4(lon) }];
  });
}
