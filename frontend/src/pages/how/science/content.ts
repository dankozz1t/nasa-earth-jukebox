// The view for scientists as data, in both languages. It is a lazy chunk, so its words stay out of the
// shared dictionary and the main bundle. Facts come from docs/sound-mapping.md, docs/data-sources.md,
// docs/accessibility.md and sound-service (domain/music/score.py,
// domain/aerosols/layers.py, domain/weather/sections.py, domain/weather/plan.py).

import type { Lang } from "../../../shared/i18n";
import type { Rich, TableSpec } from "../tech/model";

export type ScienceBlock =
  | { kind: "p"; text: Rich }
  | { kind: "h3"; text: string }
  | { kind: "list"; items: Rich[] }
  | { kind: "table"; table: TableSpec }
  | { kind: "flow"; label: string; steps: Rich[] };

export type ScienceSectionId = "science" | "nasa" | "music";

export interface ScienceSection {
  id: ScienceSectionId;
  title: string;
  blocks: ScienceBlock[];
}

export interface ScienceContent {
  intro: string;
  toc: string;
  sections: ScienceSection[];
}

const en: ScienceContent = {
  intro:
    "How Earth Jukebox turns Earth data into sound, from three sides: what the data measures, which NASA assets we use, and how the music is chosen.",
  toc: "On this page",
  sections: [
    {
      id: "science",
      title: "Science: from data to sound",
      blocks: [
        {
          kind: "p",
          text: "Earth Jukebox uses parameter mapping sonification: each data dimension drives one sound parameter by a fixed rule. A line moves across the world map from west to east, and what it crosses becomes notes. Time is longitude.",
        },
        { kind: "h3", text: "NASA archive: aerosols" },
        {
          kind: "p",
          text: "The input is one frame of NASA SVS 5669, GEOS Aerosols (2025): 19 August 2025, 20:00 UTC, from the GEOS-FP 2 km Replay model (NASA GMAO). Its legend has four aerosol types: black carbon (soot from fires and fuel), dust (from deserts), sea salt (spray from wind over the oceans) and sulfate (industry, power plants, volcanoes).",
        },
        {
          kind: "flow",
          label: "From the aerosol frame to sound",
          steps: [
            "The frame and its colour legend",
            "Each pixel goes to one of four layers by its hue, or to none",
            "128 columns, west to east",
            "Per column and layer: the share covered, weighted by cos(latitude), and the latitude of its main band",
            "Notes, then five WAV stems, MIDI and CSV",
          ],
        },
        {
          kind: "table",
          table: {
            id: "sci-aerosol-map",
            caption: "Aerosol frame: what maps to what",
            columns: ["On the map", "In the sound"],
            rows: [
              ["Longitude (west to east)", "Time"],
              ["Share of the column a layer covers", "Loudness"],
              ["Latitude of the layer's main band", "Pitch: further north is higher"],
              ["Aerosol type", "Instrument"],
            ],
          },
        },
        {
          kind: "p",
          text: "Sensitivity (five steps) sets how small a share may be and still sound. Cos(latitude) keeps polar pixels from counting as much as equatorial ones on this map projection.",
        },
        { kind: "h3", text: "Live: weather" },
        {
          kind: "p",
          text: "Current weather from Open-Meteo at 648 points on a 10° grid: temperature, precipitation, cloud cover and wind. It is model data from national weather services, refreshed every 30 minutes, at :00 and :30.",
        },
        {
          kind: "flow",
          label: "From the weather grid to sound",
          steps: [
            "Open-Meteo grid, 648 points",
            "A sine wave crosses the planet: longitude 180° W to 180° E, latitude `A × 80° × cos(2π k t)`",
            "Per bar: mean, min and max under the wave from 16 samples, scaled to a level from 0 to 1",
            "A composer writes the score: rules, or AI in the same format",
            "The score is checked, then 6 to 7 instruments play it",
          ],
        },
        {
          kind: "table",
          table: {
            id: "sci-weather-range",
            caption: "Weather: the range that becomes the level from 0 to 1",
            columns: ["Layer", "Unit", "Level 0", "Level 1", "Scale"],
            rows: [
              ["Temperature", "°C", "−30", "40", "linear"],
              ["Precipitation", "mm/h", "0", "8", "logarithmic"],
              ["Clouds", "%", "0", "100", "linear"],
              ["Wind", "km/h", "0", "60", "linear"],
            ],
          },
        },
        {
          kind: "p",
          text: "`k` is the density (0.5 to 12 waves) and `A` the reach (10 to 100 %). The wave starts in the north. Values outside the range are clamped.",
        },
        { kind: "h3", text: "Honest limits" },
        {
          kind: "list",
          items: [
            "The aerosol sound comes from the picture, not from model numbers. SVS publishes the visualization, not the raw GEOS data. Loudness reflects how much of the frame a colour covers, not concentration or optical depth.",
            "One frame, so no time. The scan moves through space, west to east, not through days.",
            "Colour sorting is not perfect. Sea salt colours spill onto land in places, mixed aerosols go to the stronger one, and city lights can look like black carbon.",
            "Live weather is model data, not a station reading, and it is not NASA data. A 10° grid misses local showers. Values between points are interpolated.",
          ],
        },
        { kind: "h3", text: "Why the mapping is still faithful and testable" },
        {
          kind: "list",
          items: [
            "Fixed rules. A larger share is never quieter, and further north is never lower. In Raw data mode pitch follows latitude chromatically. Scale and Harmony move it to the nearest allowed note, so the shape stays.",
            "Same input, same notes. Every input goes into a `sha256` id, and the rule composer uses a fixed seed, so the same frame and settings give byte identical WAV and MIDI.",
            "The AI composer is the one exception: it may write a different score each time. Its score must pass the same checks, and the loudness of every bar follows the data whatever the composer wrote.",
            "Everything can be checked outside the app. Archive: CSV (step, time, longitude, chord, and coverage, strength and latitude per layer), MIDI and WAV. Live: the score dataset as JSON (bars and notes) and WAV.",
          ],
        },
      ],
    },
    {
      id: "nasa",
      title: "NASA: the assets and how we use them",
      blocks: [
        {
          kind: "table",
          table: {
            id: "sci-nasa-assets",
            caption: "NASA assets in Earth Jukebox",
            columns: ["Asset", "What it is", "How we use it"],
            rows: [
              [
                "NASA SVS 5669, GEOS Aerosols (2025)",
                "A Scientific Visualization Studio frame from the GEOS-FP 2 km Replay model (NASA GMAO), 19 August 2025, 20:00 UTC, with its colour legend. One of the Earth Information Center resources listed for this challenge.",
                "The NASA archive side. The frame is analysed column by column and becomes the music, and it is the map you explore.",
              ],
              [
                "NASA GIBS, Blue Marble Shaded Relief and Bathymetry",
                "A global imagery layer from NASA's Global Imagery Browse Services, part of EOSDIS.",
                "The basemap under the live weather map. Our backend fetches it and caches it.",
              ],
            ],
          },
        },
        {
          kind: "p",
          text: "Why this frame: its legend gives four clean classes, so each aerosol type can be its own instrument, and the colour legend ties each colour to a type.",
        },
        { kind: "h3", text: "What sound adds" },
        {
          kind: "list",
          items: [
            "NASA already turns images into sound. Its Caldwell 73 sonification (SVS 13786, Hubble data) scans the image and maps brightness and position to volume and pitch. We take the same idea to Earth: one EIC frame becomes a piece where you can hear where dust, smoke and sea salt sit.",
            "A still picture has no time axis. The scan gives it one, so a plume becomes something you follow from start to end.",
            "Each aerosol type is its own stem. Mute or solo a layer and you hear exactly that layer, which a single image cannot do.",
            "Blind and low vision listeners get the frame by ear, with the keyboard map explorer, captions and a tactile print.",
          ],
        },
        {
          kind: "p",
          text: "What is not NASA: the live weather comes from Open-Meteo (CC BY 4.0). There NASA provides only the basemap. The app keeps the two sources apart and labels them.",
        },
      ],
    },
    {
      id: "music",
      title: "Music: how the choices are made",
      blocks: [
        {
          kind: "table",
          table: {
            id: "sci-music",
            caption: "Musical parameters on each side",
            columns: ["Parameter", "NASA archive", "Live weather"],
            rows: [
              [
                "Pitch",
                "Latitude of each layer's main band, north higher. Each layer has its own register so the voices do not collide.",
                "Rises with the value: warmer, wetter, cloudier or windier sings higher.",
              ],
              [
                "Instrument",
                "One per aerosol type: black carbon a smoky saw, dust a warm pad, sea salt an airy voice with surf noise, sulfate an FM bell.",
                "Each layer has its own lead, arpeggio and texture (table below). Strings, bass, chimes on peaks and a shaker always play.",
              ],
              [
                "Loudness",
                "The share of the column, through a gentle curve, capped so the largest plumes do not jump out.",
                "Follows the level of every bar.",
              ],
              [
                "Rhythm",
                "128 steps across the scan. The same pitch on neighbouring steps joins into one long note.",
                "Busier as the level rises: more rain gives denser arpeggios, stronger wind a faster rhythm. A bell marks peaks.",
              ],
              [
                "Scale and mode",
                "Raw data: chromatic. Scale: D Dorian. Harmony: notes snap to a slow Dm9, Gsus2, Cmaj7, Am7 progression. A soft root note plays under each chord.",
                "Major or minor from the overall level, with chords from that key.",
              ],
              [
                "Tempo",
                "The 128 steps fill the length you choose.",
                "Fixed per layer, from 68 to 96 BPM.",
              ],
              [
                "Stereo and time",
                "Time runs west to east.",
                "Time runs west to east. North sounds in the left ear, south in the right: `pan = −latitude / 80°`. Mono mode turns this off.",
              ],
            ],
          },
        },
        {
          kind: "table",
          table: {
            id: "sci-sections",
            caption: "Live weather: the ensemble of each layer",
            columns: ["Layer", "Key", "Tempo", "Lead", "Arpeggio", "Texture"],
            rows: [
              ["Temperature", "D", "84 BPM", "piano", "marimba", "none"],
              ["Precipitation", "A", "76 BPM", "piano", "harp", "rain"],
              ["Clouds", "F", "68 BPM", "flute", "harp", "none"],
              ["Wind", "G", "96 BPM", "flute", "marimba", "wind"],
            ],
          },
        },
        { kind: "h3", text: "Why these choices are easy for the ear" },
        {
          kind: "list",
          items: [
            "Up on the map is up in pitch, and east is later in time, so the sound reads like the map.",
            "Four timbres in four registers can be told apart at once, and each can be muted on its own.",
            "A direct pixel to sound translation tends to sound like noise. Scale and Harmony keep the shape of the data with fewer clashes, and each note is pulled towards the one before it, so lines move in small steps.",
            "Loudness is capped and the synth rolls off high frequencies softly, so peaks never get harsh.",
            "Before you press Play, hovering or moving the keyboard cursor over the map plays a short tone for that point, so the mapping can be learned by ear.",
          ],
        },
      ],
    },
  ],
};

