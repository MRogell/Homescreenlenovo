import { z } from "zod";

// SMHI:s konsekvensbaserade varningar (öppen data). Villkor: informationen är fri att använda men får inte ändras,
// SMHI ska alltid anges som källa och tidsangivelserna ska visas. Texterna nedan förs därför vidare oförändrade.
// https://www.smhi.se/data/om-smhis-data/villkor-for-anvandning
export const SMHI_WARNINGS_URL = "https://opendata-download-warnings.smhi.se/ibww/api/version/1/warning.json";

export const warningSchema = z.object({
  id: z.number(),
  level: z.enum(["yellow", "orange", "red"]),
  /** SMHI:s egen nivåtext ("Gul", "Orange", "Röd"). */
  levelText: z.string(),
  /** SMHI:s egen rubrik, t.ex. "Vind på kalfjället". Oförändrad. */
  title: z.string(),
  area: z.string(),
  start: z.string().nullable(),
  end: z.string().nullable(),
});
export type Warning = z.infer<typeof warningSchema>;

type Ring = number[][];
const isRing = (v: unknown): v is Ring => Array.isArray(v) && v.every((p) => Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "number");

/** Ray casting. Koordinater är [lon, lat] som i GeoJSON. */
function inRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number], [xj, yj] = ring[j] as [number, number];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Punkten ligger i polygonen (första ringen) men inte i något hål (övriga ringar). */
function inPolygon(lon: number, lat: number, rings: unknown): boolean {
  if (!Array.isArray(rings) || rings.length === 0 || !rings.every(isRing)) return false;
  const [outer, ...holes] = rings as Ring[];
  return inRing(lon, lat, outer!) && !holes.some((h) => inRing(lon, lat, h));
}

/** Ligger platsen inom varningsområdet (Polygon eller MultiPolygon)? Trasig geometri räknas som utanför. */
export function covers(feature: unknown, lat: number, lon: number): boolean {
  const g = (feature as { geometry?: { type?: unknown; coordinates?: unknown } } | null)?.geometry;
  if (!g || !Array.isArray(g.coordinates)) return false;
  if (g.type === "Polygon") return inPolygon(lon, lat, g.coordinates);
  if (g.type === "MultiPolygon") return g.coordinates.some((p) => inPolygon(lon, lat, p));
  return false;
}

const LEVELS: Record<string, Warning["level"]> = { YELLOW: "yellow", ORANGE: "orange", RED: "red" };
const RANK: Record<Warning["level"], number> = { red: 3, orange: 2, yellow: 1 };
/** Så långt fram räknas en varning som aktuell (SMHI utfärdar ibland i förväg). */
const LOOKAHEAD_MS = 48 * 3_600_000;

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const iso = (v: unknown): string | null => {
  const s = str(v);
  return s && !Number.isNaN(new Date(s).getTime()) ? s : null;
};

/**
 * Gula, orange och röda varningar som gäller platsen nu eller de närmaste dygnen, allvarligast först.
 * "Meddelande" (t.ex. risk för vattenbrist) är ingen varning och tas inte med. Trasiga poster hoppas över.
 */
export function parseWarnings(json: unknown, place: { lat: number; lon: number }, now: Date): Warning[] {
  if (!Array.isArray(json)) throw new Error("SMHI gav ett oväntat svar");
  const out: Warning[] = [];
  for (const w of json) {
    const event = rec(rec(w).event);
    const areas = rec(w).warningAreas;
    if (!Array.isArray(areas)) continue;
    for (const raw of areas) {
      const a = rec(raw);
      const level = LEVELS[str(rec(a.warningLevel).code) ?? ""];
      const title = str(rec(a.eventDescription).sv) ?? str(rec(event).sv);
      const id = a.id;
      if (!level || !title || typeof id !== "number" || !covers(a.area, place.lat, place.lon)) continue;
      const start = iso(a.approximateStart), end = iso(a.approximateEnd);
      if (end && new Date(end).getTime() <= now.getTime()) continue;
      if (start && new Date(start).getTime() > now.getTime() + LOOKAHEAD_MS) continue;
      out.push({ id, level, levelText: str(rec(a.warningLevel).sv) ?? { yellow: "Gul", orange: "Orange", red: "Röd" }[level], title, area: str(rec(a.areaName).sv) ?? "", start, end });
    }
  }
  return out.sort((x, y) => RANK[y.level] - RANK[x.level] || (x.start ?? "").localeCompare(y.start ?? ""));
}

/** Hämtar och filtrerar. Kastar vid fel; anroparen avgör vad som händer (vädret ska visas ändå). */
export async function fetchWarnings(place: { lat: number; lon: number }, now: Date, fetchFn: typeof fetch = fetch): Promise<Warning[]> {
  const res = await fetchFn(SMHI_WARNINGS_URL, { cache: "no-store", signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`SMHI svar ${res.status}`);
  return parseWarnings(await res.json(), place, now);
}
