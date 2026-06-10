# Ride Weather Planner

Plan the weather for long cycling rides (300 km+ / 12 h+). Upload a GPX route, set your start time and pacing, and see the conditions you'll actually ride through — averages, ranges, and how much they swing over the day, rather than a single point forecast.

**Use it here: https://connorkirk.github.io/route-tools/**

## Features

- **GPX upload** (file, drag-and-drop, or URL — public RideWithGPS links work directly)
- **Two pacing models**: target average speed (gradient-adjusted), or physics-based from average power, rider/bike weight, CdA and Crr
- **Per-point forecast**: temperature, feels-like, rain amount and probability, wind speed/gusts/direction, interpolated to your ETA at each point along the route
- **Wind vs heading**: headwind / tailwind / crosswind components from forecast wind direction combined with route bearing
- **Timeline chart**: temperature band, rain bars, wind arrows relative to travel direction, elevation profile, darkness shading
- **Route map**: colored by wind effect, temperature, or day/night, with coastline/border outlines
- **Hover anywhere** on the chart or map for full conditions at that point
- Live recompute: tweak start time, speed or power and everything updates instantly from cached forecast data

## How it works

A single self-contained HTML file — no build step, no backend, no dependencies. Forecast data comes from [Open-Meteo](https://open-meteo.com) (free, no API key) and map outlines from [Natural Earth](https://www.naturalearthdata.com); everything else runs in your browser. It also works opened straight from a local file.

Hourly forecasts cover ~16 days ahead; the app shows a confidence note based on lead time.

## Development

The app is one file: `index.html`. Tests use Node's built-in runner (no dependencies):

```sh
npm test   # = node --test
```

`test/_load.js` extracts the inline `<script>` from `index.html` and evaluates it in a `node:vm` context, so the single-file app stays the source of truth — there is no build step. Tests cover the route model, both timing modes, weather interpolation (including midnight rollover and circular wind direction), the fueling planner, and localStorage persistence. Rendering functions are exercised in the browser only.
