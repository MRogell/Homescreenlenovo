import type { WeatherData } from "@/server/providers/schemas";

export type WxIcon = "sun" | "moon" | "cloud-sun" | "cloud-moon" | "cloud" | "fog" | "drizzle" | "rain" | "snow" | "storm";

/** WMO-väderkod (Open-Meteo) till ikon, med natt- och dagversion. Okänd dag/natt räknas som dag. */
export function wxIcon(code: number, isDay: boolean | null): WxIcon {
  const day = isDay !== false;
  if (code === 0) return day ? "sun" : "moon";
  if (code === 1 || code === 2) return day ? "cloud-sun" : "cloud-moon";
  if (code === 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 51 && code <= 57)) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95 && code <= 99) return "storm";
  return "cloud";
}

/** Färgton för kortet efter vädret (hex, används med color-mix i CSS). */
export function wxTint(code: number, isDay: boolean | null): string {
  switch (wxIcon(code, isDay)) {
    case "sun": return "#e9b44c";
    case "moon": return "#3a5599";
    case "cloud-sun": return "#c9a45a";
    case "cloud-moon": return "#4a5f8f";
    case "fog": return "#8a98a6";
    case "drizzle": case "rain": return "#4a78a8";
    case "snow": return "#9fc4e6";
    case "storm": return "#6a4f9c";
    default: return "#7f8ea0";
  }
}

const TZ = "Europe/Stockholm";
const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Svensk lokal tid som "YYYY-MM-DDTHH:mm" (jämförbar som text med Open-Meteos lokala tider). */
export function nowLocal(now: Date): string {
  const p = Object.fromEntries(parts.formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

const deg = (t: number) => `${Math.round(t) || 0}°`;

/** Regn eller snö: styr färg och ikon så att det syns på en blick. */
export type PrecipKind = "rain" | "snow";
export interface HourView { label: string; icon: WxIcon; temp: string; rain: string | null; kind: PrecipKind | null }

const kindOf = (icon: WxIcon): PrecipKind | null => (icon === "snow" ? "snow" : icon === "rain" || icon === "drizzle" || icon === "storm" ? "rain" : null);

/** De närmaste hela timmarna efter nu. */
export function nextHours(hourly: WeatherData["hourly"], now: Date, n = 6): HourView[] {
  const local = nowLocal(now);
  return hourly
    .filter((h) => h.time > local)
    .slice(0, n)
    .map((h) => {
      const icon = wxIcon(h.code, h.isDay);
      return { label: h.time.slice(11, 13), icon, temp: deg(h.tempC), rain: h.rainPct && h.rainPct > 0 ? `${Math.round(h.rainPct)} %` : null, kind: kindOf(icon) };
    });
}

/** "Idag" eller svensk kort veckodag ("mån"). */
export function dayLabel(date: string, today: string): string {
  if (date === today) return "Idag";
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("sv-SE", { weekday: "short", timeZone: "UTC" }).replace(".", "");
}

/** "08:41" ur en lokal eller ISO-tid. Tom eller trasig tid ger null. */
export function clockOf(iso: string | null): string | null {
  const m = iso?.match(/T(\d{2}:\d{2})/);
  return m ? m[1]! : null;
}

const amount = (v: number) => String(Math.round(v * 10) / 10).replace(".", ",");

/** "4,2 mm regn", "3 cm snö" eller båda ("1,5 mm regn · 2,1 cm snö", kind mix). Under 0,1 räknas inte. */
export interface PrecipView {
  /** Hela texten (för skärmläsare och tooltip): "1,5 mm regn · 2,1 cm snö". */
  text: string;
  kind: PrecipKind | "mix";
  /** Mängderna med enhet ("4,2 mm", "3 cm"). Kortet visar dem på samma rad som dagen, så texten ska vara kort. */
  rain: string | null;
  snow: string | null;
}

function precipOf(rainMm: number | null, snowCm: number | null): PrecipView | null {
  const rain = rainMm !== null && rainMm >= 0.1 ? `${amount(rainMm)} mm` : null;
  const snow = snowCm !== null && snowCm >= 0.1 ? `${amount(snowCm)} cm` : null;
  if (rain && snow) return { text: `${rain} regn · ${snow} snö`, kind: "mix", rain, snow };
  if (rain) return { text: `${rain} regn`, kind: "rain", rain, snow: null };
  if (snow) return { text: `${snow} snö`, kind: "snow", rain: null, snow };
  return null;
}

export interface DayView {
  label: string; icon: WxIcon;
  /** Natt (kallaste mörka timmen) och dag (varmaste ljusa timmen). Saknas timdata används min och max. */
  night: string; day: string;
  left: number; width: number;
  precip: PrecipView | null;
}
export interface WeatherView {
  icon: WxIcon;
  tint: string;
  feelsLike: string | null;
  hours: HourView[];
  days: DayView[];
  sun: { rise: string; set: string } | null;
  wind: string | null;
}

/** Allt väderkortet visar. Ren funktion: kortet ritar bara upp resultatet. */
export function weatherView(d: WeatherData, now: Date): WeatherView {
  const today = nowLocal(now).slice(0, 10);
  const five = d.daily.slice(0, 5).map((x) => ({ x, night: x.nightC ?? x.minC, day: x.dayC ?? x.maxC }));
  const lo = Math.min(...five.map((e) => Math.min(e.night, e.day)));
  const hi = Math.max(...five.map((e) => Math.max(e.night, e.day)));
  const span = hi - lo || 1;
  const days = five.map(({ x, night, day }) => {
    const a = Math.min(night, day), b = Math.max(night, day);
    const width = Math.max(((b - a) / span) * 100, 8);
    const left = ((a - lo) / span) * 100;
    return { label: dayLabel(x.date, today), icon: wxIcon(x.code, true), night: deg(night), day: deg(day), left: Math.min(left, 100 - width), width, precip: precipOf(x.rainMm, x.snowCm) };
  });
  const rise = clockOf(d.sunrise), set = clockOf(d.sunset);
  const wind = d.windMs === null ? null : `${Math.round(d.windMs)} m/s${d.gustMs !== null ? `, byar ${Math.round(d.gustMs)}` : ""}`;
  const feels = d.feelsLikeC !== null && Math.abs(Math.round(d.feelsLikeC) - Math.round(d.tempC)) >= 1 ? `Känns som ${deg(d.feelsLikeC)}` : null;
  return {
    icon: wxIcon(d.code, d.isDay),
    tint: wxTint(d.code, d.isDay),
    feelsLike: feels,
    hours: nextHours(d.hourly, now),
    days,
    sun: rise && set ? { rise, set } : null,
    wind,
  };
}
