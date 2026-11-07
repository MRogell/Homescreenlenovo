import { z } from "zod";

export const skodaSchema = z.object({ rangeKm: z.number(), batteryPct: z.number().min(0).max(100), locked: z.boolean(), parked: z.string() });
export const sonosSchema = z.object({ playing: z.boolean(), title: z.string(), artist: z.string(), room: z.string(), grouped: z.array(z.string()), volume: z.number(), progressPct: z.number().min(0).max(100) });
export const spotifySchema = z.object({ playing: z.boolean(), title: z.string(), artist: z.string(), device: z.string().nullable(), lastPlayedAt: z.string().nullable() });
export const plejdSchema = z.object({ on: z.number(), total: z.number(), rooms: z.array(z.object({ name: z.string(), on: z.number() })) });
export const tadoSchema = z.object({ heating: z.boolean(), rooms: z.array(z.object({ name: z.string(), tempC: z.number(), targetC: z.number() })).min(1) });
export const tapoSchema = z.object({ plugsOn: z.number(), plugsTotal: z.number(), camerasOnline: z.number(), camerasTotal: z.number() });
export const aegSchema = z.object({ appliance: z.string(), running: z.boolean(), program: z.string(), minutesLeft: z.number().min(0), progressPct: z.number().min(0).max(100), doneAt: z.string() });
export const arloSchema = z.object({ cameras: z.number(), lastMotionAt: z.string(), lastMotionPlace: z.string() });

export type SkodaData = z.infer<typeof skodaSchema>;
export type SonosData = z.infer<typeof sonosSchema>;
export type SpotifyData = z.infer<typeof spotifySchema>;
export type PlejdData = z.infer<typeof plejdSchema>;
export type TadoData = z.infer<typeof tadoSchema>;
export type TapoData = z.infer<typeof tapoSchema>;
export type AegData = z.infer<typeof aegSchema>;
export type ArloData = z.infer<typeof arloSchema>;
