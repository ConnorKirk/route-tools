# Ride Weather Planner — Build Plan

A single-file HTML tool for planning long cycling rides (300km+ / 12h+). Upload a GPX route, set start time and pacing, and see the weather you'll actually ride through — emphasizing average conditions and variability over point forecasts.

## Goals

- Understand conditions across the whole ride: averages, ranges, and how much they swing over the day.
- Make it trivial to tweak start time, speed/power, and date and see results update instantly.
- Zero install, zero backend: one HTML file, opened in any browser. Only external call is the weather API.

## Architecture

- **One HTML file + one plain JS file** — no build step, no dependencies; hand-rolled SVG charts. (Originally a single self-contained HTML file; split so tests can `require()` the logic directly.)
- **Weather API: Open-Meteo** — free, no API key, CORS-enabled (works from `file://`). Hourly forecasts up to 16 days ahead; supports batch multi-location requests.
- All computation client-side.

## Components

### 1. GPX parsing & route model

- Parse trackpoints (lat / lon / elevation) with `DOMParser`.
- Compute cumulative distance (haversine) and per-segment gradient.
- Smooth elevation (rolling window) so GPS noise doesn't distort gradients and climbing totals.
- Compute per-segment heading (bearing) for later wind analysis.
- Handle both `<trk>` routes and `<rte>` files; ignore timestamps unless explicitly used.

### 2. Timing model — when will I be where?

Two switchable modes:

**Speed mode (default)**
- Input: target average speed.
- Segment speed scaled by gradient — slower climbing, faster descending — then normalized so the overall average matches the target.
- Simple gradient→speed-factor curve (e.g. logistic on gradient %), capped descending speed.

**Power mode**
- Inputs: average power, rider + bike weight; CdA and Crr with sensible defaults (editable).
- Solve the cycling power equation per segment for speed (gravity + rolling resistance + aero).
- Better fidelity on very hilly routes; more inputs required.

Output: estimated arrival time at every route point, total ride duration, ETA at finish.

### 3. Weather sampling

- Sample the route every ~20–30 km (≈10–15 points for a 300 km ride).
- One batched Open-Meteo request for all sample points.
- Hourly variables: temperature, apparent temperature, precipitation amount, precipitation probability, wind speed, wind gusts, wind direction, cloud cover, relative humidity. Plus daily sunrise/sunset.
- For each sample point, interpolate hourly data to the estimated arrival time at that point.
- **Wind vs heading**: combine forecast wind direction with route bearing at each point → headwind / tailwind / crosswind component along the ride.
- Cache responses keyed by (location grid, date) so changing start time or speed re-uses fetched data — no re-fetch on tweaks.

### 4. Presentation — averages and variability first

**Summary band (top of page)**
- Temperature: mean, min–max range, and feels-like range.
- Rain: total expected mm, % of ride time with meaningful rain probability.
- Wind: average speed, max gusts, and net effective wind (overall head/tailwind balance for the route).
- Daylight: ride hours in darkness vs daylight; sunrise/sunset relative to ride.
- A one-line variability cue, e.g. "Temperature swings 14°C over the ride."

**Ride timeline chart**
- X-axis: ride time, with distance as secondary scale.
- Temperature + feels-like band; precipitation bars; wind arrows oriented relative to travel direction; darkness shading before sunrise / after sunset.
- Elevation profile aligned beneath for context.

**Conditions table**
- One row per sample point: distance, ETA, temp, feels-like, rain, wind component, notes.

### 5. Controls (live recompute)

- GPX file picker / drag-and-drop.
- Start date + time.
- Mode toggle: speed ⇄ power, with the relevant inputs (speed, or power/weight/CdA/Crr).
- Any change recomputes timing and re-renders immediately from cached weather — cheap scenario comparison without a separate comparison UI.

## Constraints & edge cases

- Hourly forecasts available ~16 days out; accuracy degrades beyond ~7 days — show a confidence note based on lead time.
- Rides crossing midnight: handle date rollover in hourly lookups and sunrise/sunset.
- Very long rides may span two forecast days per location — fetch both.
- Malformed/huge GPX files: downsample to a manageable point count (~2,000) before processing.
- No network: show clear error; route/timing analysis still works without weather.

## Out of scope (v2 candidates)

- Clothing/packing rule engine (current choice: conditions summary only).
- Climatological normals fallback for rides >16 days out.
- Side-by-side multi-scenario comparison view.
- Route map rendering (needs tile server; conflicts with single-file/offline goal).

## Fueling planner (v2 — prototyping)

Goal: plan calories/carbs for 300km+ rides fueled by a mix of gels, bars and real food stops.

- **Burn**: estimate work (kJ) per segment from the power model (invert from speed when in speed mode); kJ ≈ kcal burned at ~24% gross efficiency.
- **Intake**: target carb rate (g/h, default 70 — gut-limited, not burn-matched), configurable gel/bar carb content.
- **Stops**: user-placed food stops (km, duration, meal carbs). Stops pause the clock — all downstream ETAs and weather interpolation shift. Auto-place option every ~4.5h riding.
- **Schedule**: on-bike eating events spaced to hit the target rate; bars early in the ride, gels later; each event nudged to the flattest road within ±6 min; no on-bike eating for ~40 min after a meal stop.
- **Presentation**: summary cards (burn, intake plan + coverage %, shopping list "carry N gels / M bars", fluids estimate from forecast temperature), a time-ordered schedule table, and event markers on the timeline chart.
- Open questions for prototype feedback: schedule granularity, whether to model carb type mix (glucose:fructose) and caffeine, smarter stop placement (towns/opening hours), per-rider sweat/fluid model.

## Build order

1. HTML skeleton, controls panel, GPX parse + route stats (distance, climbing, elevation profile).
2. Timing model (speed mode), then power mode.
3. Open-Meteo fetch + caching + interpolation to arrival times.
4. Summary band + conditions table.
5. Timeline chart with wind/heading analysis and daylight shading.
6. Polish: error states, forecast-age confidence note, downsampling, midnight rollover tests.