const uk: ScienceContent = {
  intro:
    "Як Earth Jukebox перетворює дані про Землю на звук, з трьох боків: що вимірюють дані, які ресурси NASA ми беремо і як обираємо музику.",
  toc: "На цій сторінці",
  sections: [
    {
      id: "science",
      title: "Наука: від даних до звуку",
      blocks: [
        {
          kind: "p",
          text: "Earth Jukebox робить соніфікацію через мапінг параметрів: кожен вимір даних керує одним параметром звуку за сталим правилом. Лінія йде картою світу із заходу на схід, і все, що вона перетинає, стає нотами. Час тут це довгота.",
        },
        { kind: "h3", text: "Архів NASA: аерозолі" },
        {
          kind: "p",
          text: "На вході один кадр NASA SVS 5669, GEOS Aerosols (2025): 19 серпня 2025, 20:00 UTC, модель GEOS-FP 2 km Replay (NASA GMAO). У легенді чотири типи аерозолів: сажа (від пожеж і палива), пил (з пустель), морська сіль (бризки, які вітер здіймає над океаном) і сульфати (промисловість, електростанції, вулкани).",
        },
        {
          kind: "flow",
          label: "Від кадру аерозолів до звуку",
          steps: [
            "Кадр і його колірна легенда",
            "Кожен піксель за відтінком іде в один із чотирьох шарів або в жоден",
            "128 стовпців, із заходу на схід",
            "Для кожного стовпця і шару: яку частку він займає з поправкою на cos(широти) і на якій широті його головна смуга",
            "Ноти, потім п'ять WAV-стемів, MIDI і CSV",
          ],
        },
        {
          kind: "table",
          table: {
            id: "sci-aerosol-map",
            caption: "Кадр аерозолів: що в що перетворюється",
            columns: ["На карті", "У звуці"],
            rows: [
              ["Довгота (із заходу на схід)", "Час"],
              ["Частка стовпця, яку займає шар", "Гучність"],
              ["Широта головної смуги шару", "Висота тону: північніше звучить вище"],
              ["Тип аерозолю", "Інструмент"],
            ],
          },
        },
        {
          kind: "p",
          text: "Чутливість (п'ять кроків) задає, наскільки малою може бути частка, щоб ще звучати. Поправка на cos(широти) не дає полярним пікселям важити стільки ж, скільки екваторіальним у цій проєкції карти.",
        },
        { kind: "h3", text: "Наживо: погода" },
        {
          kind: "p",
          text: "Поточна погода від Open-Meteo у 648 точках на сітці 10°: температура, опади, хмарність і вітер. Це дані моделей національних метеослужб. Вони оновлюються кожні 30 хвилин, о :00 і :30.",
        },
        {
          kind: "flow",
          label: "Від сітки погоди до звуку",
          steps: [
            "Сітка Open-Meteo, 648 точок",
            "Синусоїда йде планетою: довгота від 180° зх. д. до 180° сх. д., широта `A × 80° × cos(2π k t)`",
            "Для кожного такту середнє, мінімум і максимум під хвилею з 16 замірів, зведені до рівня від 0 до 1",
            "Композитор пише партитуру: правила або AI у тому самому форматі",
            "Партитуру перевіряють, потім її грають 6 або 7 інструментів",
          ],
        },
        {
          kind: "table",
          table: {
            id: "sci-weather-range",
            caption: "Погода: діапазон, який стає рівнем від 0 до 1",
            columns: ["Шар", "Одиниця", "Рівень 0", "Рівень 1", "Шкала"],
            rows: [
              ["Температура", "°C", "−30", "40", "лінійна"],
              ["Опади", "мм/год", "0", "8", "логарифмічна"],
              ["Хмарність", "%", "0", "100", "лінійна"],
              ["Вітер", "км/год", "0", "60", "лінійна"],
            ],
          },
        },
        {
          kind: "p",
          text: "`k` це щільність (від 0.5 до 12 хвиль), а `A` розмах (від 10 до 100 %). Хвиля стартує на півночі. Значення поза діапазоном обрізаються до меж.",
        },
        { kind: "h3", text: "Чесні обмеження" },
        {
          kind: "list",
          items: [
            "Звук аерозолів іде з картинки, а не з чисел моделі. SVS публікує візуалізацію, а не сирі дані GEOS. Гучність показує, скільки кадру займає колір, а не концентрацію чи оптичну товщину.",
            "Один кадр, тож часу немає. Скан рухається простором, із заходу на схід, а не днями.",
            "Сортування за кольором неідеальне. Колір морської солі місцями заходить на сушу, змішані аерозолі йдуть до сильнішого, а вогні міст можуть виглядати як сажа.",
            "Погода наживо це дані моделі, а не заміри станції, і це не дані NASA. Сітка 10° пропускає місцеві зливи. Значення між точками інтерпольовані.",
          ],
        },
        { kind: "h3", text: "Чому мапінг усе одно чесний і його можна перевірити" },
        {
          kind: "list",
          items: [
            "Сталі правила. Більша частка ніколи не звучить тихіше, а північніше ніколи не звучить нижче. У режимі «Сирі дані» висота тону йде за широтою хроматично. «Лад» і «Гармонія» зсувають ноту до найближчої дозволеної, тож форма лишається.",
            "Ті самі дані дають ті самі ноти. Усі вхідні дані йдуть в id через `sha256`, а композитор за правилами має сталий seed. Тож той самий кадр і ті самі налаштування дають побайтово однакові WAV і MIDI.",
            "Виняток лише AI-композитор: він може щоразу писати іншу партитуру. Його партитура проходить ті самі перевірки, а гучність кожного такту йде за даними, хай що написав композитор.",
            "Усе можна перевірити поза застосунком. Архів: CSV (крок, час, довгота, акорд, а для кожного шару покриття, сила і широта), MIDI і WAV. Наживо: партитура-датасет у JSON (такти і ноти) і WAV.",
          ],
        },
      ],
    },
    {
      id: "nasa",
      title: "NASA: які ресурси і як ми їх використовуємо",
      blocks: [
        {
          kind: "table",
          table: {
            id: "sci-nasa-assets",
            caption: "Ресурси NASA в Earth Jukebox",
            columns: ["Ресурс", "Що це", "Як ми його використовуємо"],
            rows: [
              [
                "NASA SVS 5669, GEOS Aerosols (2025)",
                "Кадр Scientific Visualization Studio з моделі GEOS-FP 2 km Replay (NASA GMAO), 19 серпня 2025, 20:00 UTC, разом із колірною легендою. Один із ресурсів Earth Information Center у переліку челенджу.",
                "Сторона «Архів NASA». Кадр аналізуємо стовпець за стовпцем, і він стає музикою. Це також карта, яку ви досліджуєте.",
              ],
              [
                "NASA GIBS, Blue Marble Shaded Relief and Bathymetry",
                "Глобальний шар знімків із Global Imagery Browse Services NASA, частина EOSDIS.",
                "Підкладка під картою погоди наживо. Наш бекенд завантажує її і зберігає в кеші.",
              ],
            ],
          },
        },
        {
          kind: "p",
          text: "Чому саме цей кадр: його легенда дає чотири чисті класи, тож кожен тип аерозолю може бути окремим інструментом, а легенда прив'язує кожен колір до типу.",
        },
        { kind: "h3", text: "Що додає звук" },
        {
          kind: "list",
          items: [
            "NASA вже перетворює зображення на звук. Сонифікація Caldwell 73 (SVS 13786, дані Hubble) сканує зображення і перетворює яскравість і положення на гучність і висоту тону. Ми переносимо цю ідею на Землю: один кадр EIC стає твором, де чутно, де лежать пил, дим і морська сіль.",
            "Нерухома картинка не має осі часу. Скан дає її, тож шлейф стає тим, за чим можна стежити від початку до кінця.",
            "Кожен тип аерозолю це окремий стем. Вимкніть шар або залиште лише його, і почуєте саме цей шар. Одна картинка так не вміє.",
            "Незрячі і слабозорі слухачі отримують кадр на слух, разом із клавіатурним дослідником карти, субтитрами і тактильним друком.",
          ],
        },
        {
          kind: "p",
          text: "Що не від NASA: погода наживо йде з Open-Meteo (CC BY 4.0). Там NASA дає лише підкладку. Застосунок тримає ці два джерела окремо і підписує їх.",
        },
      ],
    },
    {
      id: "music",
      title: "Музика: як ми обираємо",
      blocks: [
        {
          kind: "table",
          table: {
            id: "sci-music",
            caption: "Музичні параметри на кожній стороні",
            columns: ["Параметр", "Архів NASA", "Погода наживо"],
            rows: [
              [
                "Висота тону",
                "Широта головної смуги кожного шару, північ вище. Кожен шар має свій регістр, тож голоси не налазять один на одного.",
                "Росте зі значенням: тепліше, вологіше, хмарніше чи вітряніше звучить вище.",
              ],
              [
                "Інструмент",
                "Свій для кожного типу аерозолю: сажа це димна пилка, пил теплий пед, морська сіль повітряний голос із шумом прибою, сульфати FM-дзвін.",
                "Кожен шар має свою мелодію, арпеджіо і текстуру (таблиця нижче). Струнні, бас, дзвіночки на піках і шейкер грають завжди.",
              ],
              [
                "Гучність",
                "Частка стовпця через м'яку криву, з верхньою межею, щоб найбільші шлейфи не вистрибували.",
                "Іде за рівнем кожного такту.",
              ],
              [
                "Ритм",
                "128 кроків на весь скан. Та сама нота на сусідніх кроках зливається в одну довгу.",
                "Густішає з рівнем: більше дощу дає густіші арпеджіо, сильніший вітер швидший ритм. Дзвін позначає піки.",
              ],
              [
                "Лад",
                "«Сирі дані»: хроматика. «Лад»: ре дорійський. «Гармонія»: ноти тягнуться до повільної послідовності Dm9, Gsus2, Cmaj7, Am7. Під кожним акордом тихо звучить його основний тон.",
                "Мажор чи мінор за загальним рівнем, акорди з цієї тональності.",
              ],
              [
                "Темп",
                "128 кроків заповнюють довжину, яку ви обрали.",
                "Сталий для кожного шару, від 68 до 96 BPM.",
              ],
              [
                "Стерео і час",
                "Час іде із заходу на схід.",
                "Час іде із заходу на схід. Північ звучить у лівому вусі, південь у правому: `pan = −широта / 80°`. Режим моно це вимикає.",
              ],
            ],
          },
        },
        {
          kind: "table",
          table: {
            id: "sci-sections",
            caption: "Погода наживо: ансамбль кожного шару",
            columns: ["Шар", "Тональність", "Темп", "Мелодія", "Арпеджіо", "Текстура"],
            rows: [
              ["Температура", "D", "84 BPM", "фортепіано", "маримба", "немає"],
              ["Опади", "A", "76 BPM", "фортепіано", "арфа", "дощ"],
              ["Хмарність", "F", "68 BPM", "флейта", "арфа", "немає"],
              ["Вітер", "G", "96 BPM", "флейта", "маримба", "вітер"],
            ],
          },
        },
        { kind: "h3", text: "Чому це легко сприймати на слух" },
        {
          kind: "list",
          items: [
            "Вгору на карті означає вгору за висотою тону, а схід означає пізніше в часі. Тож звук читається як карта.",
            "Чотири тембри в чотирьох регістрах легко розрізнити разом, і кожен можна вимкнути окремо.",
            "Пряме перетворення пікселів на звук зазвичай звучить як шум. «Лад» і «Гармонія» зберігають форму даних із меншою кількістю зіткнень. Кожна нота тягнеться до попередньої, тож мелодія йде малими кроками.",
            "Гучність має верхню межу, а синтезатор м'яко зрізає високі частоти, тож піки не ріжуть вухо.",
            "Ще до «Грати» наведення мишкою чи клавіатурний курсор на карті грає короткий тон цієї точки. Так мапінг можна вивчити на слух.",
          ],
        },
      ],
    },
  ],
};

export const CONTENT: Record<Lang, ScienceContent> = { en, uk };
