import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCity, subIndex, concFromIndex, category, parseCpcbTime } from '../scripts/aqi.mjs';

const row = (station, pollutant_id, avg) => ({ station, pollutant_id, avg_value: String(avg), last_update: '25-11-2026 05:00:00' });

test('concentrations PM2.5=78, PM10=142 give AQI about 159, Moderate', () => {
  const r = computeCity([row('A', 'PM2.5', 78), row('A', 'PM10', 142)], { valuesAre: 'concentration' });
  assert.ok(Math.abs(r.aqi - 159) <= 1, `got ${r.aqi}`);
  assert.equal(r.category, 'Moderate');
  assert.equal(r.dominant, 'PM2.5');
  assert.equal(r.pm25, 78);
  assert.equal(r.pm10, 142);
});

test('all-NA input gives null', () => {
  const rows = [
    { station: 'A', pollutant_id: 'PM2.5', avg_value: 'NA' },
    { station: 'A', pollutant_id: 'PM10', pollutant_avg: 'NA' },
  ];
  assert.equal(computeCity(rows), null);
  assert.equal(computeCity(rows, { valuesAre: 'concentration' }), null);
  assert.equal(computeCity([]), null);
});

test('index mode: AQI is the highest averaged sub-index across stations', () => {
  const rows = [row('A', 'PM2.5', 150), row('B', 'PM2.5', 170), row('A', 'PM10', 120), row('A', 'CO', 40), row('A', 'NH3', 300)];
  const r = computeCity(rows);
  assert.equal(r.aqi, 160);
  assert.equal(r.dominant, 'PM2.5');
  assert.equal(r.stations, 2);
  assert.equal(r.lastUpdate, '2026-11-24T23:30:00.000Z');
});

test('O3 is treated as OZONE and pollutant_avg is read too', () => {
  const r = computeCity([{ station: 'A', pollutant_id: 'O3', pollutant_avg: '120' }], { valuesAre: 'concentration' });
  assert.equal(r.dominant, 'OZONE');
});

test('AQI is capped at 500', () => {
  assert.equal(computeCity([row('A', 'PM2.5', 999)], { valuesAre: 'concentration' }).aqi, 500);
});

test('subIndex and concFromIndex are inverses', () => {
  for (const c of [12, 45, 78, 110, 200]) {
    assert.ok(Math.abs(concFromIndex('PM2.5', subIndex('PM2.5', c)) - c) < 1e-9);
  }
});

test('categories', () => {
  assert.equal(category(50), 'Good');
  assert.equal(category(51), 'Satisfactory');
  assert.equal(category(201), 'Poor');
  assert.equal(category(401), 'Severe');
  assert.equal(parseCpcbTime('bad'), null);
});
