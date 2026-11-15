# Data sources

| Source | Used for | Is it NASA data? | License |
|---|---|---|---|
| NASA SVS 5669, GEOS Aerosols (2025) | "NASA archive" side: the frame that is turned into music | Yes | NASA SVS content is public domain unless noted |
| NASA GIBS, Blue Marble Shaded Relief + Bathymetry | Basemap under the live weather heat map | Yes (imagery) | NASA EOSDIS open data |
| Open-Meteo | "Live" side: current temperature, precipitation, cloud cover, wind | No | Data CC BY 4.0, free API for non-commercial use |

## NASA SVS 5669

- GEOS Aerosols (2025), NASA Scientific Visualization Studio, ID 5669. Frame 19 August 2025, 20:00 UTC. Model: GEOS-FP 2 km Replay (NASA GMAO).
- Page: <https://svs.gsfc.nasa.gov/5669/>. Frame and colour bar are stored in [backend/src/EarthJukebox.Api/Data/frames/svs-5669](../backend/src/EarthJukebox.Api/Data/frames/svs-5669/).
- Full notice: [sound-service/NOTICE.md](../sound-service/NOTICE.md).

## NASA GIBS

- Layer `BlueMarble_ShadedRelief_Bathymetry` from the GIBS WMS (`gibs.earthdata.nasa.gov`), fetched by the backend from NASA GIBS at most daily and served with a 6 h cache. If a refresh fails, the last image stays.
- We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS).

## Open-Meteo

- `api.open-meteo.com/v1/forecast`, current values for 648 points (10° grid), no API key.
- Weather data by [Open-Meteo.com](https://open-meteo.com/), from the weather models of national weather services, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The live panel shows a visible credit ("Weather data: Open-Meteo.com (CC BY 4.0)", linked to both), and the How it works page names it too.
- Refreshed every 30 minutes (at :00 and :30), in the background. The service keeps within 80% of the free daily limit. If Open-Meteo is unreachable or rate-limits the service, the bundled snapshot plays and the UI marks it as a snapshot and says why. `ES_WEATHER_OFFLINE=true` forces the snapshot.

## Limits of the method

- **The aerosol sound comes from the picture, not from model numbers.** SVS publishes the visualization, not the raw GEOS data. Loudness means how much of the map a colour covers, not concentration or optical depth.
- **One frame, so no time.** The scan moves through space (west to east), not through days.
- **Colour sorting is not perfect.** Sea Salt colours spill onto land in places, mixed aerosols (dust plus smoke) go to the stronger one, city lights can look like Black Carbon.
- **Live weather is not NASA data.** It comes from Open-Meteo; NASA provides only the basemap. The UI keeps the two sources apart and labels them.
- **A 10° grid misses local showers.** Values between points are interpolated.

## Other assets

| Asset | License |
|---|---|
| Fonts: Golos Text, Unbounded, IBM Plex Mono, Atkinson Hyperlegible Next (Braille Institute), bundled through Fontsource, no requests to Google | SIL Open Font License 1.1 |
| Icons: Lucide | ISC |
