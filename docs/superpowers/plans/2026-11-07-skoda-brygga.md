# Škoda via brygga: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development eller superpowers:executing-plans.

**Goal:** Riktig Škoda-data på hemskärmen via en separat Python-brygga. **Spec:** `docs/superpowers/specs/2026-11-07-skoda-brygga-design.md`

## Global Constraints
Python ≥ 3.13, `myskoda==2.17.2` pinnad. Lösenord bara i bryggans miljö. Bearer-token ≥ 32 tecken. Skrivskyddat.

## Review Focus
1. Bensinbil: ingen laddningsdata, bränslenivå används.
2. Okänt låsläge: `locked` blir `null`, inte `false`.
3. Delvist fel: övriga fält levereras.
4. Fel i bryggan läcker inte inloggning.
5. Bryggan svarar före spärrintervallet med senast kända data i stället för ny inloggning.

### Task 1: Bryggans kärna (`skoda-bridge/skoda_bridge/`)
`summary.py: summarize(charging, status, parking, driving_range) -> dict` (alla fyra får vara `None`); `guard.py: authorized(header: str|None, token: str) -> bool`, `RateGuard(min_interval_s, clock)`. Pytest först.
### Task 2: Nätverk och hantering
`client.py: fetch_summary(email, password, vin=None) -> dict` (MySkoda utan MQTT, fyra anrop parallellt, `return_exceptions`); `api/status.py` (Vercel-handler) och `server.py` (lokal/annan värd).
### Task 3: Appens provider
`env.ts` (`SKODA_BRIDGE_URL`, `SKODA_BRIDGE_TOKEN`), nytt `skodaSchema`, `providers/skoda.ts: createSkodaProvider({getConfig, fetchFn})`, registret, kortet och Inställningar. TTL 1800 s. Vitest först.
### Task 4: Dokumentation och leverans
`skoda-bridge/README.md`, `docs/DRIFT.md`, alla kontroller, push till `main`.
