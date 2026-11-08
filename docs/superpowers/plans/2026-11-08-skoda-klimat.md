# Škoda klimatisering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Starta/stoppa bilens klimatisering med vald temperatur från Škoda-kortet och visa läget.

**Architecture:** Bryggan får `POST /api/skoda` som skickar kommandot och returnerar ny sammanfattning i samma inloggning. Hemskärmen tar emot kommandot i befintliga `handleControl`, vidarebefordrar till bryggan och sparar svaret som ny snapshot. Kortet får en klimatrad (klientkomponent).

**Tech Stack:** Python 3.13 + myskoda 2.17.2 (brygga), Next.js 16/TS/Zod/Vitest (hemskärm).

**Spec:** `docs/superpowers/specs/2026-11-08-skoda-klimat-design.md`

## Global Constraints
- Temperatur 16–29,5 °C i steg om 0,5; validera i både hemskärm och brygga innan något anrop till Škoda.
- Kommandospärr i bryggan: högst ett kommando per 30 s. Lässpärren (100 s) blockerar inte kommandon; ett kommando markerar lässpärren.
- Aldrig token, lösenord eller bibliotekets feltext i svar eller logg; bara feltypens namn loggas.
- TTL: 120 s om `charging` eller `climateOn`, annars 900 s.
- Svenska i gränssnittet, tryckytor minst 48 px.

## Review Focus
1. Kommando direkt efter en avläsning (inom 100 s): ska gå igenom, inte få 429 från lässpärren. (Task 1 test)
2. POST med ogiltig/för stor/icke-JSON kropp till bryggan: 400 utan inloggning hos Škoda. (Task 1 test)
3. Bryggan nere eller timeout vid kommando: hemskärmen svarar 502 "Bilen tog inte emot kommandot", kraschar inte och rör inte befintlig snapshot. (Task 2 test)
4. Temperatur som 21.3 eller "21" (sträng): nekas med 400 i hemskärmen. (Task 2 test)
5. Klimatläge `INVALID` eller saknat: visas inte som "av" (null). (Task 1 test)

---

### Task 1: Bryggan — klimatfält och kommando

**Files:**
- Modify: `skoda-bridge/skoda_bridge/summary.py`, `client.py`, `handler.py`, `web.py`, `api/skoda.py` (docstring)
- Test: `skoda-bridge/skoda_bridge/tests/test_summary.py`, `test_handler.py`, `test_web.py`, `conftest.py` (fixture `air_conditioning(state="OFF", target=21.0, ready_at=None)`)

**Interfaces:**
- Produces: `summarize(charging, status, parking, driving_range, air=None) -> dict` med nya nycklar `climateOn: bool|None`, `climateTargetC: float|None`, `climateReadyAt: str|None`.
- Produces: `Fetch = Callable[..., Awaitable[dict]]` anropas `fetch(email, password, vin, command=None)` där `command` är `{"climate":"start","temperatureC":float}` eller `{"climate":"stop"}`.
- Produces: `parse_command(body: object) -> dict | None` (None = ogiltigt), `handle_command(auth_header, env, state, fetch, now, body) -> tuple[int, dict]`; `BridgeState` får `commands: RateGuard` (30 s, default).
- Produces HTTP: `POST /api/skoda` JSON → 200 ny sammanfattning (med `fetchedAt`) | 400 `{"error":"Ogiltigt kommando"}` | 401 | 429 `{"error":"Vänta en halv minut och försök igen"}` | 500 | 502 `{"error":"Bilen tog inte emot kommandot"}`.

- [ ] **Step 1: Skriv tester**
  - summary: `climateOn` True för ON/HEATING/COOLING/VENTILATION/HEATING_AUXILIARY, False för OFF, None för INVALID och `air=None`; `climateTargetC == 21.0`; `climateReadyAt` ISO med zon.
  - handler: `test_parse_command_accepts_start_and_stop` (`{"climate":"start","temperatureC":21.5}`, `{"climate":"stop"}`); `test_parse_command_rejects` för 15.5, 30, 21.3, "21", True, extra nycklar, okänd climate, icke-dict.
  - handler: `test_command_passes_command_to_fetch_and_returns_summary`; `test_invalid_command_is_400_without_fetch`; `test_command_unauthorized_401_without_fetch`; `test_second_command_within_30s_is_429`; `test_command_allowed_right_after_read` (läsning, sedan kommando vid samma klocka → 200); `test_command_marks_read_guard` (efter kommando ger läsning inom 100 s cachat svar utan fetch); `test_command_failure_is_502_without_secrets` (fel med lösenordet i texten → body innehåller det inte).
  - web: `test_post_command_round_trip`, `test_post_non_json_is_400`, `test_post_body_over_4kb_is_400`, `test_post_other_path_is_404`.
- [ ] **Step 2:** `pytest -q` → FAIL.
- [ ] **Step 3: Implementera**
  - `summary.py`: `_climate(air)`; `summarize` får `air=None`; `capturedAt` tar även med `air`.
  - `client.py`: `fetch_summary(email, password, vin=None, command=None)` — kör `start_air_conditioning(vin, temp)`/`stop_air_conditioning(vin)` före avläsningen; lägger `get_air_conditioning(vin)` i `asyncio.gather`.
  - `handler.py`: `parse_command`, `handle_command` (auth och konfiguration som `handle_request`, sedan indata, sedan `commands.too_soon()`, sedan `commands.mark()` + `guard.mark()`, anrop, uppdatera `state.last`); textkoder `invalid`, `command_throttled`, `command_failed`.
  - `web.py`: `do_POST` på `/api/skoda`, `Content-Length` max 4096, annars 400.
