import { z } from "zod";

export const skodaSchema = z.object({
  rangeKm: z.number().nullable(),
  levelPct: z.number().min(0).max(100).nullable(),
  levelKind: z.enum(["battery", "fuel"]),
  locked: z.boolean().nullable(),
  charging: z.boolean(),
  parked: z.string().nullable(),
  // Tillkom senare: valfria, så att äldre svar från bryggan fortfarande godtas. null = bilen rapporterar inte värdet.
  chargeMinutesLeft: z.number().min(0).nullable().default(null),
  chargeKw: z.number().min(0).nullable().default(null),
  chargeTargetPct: z.number().min(0).max(100).nullable().default(null),
  doorsOpen: z.boolean().nullable().default(null),
  windowsOpen: z.boolean().nullable().default(null),
  trunkOpen: z.boolean().nullable().default(null),
  bonnetOpen: z.boolean().nullable().default(null),
  /** Bilens egen rapporttid (ISO), inte när appen hämtade. */
  capturedAt: z.string().nullable().default(null),
  climateOn: z.boolean().nullable().default(null),
  climateTargetC: z.number().min(10).max(35).nullable().default(null),
  /** Beräknad tid då kupén når måltemperaturen (ISO), bara när klimatiseringen är på. */
  climateReadyAt: z.string().nullable().default(null),
  /** Satt av hemskärmen när ett klimatkommando skickats men bilen ännu inte bekräftat det (bryggan väntar inte på bilen). */
  /** Bilen körs just nu (Škodas moln anger det själv). null = okänt. */
  driving: z.boolean().nullable().default(null),
  /** Batteriets egen rapporttid (ISO). Lås och dörrar kan vara färskare än batteridelen. */
  batteryAt: z.string().nullable().default(null),
  climateRequested: z.object({ action: z.enum(["start", "stop"]), at: z.string() }).nullable().default(null),
});
export const sonosSchema = z.object({
  groups: z.array(z.object({ id: z.string(), room: z.string(), members: z.array(z.string()), playing: z.boolean(), title: z.string(), artist: z.string(), volume: z.number().nullable(), imageUrl: z.string().nullable().default(null) })),
  /** Alla högtalare i hushållet och vilken grupp de tillhör (null = ingen grupp). Valfritt för äldre cachade svar. */
  players: z.array(z.object({ id: z.string(), name: z.string(), groupId: z.string().nullable() })).default([]),
});
export const spotifySchema = z.object({
  playing: z.boolean(),
  title: z.string(),
  artist: z.string(),
  device: z.string().nullable(),
  lastPlayedAt: z.string().nullable(),
  /** Spotify tar inte emot kommandon till den aktiva enheten (t.ex. vissa telefoner och Sonos). */
  deviceRestricted: z.boolean(),
  /** Spotify tillåter volymstyrning av den aktiva enheten. */
  supportsVolume: z.boolean(),
  volume: z.number().min(0).max(100).nullable(),
  // Tillkom senare: valfria så att äldre cachade svar godtas.
  /** Omslag från Spotifys bildserver (bara https://i.scdn.co/...). */
  imageUrl: z.string().nullable().default(null),
  progressMs: z.number().min(0).nullable().default(null),
  durationMs: z.number().min(0).nullable().default(null),
});
export const aegSchema = z.object({
  appliance: z.string(),
  state: z.string(),
  stateText: z.string(),
  program: z.string().nullable(),
  phase: z.string().nullable(),
  minutesLeft: z.number().nullable(),
  doneAt: z.string().nullable(),
  connected: z.boolean(),
  /** Electrolux `remoteControl`, t.ex. "ENABLED" (fjärrstart tillåten). Null om okänt. */
  remoteControl: z.string().nullable(),
  /** Valt program (Electrolux-id, t.ex. "ECO") och programmen maskinen stöder. Valfria för äldre cache. */
  programUid: z.string().nullable().default(null),
  programs: z.array(z.string()).default([]),
});

export type SkodaData = z.infer<typeof skodaSchema>;
export type SonosData = z.infer<typeof sonosSchema>;
export type SpotifyData = z.infer<typeof spotifySchema>;
export type AegData = z.infer<typeof aegSchema>;

export const weatherSchema = z.object({
  place: z.string(),
  tempC: z.number(),
  code: z.number(),
  text: z.string(),
  windMs: z.number().nullable(),
  aqi: z.number().nullable(),
  aqiLabel: z.string().nullable(),
  // Tillkom senare: valfria så att äldre cachade svar godtas.
  isDay: z.boolean().nullable().default(null),
  feelsLikeC: z.number().nullable().default(null),
  gustMs: z.number().nullable().default(null),
  /** Kommande timmar (lokal tid, Europe/Stockholm). Kortet väljer själv de närmaste efter klockan. */
  hourly: z.array(z.object({ time: z.string(), tempC: z.number(), code: z.number(), rainPct: z.number().nullable(), isDay: z.boolean() })).default([]),
  /** Dagsprognos, idag först. */
  daily: z.array(z.object({
    date: z.string(), code: z.number(), minC: z.number(), maxC: z.number(),
    /** Regn i mm (regn plus skurar). */
    rainMm: z.number().nullable(),
    /** Snö i cm. Valfritt för äldre cache. */
    snowCm: z.number().nullable().default(null),
    /** Dagtemperatur (varmaste ljusa timmen) och natt (kallaste mörka timmen). null = faller tillbaka på max/min. */
    dayC: z.number().nullable().default(null),
    nightC: z.number().nullable().default(null),
  })).default([]),
  sunrise: z.string().nullable().default(null),
  sunset: z.string().nullable().default(null),
});
export type WeatherData = z.infer<typeof weatherSchema>;

export const tadoSchema = z.object({
  rooms: z.array(z.object({ name: z.string(), tempC: z.number().nullable(), humidity: z.number().nullable(), targetC: z.number().nullable(), heating: z.boolean() })),
});
export type TadoData = z.infer<typeof tadoSchema>;

const calendarEvent = z.object({ title: z.string(), allDay: z.boolean(), start: z.string(), end: z.string(), calendarId: z.string() });
const calendarDay = z.object({ date: z.string(), events: z.array(calendarEvent) });
export const calendarSchema = z.object({
  today: calendarDay,
  tomorrow: calendarDay,
  /** De kopplade kalendrarna (namn och färg, aldrig adressen). */
  calendars: z.array(z.object({ id: z.string(), name: z.string(), color: z.enum(["blue", "green", "yellow", "red", "purple"]) })),
  /** Hur många kalendrar som inte svarade den här gången. */
  failed: z.number(),
});
export type CalendarData = z.infer<typeof calendarSchema>;
