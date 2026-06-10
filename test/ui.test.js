'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app, syntheticRoute, stubBrowser } = require('./_helpers');

test('idxForTime snaps to the nearest index and clamps', () => {
  const a = [0, 10, 20, 30];
  assert.equal(app.idxForTime(a, -5), 0);
  assert.equal(app.idxForTime(a, 14), 1);
  assert.equal(app.idxForTime(a, 16), 2);
  assert.equal(app.idxForTime(a, 35), 3);
});

test('map colors classify wind / temp / darkness correctly', () => {
  const fakeRoute = { pts: new Array(5).fill({}), cum: [0, 1, 2, 3, 4] };
  const wx = [
    { head: 15, cross: 3, temp: 5, dark: false },
    { head: -10, cross: 2, temp: 10, dark: false },
    { head: 1, cross: 20, temp: 15, dark: true },
    { head: 0, cross: 0, temp: 20, dark: true },
  ];
  app.mapMode = 'wind';
  let c = app.mapSegColors(fakeRoute, wx);
  assert.equal(c.join('|'), 'var(--bad)|var(--good)|var(--warn)|#9aa7c4');
  app.mapMode = 'temp';
  c = app.mapSegColors(fakeRoute, wx);
  assert.match(c[0], /212/, 'coldest is blue');
  assert.match(c[3], /\(8,/, 'hottest is red');
  app.mapMode = 'dark';
  c = app.mapSegColors(fakeRoute, wx);
  assert.equal(c[0], '#ffd76a');
  assert.equal(c[2], '#5d6ab1');
  assert.ok(app.mapSegColors(fakeRoute, null).every(x => x === '#7d879c'), 'no forecast → grey');
});

test('persistence round-trips route, inputs and stops', () => {
  const route = syntheticRoute();
  const { el, storage } = stubBrowser();

  el('start').value = '2026-01-01T06:30'; // in the past — should bump on restore
  el('speed').value = '29';
  el('carb-target').value = '85';
  app.state.route = route;
  app.state.fileName = 'test.gpx';
  app.fuelStops = [{ km: 100, min: 30, carbs: 100 }];
  app.saveState();
  assert.ok(storage._m[app.STORE_KEY].length < 300 * 1024, 'payload well under the quota');

  app.state.route = null;
  app.fuelStops = [];
  el('speed').value = '';
  el('carb-target').value = '';

  assert.equal(app.restoreState(), true, 'restore reports a route');
  assert.equal(el('speed').value, '29');
  assert.equal(el('carb-target').value, '85');
  // JSON comparison: vm-realm objects have a foreign prototype, which deepStrictEqual rejects
  assert.equal(JSON.stringify(app.fuelStops), JSON.stringify([{ km: 100, min: 30, carbs: 100 }]));
  assert.ok(Math.abs(app.state.route.totalDist - route.totalDist) < 1000, 'distance survives rounding');
  assert.ok(Math.abs(app.state.route.climb - route.climb) < 100, 'climbing survives rounding');

  assert.ok(new Date(el('start').value).getTime() > Date.now(), 'past start bumped to the future');
  assert.ok(el('start').value.endsWith('06:30'), 'time of day preserved on bump');
});

test('corrupt saved data falls back to a fresh session', () => {
  const { storage } = stubBrowser();
  storage._m[app.STORE_KEY] = '{not json';
  assert.equal(app.restoreState(), false);
});
