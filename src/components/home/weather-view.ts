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

export interface HourView { label: string; icon: WxIcon; temp: string; rain: string | null }

/** De närmaste hela timmarna efter nu. */
export function nextHours(hourly: WeatherData["hourly"], now: Date, n = 6): HourView[] {
  const local = nowLocal(now);
  return hourly
    .filter((h) => h.time > local)
    .slice(0, n)
    .map((h) => ({ label: h.time.slice(11, 13), icon: wxIcon(h.code, h.isDay), temp: deg(h.tempC), rain: h.rainPct && h.rainPct > 0 ? `${Math.round(h.rainPct)} %` : null }));
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

const rainText = (mm: number | null) => (mm !== null && mm >= 0.1 ? `${String(Math.round(mm * 10) / 10).replace(".", ",")} mm` : null);

export interface DayView { label: string; icon: WxIcon; min: string; max: string; left: number; width: number; rain: string | null }
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
  const lo = Math.min(...d.daily.map((x) => x.minC));
  const hi = Math.max(...d.daily.map((x) => x.maxC));
  const span = hi - lo || 1;
  const days = d.daily.slice(0, 5).map((x) => {
    const left = ((x.minC - lo) / span) * 100;
    const width = Math.max(((x.maxC - x.minC) / span) * 100, 8);
    return { label: dayLabel(x.date, today), icon: wxIcon(x.code, true), min: deg(x.minC), max: deg(x.maxC), left: Math.min(left, 100 - width), width, rain: rainText(x.rainMm) };
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
