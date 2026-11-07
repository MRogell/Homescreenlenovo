import { z } from "zod";

export const skodaSchema = z.object({
  rangeKm: z.number().nullable(),
  levelPct: z.number().min(0).max(100).nullable(),
  levelKind: z.enum(["battery", "fuel"]),
  locked: z.boolean().nullable(),
  charging: z.boolean(),
  parked: z.string().nullable(),
});
export const sonosSchema = z.object({ playing: z.boolean(), title: z.string(), artist: z.string(), room: z.string(), grouped: z.array(z.string()), volume: z.number(), progressPct: z.number().min(0).max(100) });
export const spotifySchema = z.object({ playing: z.boolean(), title: z.string(), artist: z.string(), device: z.string().nullable(), lastPlayedAt: z.string().nullable() });
export const aegSchema = z.object({ appliance: z.string(), running: z.boolean(), program: z.string(), minutesLeft: z.number().min(0), progressPct: z.number().min(0).max(100), doneAt: z.string() });
export const arloSchema = z.object({ cameras: z.number(), lastMotionAt: z.string(), lastMotionPlace: z.string() });

export type SkodaData = z.infer<typeof skodaSchema>;
export type SonosData = z.infer<typeof sonosSchema>;
export type SpotifyData = z.infer<typeof spotifySchema>;
export type AegData = z.infer<typeof aegSchema>;
export type ArloData = z.infer<typeof arloSchema>;

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
