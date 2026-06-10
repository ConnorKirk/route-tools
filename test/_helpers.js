'use strict';
// app.js is a plain browser script with a CommonJS export block at the bottom;
// requiring it gives direct same-realm access to the app's functions.
const app = require('../app.js');

// ~300 km synthetic route: rolling hills, heading swinging north -> south,
// deterministic pseudo-noise standing in for GPS jitter. More points = denser
// sampling of the same path, so downsampling can be tested without changing
// the route's length.
function syntheticRoute(n = 1500) {
  const pts = [];
  const step = 1500 / n;
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
function fakeForecast(count, t0, hours = 30) {
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

// minimal DOM + localStorage stubs (app code resolves document/localStorage at
// call time, so installing globals before calling save/restore is enough)
function stubBrowser() {
  const els = {};
  const mkEl = id => els[id] ??= {
    value: '', checked: true, hidden: false, textContent: '', dataset: {},
    classList: {
      _s: new Set(),
      toggle(c, f) { f ? this._s.add(c) : this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
  };
  global.document = { getElementById: mkEl, querySelectorAll: () => [] };
  global.localStorage = {
    _m: {},
    setItem(k, v) { this._m[k] = v; },
    getItem(k) { return this._m[k] ?? null; },
  };
  return { el: mkEl, storage: global.localStorage };
}

module.exports = { app, syntheticRoute, fakeForecast, stubBrowser };
