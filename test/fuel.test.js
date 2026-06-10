'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app, syntheticRoute } = require('./_helpers');
const route = syntheticRoute();
const base = app.computeTiming(route, { mode: 'speed', speed: 27, descCapKmh: 58 });
const fp = { enabled: true, carbTarget: 70, gelCarbs: 25, barCarbs: 40 };
const stops = [{ km: 100, min: 30, carbs: 100 }, { km: 200, min: 45, carbs: 120 }];

const { arr, list } = app.applyStops(base.arr, route, stops);
const timing = { arr, dur: arr[arr.length - 1], segV: base.segV };

test('stops pause the clock and shift only downstream ETAs', () => {
  assert.ok(Math.abs(timing.dur - (base.dur + 75 * 60)) < 1, 'total dwell added to duration');
  const i50 = app.idxForDist(route, 50e3), i150 = app.idxForDist(route, 150e3), i250 = app.idxForDist(route, 250e3);
  assert.equal(arr[i50], base.arr[i50], 'ETA before first stop unchanged');
  assert.ok(Math.abs(arr[i150] - (base.arr[i150] + 1800)) < 1, 'after stop 1: +30 min');
  assert.ok(Math.abs(arr[i250] - (base.arr[i250] + 4500)) < 1, 'after stop 2: +75 min');
  for (let i = 1; i < arr.length; i++) assert.ok(arr[i] >= arr[i - 1], 'adjusted arrivals monotone');
});

test('energy estimate: power mode is P×t, speed mode back-calculates plausibly', () => {
  const power = app.computeTiming(route, { mode: 'power', power: 180, mass: 85, cda: 0.32, crr: 0.005, descCapKmh: 58 });
  const eP = app.estimateEnergy(route, power, { mode: 'power', power: 180 });
  assert.ok(Math.abs(eP.kJ - 180 * power.dur / 1000) < 5, 'kJ = P × t');
  assert.ok(eP.kcal > 0.9 * eP.kJ && eP.kcal < 1.1 * eP.kJ, 'kcal ≈ kJ via the efficiency coincidence');

  const eS = app.estimateEnergy(route, base, { mode: 'speed', mass: 85, cda: 0.32, crr: 0.005 });
  assert.ok(eS.kcalPerH > 350 && eS.kcalPerH < 900, `speed-mode burn plausible (got ${eS.kcalPerH.toFixed(0)} kcal/h)`);
});

test('schedule hits the carb target with a bar->gel progression', () => {
  const plan = app.generateFuelPlan(route, timing, list, fp);
  assert.ok(plan.ratePerH > fp.carbTarget * 0.75 && plan.ratePerH < fp.carbTarget * 1.45,
    `intake near target (got ${plan.ratePerH.toFixed(1)} g/h)`);
  assert.ok(plan.gels > 2 && plan.bars > 2, 'mix of gels and bars');
  assert.ok(plan.events.every((e, i, a) => i === 0 || e.t >= a[i - 1].t), 'events time-ordered');

  const lastBar = Math.max(...plan.events.filter(e => e.type === 'bar').map(e => e.t));
  const firstGel = Math.min(...plan.events.filter(e => e.type === 'gel').map(e => e.t));
  assert.ok(lastBar < firstGel + 3600, 'bars cluster earlier than gels');
});

test('no on-bike eating inside meal windows (incl. flat-road nudge)', () => {
  const plan = app.generateFuelPlan(route, timing, list, fp);
  for (const ev of plan.events) {
    if (ev.type === 'meal') continue;
    for (const m of list) {
      const winEnd = m.tArr + m.min * 60 + app.postMealGap(m.carbs, fp.carbTarget);
      const inWindow = ev.t >= m.tArr - 1 && ev.t < winEnd - 1;
      assert.ok(!inWindow, `event at ${(ev.t / 3600).toFixed(2)}h inside meal window at ${(m.tArr / 3600).toFixed(2)}h`);
    }
  }
});

test('meal carbs displace on-bike items, keeping intake near target', () => {
  // post-meal gap scales with meal size: 100g at 70 g/h ≈ 1h26
  assert.ok(Math.abs(app.postMealGap(100, 70) - (100 / 70) * 3600) < 1, 'gap = carbs / rate');
  assert.equal(app.postMealGap(10, 70), 1800, '30 min floor');
  assert.equal(app.postMealGap(500, 70), 9000, '2.5 h cap');

  const noStops = app.generateFuelPlan(route, base, [], fp);
  const withStops = app.generateFuelPlan(route, timing, list, fp);
  const onBike = p => p.gels + p.bars;
  assert.ok(onBike(withStops) <= onBike(noStops) - 3,
    `meals displace snacks (${onBike(noStops)} -> ${onBike(withStops)})`);
  assert.ok(withStops.ratePerH > fp.carbTarget * 0.8 && withStops.ratePerH < fp.carbTarget * 1.25,
    `overall rate stays near target with stops (got ${withStops.ratePerH.toFixed(1)} g/h)`);
});

test('rhythm summary compresses the plan into cadence rules', () => {
  const plan = app.generateFuelPlan(route, timing, list, fp);
  const rs = app.rhythmSummary(plan, Date.UTC(2026, 5, 13, 6));
  assert.match(rs, /🍫 bar every/, 'bar cadence present');
  assert.match(rs, /⚡ then gel every/, 'gel cadence present');
  assert.equal((rs.match(/🍽️/g) || []).length, 2, 'both meals listed');
  const iv = +/bar every <b class="num">~(\d+) min/.exec(rs)[1];
  assert.ok(iv >= 25 && iv <= 45, `bar interval ≈ 40g at 70g/h ≈ 34 min (got ${iv})`);
});

test('elapsed time formatting', () => {
  assert.equal(app.fmtElapsed(7530), '2h06');
  assert.equal(app.fmtElapsed(59), '0h01');
});
