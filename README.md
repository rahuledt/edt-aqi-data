# edt-aqi-data

Publishes a small static file, `aqi.json`, with the current Indian AQI for nine cities. The EDT Shopify theme's "Outdoor AQI" card reads it. There is no server: a scheduled GitHub Action pulls CPCB real-time readings from data.gov.in every 30 minutes, works out the AQI and deploys the file to GitHub Pages.

Published file: https://rahuledt.github.io/edt-aqi-data/aqi.json

Cities: Mumbai, Delhi, Bengaluru, Hyderabad, Chennai, Kolkata, Pune, Ahmedabad, Jaipur.

## Setup

1. **Add the API key.** Repo Settings → Secrets and variables → Actions → New repository secret. Name: `CPCB_API_KEY`. Value: your data.gov.in API key (from your data.gov.in account page). The key is only read from this secret and is never written to logs or to the published file.
2. **Turn on Pages.** Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. **First run.** Actions → Build AQI → Run workflow. When it finishes, open https://rahuledt.github.io/edt-aqi-data/aqi.json and check it has data.
4. **Keep an eye on it.** GitHub can start scheduled runs several minutes late, and it pauses schedules on repos with no activity for 60 days (you'll get an email; re-enable it from the Actions tab). Check the Actions tab now and then.
5. **CORS.** GitHub Pages sends `Access-Control-Allow-Origin: *`, so the Shopify theme can fetch the file directly from the browser.

## Output

```json
{
  "generatedAt": "2026-11-25T01:00:00.000Z",
  "source": "CPCB via data.gov.in",
  "cities": {
    "Mumbai": {
      "aqi": 116, "category": "Moderate", "dominant": "PM10",
      "pm25": 59, "pm10": 124,
      "subIndex": { "PM2.5": 97.6, "PM10": 116.2, "NO2": 41.3, "SO2": 14.6, "CO": 45.7, "OZONE": 15.1 },
      "stations": 25, "lastUpdate": "2026-11-24T23:30:00.000Z"
    }
  }
}
```

- `pm25` and `pm10` are µg/m³. `lastUpdate` is the newest station reading (CPCB times are IST; stored as UTC ISO).
- If a city fails or has no usable readings, its last published value is kept with `"stale": true`.
- If every city fails, the run exits with an error and the published file is left as it was.

## How the AQI is worked out

The feed has one row per station per pollutant (`pollutant_id`, `avg_value`/`pollutant_avg`, `station`, `last_update`). `"NA"` values are skipped, `O3` is treated as `OZONE`, and NH3 is ignored (not in the breakpoint table). For each city, each pollutant is averaged across stations, a CPCB sub-index is found for each, and the AQI is the highest sub-index (the dominant pollutant), capped at 500. Categories: 0–50 Good, 51–100 Satisfactory, 101–200 Moderate, 201–300 Poor, 301–400 Very Poor, 401+ Severe.

**Important: the feed's values are already sub-indices, not concentrations.** Checked against live data on 25 Nov 2026: several Mumbai stations report a PM2.5 value higher than PM10 (e.g. Malad West 112 vs 106), which is physically impossible for concentrations, and CO values such as 73 would mean extreme mg/m³ levels. So by default (`AQI_VALUES=index`) the averaged values are used as sub-indices directly, and PM2.5/PM10 µg/m³ are worked back from them with the breakpoint table. If CPCB ever switches the feed to concentrations, set `AQI_VALUES=concentration` (as an env value in the workflow) and the breakpoint table converts concentrations to sub-indices instead.

## Local run

```sh
cp .env.example .env   # add your key
set -a; . ./.env; set +a
npm test
npm run build          # writes out/aqi.json; AQI_SAMPLE=1 prints one raw record per city
```

Node 20 or newer. No dependencies.
