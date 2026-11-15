import { useRef, type KeyboardEvent } from "react";
import { useT } from "../../shared/i18n";
import { rovingIndex } from "../../shared/lib/roving";
import type { Preset, PresetId } from "./presets";
import { shelfItems, SIDE } from "./shelf";
import { useSession, type SessionPresetId, type Source } from "./session.store";
import { Sleeve, type SleeveProgress } from "./Sleeve";
import styles from "./presets.module.css";

interface PresetShelfProps {
  source?: Source; // the row to show; the session's source when absent
  selectedId: SessionPresetId | null;
  playingId: SessionPresetId | null;
  custom?: Preset; // the mix that "custom" means now, of either source
  mixes?: Partial<Record<Source, Preset>>;
  progressFor(id: SessionPresetId): SleeveProgress | undefined;
  disabledFor(id: PresetId): string | undefined;
  errorFor?(id: SessionPresetId): string | undefined;
  noteFor?(id: SessionPresetId): string | undefined;
  onPick(id: PresetId): void;
  onMix(source: Source): void; // the row's first record: its own mix
  onPeek?(id: PresetId): void;
}

function Row({ source, ...p }: Omit<PresetShelfProps, "source"> & { source: Source }) {
  const { t } = useT();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const side = SIDE[source];
  const headingId = `shelf-${side}`;
  const items = shelfItems(source, p.mixes?.[source]);
  // "custom" belongs to this row only while the mix it means is of this source.
  const mine = (id: SessionPresetId | null) =>
    id !== null && (id !== "custom" || p.custom?.source === source);
  const selectedId = mine(p.selectedId) ? p.selectedId : null;
  const playingId = mine(p.playingId) ? p.playingId : null;
  const selectedIdx = items.findIndex((x) => x.id === selectedId);
  const stop = selectedIdx >= 0 ? selectedIdx : 0;

  function onKeyDown(e: KeyboardEvent) {
    const cur = refs.current.findIndex((el) => el === document.activeElement);
    if (cur < 0) return;

    const next = rovingIndex(e.key, cur, items.length);
    if (next === null) return;

    e.preventDefault();
    refs.current[next]?.focus();
  }

  return (
    <section className={styles.row} data-side={side} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.rowTitle}>
        {t(side === "A" ? "preset.sideA" : "preset.sideB")}
      </h2>
      <div role="radiogroup" aria-labelledby={headingId} className={styles.rail}>
        {items.map(({ id, preset, custom, fresh }, i) => (
          <Sleeve
            key={id}
            preset={preset}
            custom={custom}
            fresh={fresh}
            selected={selectedId === id}
            playing={playingId === id}
            progress={mine(id) ? p.progressFor(id) : undefined}
            disabled={custom ? undefined : p.disabledFor(preset.id)}
            error={mine(id) ? p.errorFor?.(id) : undefined}
            note={p.noteFor?.(id)}
            tabIndex={i === stop ? 0 : -1}
            buttonRef={(el) => {
              refs.current[i] = el;
            }}
            onKeyDown={onKeyDown}
            onPick={() => (custom ? p.onMix(source) : p.onPick(preset.id))}
            onPeek={p.onPeek && !custom ? () => p.onPeek!(preset.id) : undefined}
          />
        ))}
      </div>
    </section>
  );
}

// One row, for the source the person chose. The other source keeps its selection in the session, but its
// sleeves are not on the shelf, so a record of the other kind never looks like part of this choice.
export function PresetShelf({ source, ...props }: PresetShelfProps) {
  const sessionSource = useSession((s) => s.source);
  const shown = source ?? sessionSource;

  return (
    <div className={styles.shelf}>
      <Row key={shown} {...props} source={shown} />
    </div>
  );
}
