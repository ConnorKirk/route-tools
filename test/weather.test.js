'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app, syntheticRoute, fakeForecast } = require('./_helpers');
const route = syntheticRoute();
const timing = app.computeTiming(route, { mode: 'speed', speed: 27, descCapKmh: 58 });
const T0 = Math.floor(Date.UTC(2026, 5, 13, 18) / 1000); // 18:00 UTC — ride crosses midnight

test('hourly interpolation is exact and clamps at the ends', () => {
  const loc = { hourly: { time: [], temperature_2m: [] } };
  for (let h = 0; h <= 30; h++) {
    loc.hourly.time.push(T0 + h * 3600);
    loc.hourly.temperature_2m.push(15 - h * 0.5);
  }
  assert.equal(app.interpAt(loc, 'temperature_2m', T0 + 5.5 * 3600), 15 - 5.5 * 0.5);
  assert.equal(app.interpAt(loc, 'temperature_2m', T0 - 9999), 15, 'clamps before range');
  assert.equal(app.interpAt(loc, 'temperature_2m', T0 + 99 * 3600), 0, 'clamps after range');
});

test('wind direction interpolates circularly across north', () => {
  const loc = { hourly: { time: [T0, T0 + 3600], wind_direction_10m: [350, 10] } };
  const mid = app.interpDirAt(loc, T0 + 1800);
  assert.ok(Math.abs(app.angDiff(mid, 0)) < 1, `350°/10° midpoint ≈ 0° (got ${mid.toFixed(1)}°)`);
});

test('darkness handles midnight rollover with per-day sunrise/sunset', () => {
  const [loc] = fakeForecast(1, T0);
  assert.equal(app.isDark(loc, T0 + 5 * 3600), true, 'dark after day-1 sunset');
  assert.equal(app.isDark(loc, T0 + 12 * 3600), false, 'light after day-2 sunrise');
});

test('conditions + summary: wind vs heading, rain totals, dark hours', () => {
  const samples = app.pickSamples(route);
  const locs = fakeForecast(samples.length, T0);
  const startMs = T0 * 1000;

  const { ptWx, rows } = app.computeConditions(route, timing, samples, locs, startMs);
  const stats = app.summarize(route, timing, ptWx);

  // route heading swings N -> S under a constant northerly wind
  assert.ok(rows[0].head > 10, `headwind riding north (got ${rows[0].head?.toFixed(1)})`);
  assert.ok(rows[rows.length - 1].head < -10, `tailwind riding south (got ${rows[rows.length - 1].head?.toFixed(1)})`);
  assert.ok(Math.abs(stats.netHead) < 10, 'net wind effect smaller than raw speed');

  assert.ok(stats.tempMean > 6 && stats.tempMean < 18, `temp mean sane (got ${stats.tempMean.toFixed(1)})`);
  assert.ok(stats.rainTotalMm > 1 && stats.rainTotalMm < 10, `rain ≈ rate × hours (got ${stats.rainTotalMm.toFixed(1)} mm)`);
  assert.ok(stats.darkSec > 3600, 'overnight ride has dark hours');
});
