'use strict';
// Loads the app's inline <script> out of index.html (the single-file app stays
// the source of truth) and evaluates it in a vm context. An export shim is
// appended to the script text before evaluation because top-level const/let
// bindings (state, fuelStops, mapMode…) never land on the vm's global object —
// only same-script code can reach them.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const EXPORTED = [
  // helpers & geo
  'clamp', 'lerp', 'angDiff', 'fmtElapsed', 'fmtClock', 'fmtEta', 'localISODate',
  'havDist', 'bearingDeg',
  // route & timing
  'buildRoute', 'gradeFactor', 'solvePowerSpeed', 'computeTiming', 'pickSamples',
  // fueling
  'idxForDist', 'applyStops', 'estimateEnergy', 'flattestNear', 'generateFuelPlan',
  'rhythmSummary', 'readFuelParams', 'FUEL_LABEL',
  // weather
  'interpAt', 'interpDirAt', 'isDark', 'computeConditions', 'summarize', 'HOURLY_VARS',
  // ui logic & persistence
  'idxForTime', 'mapSegColors', 'saveState', 'restoreState', 'STORE_KEY',
];

function loadApp() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const m = /<script>\n([\s\S]*?)\n<\/script>/.exec(html);
  if (!m) throw new Error('inline <script> not found in index.html');

  const shim = `\nglobalThis.__app = { ${EXPORTED.join(', ')},
    get state() { return state; },
    get fuelStops() { return fuelStops; }, set fuelStops(v) { fuelStops = v; },
    get mapMode() { return mapMode; }, set mapMode(v) { mapMode = v; },
  };`;

  const ctx = vm.createContext({ console });
  vm.runInContext(m[1] + shim, ctx, { filename: 'index.html#script' });
  ctx.__app.ctx = ctx; // tests inject `document` / `localStorage` here
  return ctx.__app;
}

// ~300 km synthetic route: rolling hills, heading swinging north -> south,
// deterministic pseudo-noise standing in for GPS jitter
function syntheticRoute(app, n = 1500) {
  const pts = [];
  const step = 1500 / n; // more points = denser sampling of the same ~300 km path
  let lat = 51.0, lon = -1.0;
  for (let i = 0; i < n; i++) {
    const brg = (i / n) * Math.PI;
    lat += Math.cos(brg) * 0.0018 * step;
    lon += Math.sin(brg) * 0.0029 * step;
    pts.push({ lat, lon, ele: 120 + 200 * Math.sin((i * step) / 40) + 3 * Math.sin(i * 7.31) });
  }
  return app.buildRoute(pts);
}

// constant northerly wind, a rain band at hours 9-11, sinusoidal temperature;
// daily arrays carry one sunrise/sunset pair per day, as Open-Meteo returns them
function fakeForecast(app, count, t0, hours = 30) {
  return Array.from({ length: count }, () => {
    const l = {
      hourly: { time: [] },
      daily: { sunrise: [t0 - 13 * 3600, t0 + 11 * 3600], sunset: [t0 + 3 * 3600, t0 + 27 * 3600] },
    };
    for (const k of app.HOURLY_VARS) l.hourly[k] = [];
    for (let h = 0; h <= hours; h++) {
      l.hourly.time.push(t0 + h * 3600);
      l.hourly.temperature_2m.push(12 + 6 * Math.sin(h / 4));
      l.hourly.apparent_temperature.push(10 + 6 * Math.sin(h / 4));
      l.hourly.precipitation.push(h > 8 && h < 12 ? 1.5 : 0);
      l.hourly.precipitation_probability.push(h > 8 && h < 12 ? 80 : 10);
      l.hourly.wind_speed_10m.push(18);
      l.hourly.wind_gusts_10m.push(35);
      l.hourly.wind_direction_10m.push(0);
      l.hourly.cloud_cover.push(50);
      l.hourly.relative_humidity_2m.push(70);
    }
    return l;
  });
}

// minimal DOM + localStorage stubs for persistence tests
function stubBrowser(app) {
  const els = {};
  const mkEl = id => els[id] ??= {
    value: '', checked: true, hidden: false, textContent: '', dataset: {},
    classList: {
      _s: new Set(),
      toggle(c, f) { f ? this._s.add(c) : this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
  };
  app.ctx.document = { getElementById: mkEl, querySelectorAll: () => [] };
  app.ctx.localStorage = {
    _m: {},
    setItem(k, v) { this._m[k] = v; },
    getItem(k) { return this._m[k] ?? null; },
  };
  return { el: mkEl, storage: app.ctx.localStorage };
}

module.exports = { loadApp, syntheticRoute, fakeForecast, stubBrowser };
