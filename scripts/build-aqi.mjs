// Pulls CPCB real-time readings from data.gov.in, computes the Indian AQI per
// city and writes out/aqi.json. Run by the GitHub Action every 30 minutes.
//
//   CPCB_API_KEY   required. Read from the environment only; never logged.
//   AQI_PAGES_URL  optional. The published aqi.json, used to keep a city's last
//                  good value when this run fails for it.
//   AQI_VALUES     optional. 'index' (default) or 'concentration'. See README.
//   AQI_SAMPLE=1   optional. Prints one raw record per city (no key in output).

import { mkdir, writeFile } from 'node:fs/promises';
import { computeCity } from './aqi.mjs';

export { computeCity } from './aqi.mjs';

const RESOURCE = 'https://api.data.gov.in/resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69';
export const CITIES = ['Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad', 'Jaipur'];
const TIMEOUT_MS = 8000;

async function fetchJson(url, timeoutMs = TIMEOUT_MS) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchCityRows(city, key) {
  const u = new URL(RESOURCE);
  u.searchParams.set('api-key', key);
  u.searchParams.set('format', 'json');
  u.searchParams.set('limit', '500');
  u.searchParams.set('filters[city]', city);
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const body = await fetchJson(u);
      if (!Array.isArray(body.records)) throw new Error('no records array in response');
      return body.records;
    } catch (err) {
      // Never print the URL: it carries the key.
      lastErr = new Error(err.name === 'TimeoutError' ? 'timed out' : err.message);
    }
  }
  throw lastErr;
}

async function loadPrevious(url) {
  if (!url) return {};
  try {
    const body = await fetchJson(url);
    return body && body.cities ? body.cities : {};
  } catch {
    return {};
  }
}

async function main() {
  const key = process.env.CPCB_API_KEY;
  if (!key) {
    console.error('CPCB_API_KEY is not set.');
    process.exit(1);
  }
  const valuesAre = process.env.AQI_VALUES === 'concentration' ? 'concentration' : 'index';
  const previous = await loadPrevious(process.env.AQI_PAGES_URL);

  const cities = {};
  let fresh = 0;
  for (const city of CITIES) {
    let summary = null;
    try {
      const rows = await fetchCityRows(city, key);
      if (process.env.AQI_SAMPLE === '1' && rows[0]) console.log(`sample ${city}:`, JSON.stringify(rows[0]));
      summary = computeCity(rows, { valuesAre });
      if (!summary) console.warn(`${city}: no usable readings (${rows.length} rows)`);
    } catch (err) {
      console.warn(`${city}: ${err.message}`);
    }
    if (summary) {
      cities[city] = summary;
      fresh++;
      console.log(`${city}: AQI ${summary.aqi} ${summary.category} (${summary.dominant}), ${summary.stations} stations`);
    } else if (previous[city]) {
      cities[city] = { ...previous[city], stale: true };
      console.warn(`${city}: kept previous value (stale)`);
    }
  }

  if (fresh === 0) {
    console.error('Every city failed. Not writing aqi.json, so the published file stays as it is.');
    process.exit(1);
  }

  const out = { generatedAt: new Date().toISOString(), source: 'CPCB via data.gov.in', cities };
  await mkdir('out', { recursive: true });
  await writeFile('out/aqi.json', JSON.stringify(out, null, 2) + '\n');
  await writeFile('out/index.html', '<!doctype html><meta charset="utf-8"><title>EDT AQI data</title><p>See <a href="aqi.json">aqi.json</a>.</p>\n');
  console.log(`Wrote out/aqi.json: ${fresh}/${CITIES.length} cities fresh.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