- [ ] **Step 4:** `pytest -q` → PASS.
- [ ] **Step 5:** Commit `skoda-bridge: klimatisering (läge + start/stopp via POST)`.

### Task 2: Hemskärmen — schema, TTL och kontrollflöde

**Files:**
- Modify: `src/server/providers/schemas.ts`, `src/server/providers/skoda.ts`, `src/server/control-flow.ts`
- Create: `src/server/providers/skoda-control.ts`
- Test: `src/server/providers/skoda.test.ts`, `src/server/providers/skoda-control.test.ts`, `src/server/control-flow.test.ts`

**Interfaces:**
- Consumes: Task 1 HTTP.
- Produces: `skodaSchema` + `climateOn`, `climateTargetC` (16–30), `climateReadyAt` — alla `.nullable().default(null)`.
- Produces: `type SkodaClimateCommand = { action: "climate_start"; temperatureC: number } | { action: "climate_stop" }`; `class SkodaControlError extends Error { code: "throttled" | "failed" | "config" }`; `sendSkodaClimate(cmd, deps: { getConfig: () => SkodaBridgeConfig | null; fetchFn?: typeof fetch }): Promise<SkodaData>`.
- Produces: `handleControl({provider:"skoda", ...})` → 200 `{ state: CardState<SkodaData> }` vid lyckat kommando (snapshot sparad, backoff rensad); fel: 400 invalid, 409 config, 429 throttled, 502 failed. `ControlFlowDeps` får `skodaConfig?: () => SkodaBridgeConfig | null`.

- [ ] **Step 1: Skriv tester**
  - skoda: `ttlFor` 120 när `climateOn` och inte laddar; 900 när allt av.
  - skoda-control: start skickar `POST {url}/api/skoda` med Bearer och `{"climate":"start","temperatureC":21}`; stop skickar `{"climate":"stop"}`; 429 → `throttled`; 502/nätverksfel/ogiltig JSON → `failed`; utan konfiguration → `config` utan anrop; felmeddelanden innehåller aldrig token.
  - control-flow: `skoda` utan session 401, annan Origin 403 (båda utan bryggan-anrop); `temperatureC` 21.3, 15, "21", extra nyckel → 400; lyckat kommando sparar snapshot med svaret och returnerar `state.status === "ok"`; bryggfel lämnar befintlig snapshot orörd och ger 502 `code: "failed"`.
- [ ] **Step 2:** `npx vitest run src/server` → FAIL.
- [ ] **Step 3: Implementera.** Temperaturschema: `z.number().min(16).max(29.5).refine((t) => Number.isInteger(t * 2))`. Tidsgräns mot bryggan 45 s (`AbortSignal.timeout`). Snapshot skrivs med `db.snapshot.create({ provider: "skoda", payload, fetchedAt: now })` efter `deleteMany`. Meddelanden: throttled "Vänta en halv minut och försök igen", failed "Bilen tog inte emot kommandot", config "Škoda-bryggan är inte konfigurerad".
- [ ] **Step 4:** `npm run typecheck && npx vitest run` → PASS.
- [ ] **Step 5:** Commit `Škoda: klimatkommando via bryggan, tätare hämtning när klimat är på`.

### Task 3: Kortet — klimatrad

**Files:**
- Modify: `src/components/home/skoda-view.ts`, `src/components/home/cards.tsx`, `src/app/globals.css`, `docs/SKODA.md`
- Create: `src/components/home/skoda-climate.tsx`
- Test: `src/components/home/skoda-view.test.ts`

**Interfaces:**
- Consumes: Task 2 `POST /api/control/skoda` och svar `{ state }`; `useRefresh()` från `refresh-context.tsx`.
- Produces: `SkodaView.climate: { on: boolean | null; text: string | null; targetC: number | null }` där `text` = "Klimat på · 21 °C · varm ca 07:45" (delar som saknas utelämnas; hårda mellanslag före enheter), null när av/okänt.
- Produces: `clampTemp(t: number): number` (avrundar till 0,5, begränsar 16–29,5) i `skoda-view.ts`.

- [ ] **Step 1: Skriv tester** för `climate.text` (på med mål och tid; på utan tid → "Klimat på · 21 °C"; av → null; okänt → null), `clampTemp` (15→16, 30→29.5, 21.3→21.5, 21.2→21).
- [ ] **Step 2:** Kör → FAIL. **Step 3:** Implementera vy-logik.
- [ ] **Step 4: Komponent** `SkodaClimate({ on, targetC })`: knappar `[–]`/`[+]` med `aria-label` "Sänk temperatur"/"Höj temperatur", värde med `aria-live="polite"`, knapp Starta/Stoppa (`disabled` under anrop, text "Startar…"/"Stoppar…"), felrad med `role="alert"`. Förval: `localStorage["skoda-climate-temp"]` (try/catch) → `targetC` → 21. Efter lyckat svar: `refresh()`.
- [ ] **Step 5:** Lägg in i `SkodaCard` efter statusrutorna; CSS-klasser `skoda-climate*`, knappar ≥ 48 px. `docs/SKODA.md`: avsnitt "Klimatisering".
- [ ] **Step 6:** `npm run typecheck && npm run lint && npx vitest run && npm run build`, pytest i `skoda-bridge`. Skärmbilder (P12 1280×800, iPhone 393×852) med falsk brygga i lägena av, på och fel. Commit och push till grenen och main.

## Self-review
- Spektäckning: gränssnitt (T3), flöde (T1–T2), avläsning och TTL (T1–T2), spärrar (T1), fel (T1–T2), test (alla).
- Typkonsistens: `SkodaClimateCommand`, `sendSkodaClimate`, `climateOn/climateTargetC/climateReadyAt`, `{ state }` används lika i T1–T3.
