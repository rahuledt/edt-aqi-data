// Indian AQI (CPCB) maths. No dependencies, no I/O: safe to import from tests.

// [concLow, concHigh, idxLow, idxHigh]. Units: µg/m³, except CO in mg/m³.
export const BREAKPOINTS = {
  'PM2.5': [[0, 30, 0, 50], [31, 60, 51, 100], [61, 90, 101, 200], [91, 120, 201, 300], [121, 250, 301, 400], [251, 380, 401, 500]],
  PM10: [[0, 50, 0, 50], [51, 100, 51, 100], [101, 250, 101, 200], [251, 350, 201, 300], [351, 430, 301, 400], [431, 510, 401, 500]],
  NO2: [[0, 40, 0, 50], [41, 80, 51, 100], [81, 180, 101, 200], [181, 280, 201, 300], [281, 400, 301, 400], [401, 500, 401, 500]],
  SO2: [[0, 40, 0, 50], [41, 80, 51, 100], [81, 380, 101, 200], [381, 800, 201, 300], [801, 1600, 301, 400], [1601, 2000, 401, 500]],
  OZONE: [[0, 50, 0, 50], [51, 100, 51, 100], [101, 168, 101, 200], [169, 208, 201, 300], [209, 748, 301, 400], [749, 900, 401, 500]],
  CO: [[0, 1, 0, 50], [1.1, 2, 51, 100], [2.1, 10, 101, 200], [10.1, 17, 201, 300], [17.1, 34, 301, 400], [34.1, 50, 401, 500]],
};

export const CATEGORIES = [
  [50, 'Good'],
  [100, 'Satisfactory'],
  [200, 'Moderate'],
  [300, 'Poor'],
  [400, 'Very Poor'],
  [Infinity, 'Severe'],
];

export function normalisePollutant(id) {
  const p = String(id || '').trim().toUpperCase().replace(/\s+/g, '');
  if (p === 'O3') return 'OZONE';
  if (p === 'PM25') return 'PM2.5';
  return p;
}

export function category(aqi) {
  if (aqi == null || !Number.isFinite(aqi)) return null;
  return CATEGORIES.find(([max]) => aqi <= max)[1];
}

// Concentration -> sub-index, by linear interpolation. Values in the gaps
// between bands (e.g. PM2.5 30.5) use the band whose upper bound they are under.
export function subIndex(pollutant, conc) {
  const bands = BREAKPOINTS[pollutant];
  if (!bands || conc == null || !Number.isFinite(conc) || conc < 0) return null;
  for (const [cLo, cHi, iLo, iHi] of bands) {
    if (conc <= cHi) {
      const c = Math.max(conc, cLo);
      return iLo + ((c - cLo) * (iHi - iLo)) / (cHi - cLo);
    }
  }
  return 500;
}

// Sub-index -> concentration (the inverse of subIndex).
export function concFromIndex(pollutant, idx) {
  const bands = BREAKPOINTS[pollutant];
  if (!bands || idx == null || !Number.isFinite(idx) || idx < 0) return null;
  for (const [cLo, cHi, iLo, iHi] of bands) {
    if (idx <= iHi) {
      const i = Math.max(idx, iLo);
      return cLo + ((i - iLo) * (cHi - cLo)) / (iHi - iLo);
    }
  }
  return bands[bands.length - 1][1];
}

function num(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || s.toUpperCase() === 'NA') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// CPCB "dd-mm-yyyy hh:mm:ss" in IST -> ISO string.
export function parseCpcbTime(s) {
  const m = /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const d = new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}+05:30`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

/**
 * Turn one city's rows (one row per station per pollutant) into a city summary.
 *
 * valuesAre:
 *   'index'         – the feed's averages are already CPCB sub-indices (what the
 *                     data.gov.in real-time feed publishes today). AQI = highest
 *                     averaged sub-index; PM2.5/PM10 µg/m³ are worked back from it.
 *   'concentration' – the averages are concentrations; each is converted to a
 *                     sub-index with the breakpoint table.
 *
 * Returns null when there is no usable reading.
 */
export function computeCity(rows, { valuesAre = 'index' } = {}) {
  const sums = {};
  const stations = new Set();
  let last = null;

  for (const r of rows || []) {
    const pollutant = normalisePollutant(r.pollutant_id);
    if (!BREAKPOINTS[pollutant]) continue; // e.g. NH3 is not in our table
    const v = num(r.pollutant_avg ?? r.avg_value);
    if (v == null) continue;
    (sums[pollutant] ||= { total: 0, n: 0 });
    sums[pollutant].total += v;
    sums[pollutant].n += 1;
    if (r.station) stations.add(r.station);
    const t = parseCpcbTime(r.last_update);
    if (t && (!last || t > last)) last = t;
  }

  const subs = {};
  const conc = {};
  for (const [p, { total, n }] of Object.entries(sums)) {
    const avg = total / n;
    if (valuesAre === 'concentration') {
      conc[p] = avg;
      subs[p] = subIndex(p, avg);
    } else {
      subs[p] = avg;
      conc[p] = concFromIndex(p, avg);
    }
  }

  let dominant = null;
  let best = -1;
  for (const [p, s] of Object.entries(subs)) {
    if (s != null && s > best) { best = s; dominant = p; }
  }
  if (dominant == null) return null;

  const aqi = Math.min(500, Math.round(best));
  return {
    aqi,
    category: category(aqi),
    dominant,
    pm25: conc['PM2.5'] != null ? Math.round(conc['PM2.5']) : null,
    pm10: conc.PM10 != null ? Math.round(conc.PM10) : null,
    subIndex: Object.fromEntries(Object.entries(subs).map(([p, s]) => [p, round1(s)])),
    stations: stations.size,
    lastUpdate: last,
  };
}
