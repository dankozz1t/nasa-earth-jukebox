# Sound mapping

Both sources work the same way at heart: a line moves across the world map from west to east, and what it crosses becomes notes. Time is longitude.

## NASA archive: the aerosol frame

Input: one frame of NASA SVS 5669 (GEOS aerosols, 19 Aug 2025, 20:00 UTC), or any map image you upload.

1. **Split by colour.** Each pixel is sorted into one of the four legend layers by its hue (HSV), or into "none".
2. **Scan columns.** The map is cut into 128 vertical columns. For each column and layer we measure how much of the column the layer covers (corrected by cos(latitude), so polar pixels do not count as much as equatorial ones) and where its strongest band sits.
3. **Make notes.**

| What the map shows | What you hear |
|---|---|
| Longitude (west to east scan) | Time |
| Share of the column a layer covers | Loudness |
| Latitude of the layer's main band | Pitch: north is higher |
| Aerosol type | Instrument: Black Carbon = smoky saw, Dust = warm pad, Sea Salt = airy voice with surf noise, Sulfate = FM bell |

4. **Fit to music.** Modes: `raw` (chromatic, closest to the data), `scale` (D Dorian), `harmony` (notes snap to a slow Dm9, Gsus2, Cmaj7, Am7 progression). A quiet harmony bed plays under the layers. Sensitivity sets how faint a layer may be and still sound.

Output: five WAV stems (four layers and the bed), a MIDI file and a class map image. Each layer is its own stem, so muting a layer in the player removes exactly that layer.

## Live: the weather map

Input: current weather from Open-Meteo on a 10° grid (648 points), refreshed every 30 minutes at :00 and :30.

1. **Draw a sine wave across the planet.** Longitude runs from 180° W to 180° E over the piece. Latitude follows `A × 80° × cos(2π × k × t)`: `k` is how many waves (density), `A` is how far north and south it reaches (range). It starts in the north.
2. **Read the weather under the wave.** For every bar we take the mean, min and max of the chosen layer under the wave and turn it into a level from 0 to 1.
3. **Compose a score.** A composer turns those bar levels into a score: chords, a melody in the section's key, arpeggio density, pads, rhythm, accents. The rule-based composer does this deterministically. The optional AI composer writes the same score format (see [ai.md](ai.md)). Every score is checked before it plays: right number of bars, chords from the key, notes on the grid, safe loudness.
4. **Play it with 6–7 instruments.**

| Layer | Key, tempo | Lead | Arpeggio | Texture | The data drives |
|---|---|---|---|---|---|
| Temperature | D, 84 BPM | piano | marimba | none | warmer = higher and brighter |
| Precipitation | A, 76 BPM | piano | harp | rain | more rain = denser arpeggios, louder rain |
| Clouds | F, 68 BPM | flute | harp | none | more cloud = thicker string pad |
| Wind | G, 96 BPM | flute | marimba | wind | stronger wind = faster rhythm, louder wind |

Strings, bass, chimes (on peaks) and shaker always play. The loudness of every bar follows the data, whatever the composer wrote.

5. **Stereo.** Pan follows the wave's latitude: the northern hemisphere is in the left ear, the southern in the right (`pan = -lat / 80°`). Mono mode turns this off.

The aerosol composer (Sound settings, Composer) plays the live weather through the aerosol engine instead: the weather level picks which aerosol voice sings, low to high: smoky, warm pad, bell, airy voice.

## Exploring without playing

Hovering or moving the keyboard cursor over the map plays a short probe tone for that point (pentatonic, noise for rain and wind) and shows its value, so the map can be explored by ear before pressing Play.
