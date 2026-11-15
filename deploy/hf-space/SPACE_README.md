---
title: Earth Jukebox
emoji: 🌍
colorFrom: indigo
colorTo: green
sdk: docker
app_port: 7860
pinned: false
short_description: Hear NASA aerosols and the live weather as music
---

# Earth Jukebox

**Hear the planet NASA shows us.** Earth Jukebox turns a NASA aerosol visualization and the live weather of the whole planet into music you can explore by ear. It is built for blind and low-vision listeners first. Made for the NASA Space Apps Challenge 2026 challenge [The Earth Information Jukebox](https://www.spaceappschallenge.org/2026/challenges/the-earth-information-jukebox/).

Source code and documentation: <https://github.com/dankozz1t/nasa-earth-jukebox>

## Data

- NASA Scientific Visualization Studio and NASA GMAO, [SVS 5669](https://svs.gsfc.nasa.gov/5669/) "GEOS Aerosols (2025)".
- We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS).
- Weather data by [Open-Meteo.com](https://open-meteo.com/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## AI

On the Live side a Claude model can write the score as JSON from the weather values when this Space has an API key. It never makes audio. Without a key, or past the spend limits, the rule-based composer plays.
