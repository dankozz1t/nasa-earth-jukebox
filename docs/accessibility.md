# Accessibility

The challenge asks for Earth data that blind and low-vision people can use. Accessibility is the core of the design, not an add-on. All settings sit in one drawer: the **Accessibility** button in the header, or the `A` key. Changes apply at once and are kept in the browser.

| Who | What the app does |
|---|---|
| Blind users, screen readers | The map is a keyboard slider (arrows move 5°, Shift 20°); every point is played and named ("Sahara (27°N, 0°): Dust 80%"). Polite live announcements while playing, at most every 4 s. `W` where am I, `D` describe the whole map, `L` when the live reading was taken and when the next comes, `?` all keys. Skip links to presets, player and map. Built on standard ARIA roles and live regions and checked with axe-core; manual screen-reader passes are still pending (see [Known gaps](#known-gaps)). |
| Users without a screen reader | Built-in narration with the device voice (Web Speech API), adjustable speed, `S` to toggle. Off by default so it does not double a screen reader. |
| Low vision | Text size 100 / 125 / 150%, Atkinson Hyperlegible font, high contrast (follows `prefers-contrast` and Windows High Contrast), thick focus ring, targets at least 44 px, dark theme. |
| Colour blindness | Okabe–Ito palette instead of NASA's red and green, plus a texture per layer (cross, dots, lines, diagonals), so layers differ without colour. |
| Deaf and hard of hearing | Live sound captions on by default ("♪ Bell (Sulfate), high, clear"). Level bars per layer. WebVTT captions for downloaded audio. |
| Touch and tactile | Vibration with layer strength (Android). Tactile SVG map in black-and-white textures with a braille legend, for swell paper or braille embossers. |
| Sound sensitivity | Volume control (`-` / `=`), soft high-frequency roll-off in the synth, mono mode when moving stereo is uncomfortable. |
| Motor | Everything works from the keyboard; nothing needs hover or gestures. Layer keys `1`–`7` mute, `Shift`+`1`–`7` solo. `P` jumps to presets, `[` `]` previous/next preset. |
| Cognitive, vestibular | One click on a preset plays it; settings are hidden in a drawer. Reduced motion follows `prefers-reduced-motion`. A "How it works" page in plain words with diagrams and text alternatives, plus views for scientists and for engineers. |
| Language | English and Ukrainian for the UI, descriptions, captions, narration and place names. `<html lang>` and the narration voice follow the switch. |

No autoplay: sound starts only after a click or a key press.

## Export for other tools

| Export | For |
|---|---|
| WAV, MIDI | Any player or music software |
| WebVTT captions | VLC, HTML5 players, video |
| CSV (step, time, longitude, chord, per-layer values) | [TwoTone](https://twotone.io), [Highcharts Sonification Studio](https://sonification.highcharts.com) |
| Tactile SVG | Swell paper, braille embossers |
| Plain text description | Any reader |

## How it was checked

- `npm test` runs axe-core (WCAG 2.2 A and AA) on the home page, both sources, both languages, light and dark theme, with the settings drawers open, and on all three views of `/how`. Zero violations.
- Unit tests check that every UI string is translated, that no text is hard-coded in components, and that every registered key is listed in the `?` dialog.
- Contrast computed with the WCAG formula: body text 16.9:1, muted text at least 7.2:1.

## Platform notes

- A Ukrainian voice is missing on some devices (Windows without the language pack); the app says so and uses the default voice.
- Atkinson Hyperlegible has no Cyrillic; Ukrainian letters fall back to the system font.
- Vibration works only in Android browsers. The braille legend is English Grade 1.
