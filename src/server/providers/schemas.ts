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
  climateRequested: z.object({ action: z.enum(["start", "stop"]), at: z.string() }).nullable().default(null),
});
export const sonosSchema = z.object({
  groups: z.array(z.object({ id: z.string(), room: z.string(), members: z.array(z.string()), playing: z.boolean(), title: z.string(), artist: z.string(), volume: z.number().nullable() })),
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
});
export type WeatherData = z.infer<typeof weatherSchema>;

export const tadoSchema = z.object({
  rooms: z.array(z.object({ name: z.string(), tempC: z.number().nullable(), humidity: z.number().nullable(), targetC: z.number().nullable(), heating: z.boolean() })),
});
export type TadoData = z.infer<typeof tadoSchema>;
