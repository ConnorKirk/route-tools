'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, syntheticRoute } = require('./_load');

const app = loadApp();
const route = syntheticRoute(app);

test('route model: distance, climbing, smoothing', () => {
  const km = route.totalDist / 1000;
  assert.ok(km > 250 && km < 400, `distance sane (got ${km.toFixed(1)} km)`);
  assert.ok(route.hasEle, 'elevation detected');
  assert.ok(route.climb > 1000, `climbing detected (got ${route.climb.toFixed(0)} m)`);
  assert.ok(Math.abs(route.climb - route.descent) < 200, 'climb ≈ descent on a returning profile');
});

test('huge tracks are downsampled to the point cap', () => {
  const big = syntheticRoute(app, 9000);
  assert.ok(big.pts.length <= 2001, `downsampled (got ${big.pts.length} pts)`);
  assert.ok(Math.abs(big.totalDist - route.totalDist) / route.totalDist < 0.25, 'distance roughly preserved');
});

test('speed mode hits the target average despite the descent cap', () => {
  const t = app.computeTiming(route, { mode: 'speed', speed: 27, descCapKmh: 58 });
  const avg = route.totalDist / t.dur * 3.6;
  assert.ok(Math.abs(avg - 27) < 0.4, `average ${avg.toFixed(2)} ≈ 27 km/h`);
  assert.ok(Math.max(...t.segV) * 3.6 <= 58.01, 'descent cap respected');
  for (let i = 1; i < t.arr.length; i++) assert.ok(t.arr[i] > t.arr[i - 1], 'arrivals monotone');
});

test('power mode physics is plausible', () => {
  const t = app.computeTiming(route, { mode: 'power', power: 180, mass: 85, cda: 0.32, crr: 0.005, descCapKmh: 58 });
  const avg = route.totalDist / t.dur * 3.6;
  assert.ok(avg > 20 && avg < 35, `180W/85kg average plausible (got ${avg.toFixed(1)} km/h)`);

  const flat = app.solvePowerSpeed(180 * 0.975, 85, 0.005, 0.32, 0, 1.225) * 3.6;
  assert.ok(flat > 28 && flat < 34, `flat speed plausible (got ${flat.toFixed(1)} km/h)`);
  const climb = app.solvePowerSpeed(180 * 0.975, 85, 0.005, 0.32, 0.08, 1.2) * 3.6;
  assert.ok(climb > 7 && climb < 12, `8% climb speed plausible (got ${climb.toFixed(1)} km/h)`);
  const desc = app.solvePowerSpeed(180 * 0.975, 85, 0.005, 0.32, -0.08, 1.2) * 3.6;
  assert.ok(desc > 55, `-8% descent solves to a high speed before capping (got ${desc.toFixed(1)} km/h)`);
});

test('weather samples every ~25 km including start and finish', () => {
  const samples = app.pickSamples(route);
  const km = route.totalDist / 1000;
  assert.ok(samples.length >= 10 && samples.length <= 16, `count ~ every 25 km (got ${samples.length})`);
  assert.ok(samples[0].km < 1, 'start included');
  assert.ok(Math.abs(samples[samples.length - 1].km - km) < 1, 'finish included');
});
