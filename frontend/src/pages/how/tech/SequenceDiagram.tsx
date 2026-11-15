import { UI } from "./content";
import { Figure, Markers } from "./Figure";
import type { SeqFragment, SequenceSpec } from "./model";
import { plain } from "./rich";
import styles from "./tech.module.css";

const COL = 168;
const MARGIN = 16;
const HEAD_Y = 8;
const HEAD_H = 48;
const LINE_H = 13;
const SELF_W = 34;
const CH = 6.8; // advance of one 11px monospace character, for sizing boxes around labels

interface Layout {
  msgY: number[];
  top: Map<number, number>;
  bottom: Map<number, number>;
  others: Map<string, number>;
  height: number;
}

// Rows grow with their label; a fragment adds a header row where it starts and a little room where it ends.
function layout(spec: SequenceSpec): Layout {
  const { messages, fragments } = spec;
  const outerFirst = fragments.map((f, i) => ({ f, i })).sort((a, b) => b.f.end - a.f.end);
  const innerFirst = fragments.map((f, i) => ({ f, i })).sort((a, b) => b.f.start - a.f.start);
  const msgY: number[] = [];
  const top = new Map<number, number>();
  const bottom = new Map<number, number>();
  const others = new Map<string, number>();
  let y = HEAD_Y + HEAD_H + 16;
  messages.forEach((m, i) => {
    for (const { f, i: fi } of outerFirst) {
      if (f.start === i) {
        top.set(fi, y);
        y += 26;
      }
    }
    fragments.forEach((f, fi) =>
      f.others?.forEach((o, k) => {
        if (o.at !== i) return;
        y += 4;
        others.set(`${fi}-${k}`, y);
        y += 24;
      }),
    );
    y += LINE_H * m.text.split("\n").length;
    msgY[i] = y;
    y += m.from === m.to ? 24 : 12;
    for (const { f, i: fi } of innerFirst) {
      if (f.end === i) {
        y += 4;
        bottom.set(fi, y);
        y += 8;
      }
    }
  });
  return { msgY, top, bottom, others, height: y + 16 };
}

function depth(f: SeqFragment, all: SeqFragment[]): number {
  return all.filter((o) => o !== f && o.start <= f.start && o.end >= f.end).length;
}

const longest = (text: string) => Math.max(...text.split("\n").map((l) => l.length + 4));

// Fragment frames hug the lifelines they cover but always leave room for their guards and for the
// labels of self messages, which run to the right of the lifeline. The drawing widens to fit them.
function frames(spec: SequenceSpec, x: (id: string) => number) {
  const { messages, fragments } = spec;
  const selfRight = (i: number) => {
    const m = messages[i]!;
    return m.from === m.to ? x(m.from) + 6 + longest(m.text) * CH : 0;
  };
  const boxes = fragments.map((f) => {
    const idx = Array.from({ length: f.end - f.start + 1 }, (_, k) => f.start + k);
    const xs = idx.flatMap((i) => [x(messages[i]!.from), x(messages[i]!.to)]);
    const d = depth(f, fragments) * 8;
    const x0 = Math.max(4, Math.min(...xs) - COL / 2 + 14 + d);
    const tab = f.kind.length * 8 + 16;
    const guards = [f.label, ...(f.others ?? []).map((o) => o.label)];
    const x1 = Math.max(
      Math.max(...xs) + COL / 2 - 14 - d,
      ...idx.map((i) => selfRight(i) + 10 - d),
      ...guards.map((g) => x0 + tab + 6 + (g.length + 2) * CH + 8),
    );
    return { x0, x1, tab };
  });
  // An outer frame always encloses the frames nested in it: widen from the innermost out.
  const order = fragments
    .map((_, i) => i)
    .sort((a, b) => depth(fragments[b]!, fragments) - depth(fragments[a]!, fragments));
  for (const i of order) {
    const f = fragments[i]!;
    fragments.forEach((g, j) => {
      if (j !== i && g.start >= f.start && g.end <= f.end)
        boxes[i]!.x1 = Math.max(boxes[i]!.x1, boxes[j]!.x1 + 8);
    });
  }
  const right = Math.max(
    0,
    ...messages.map((_, i) => selfRight(i) + 12),
    ...boxes.map((b) => b.x1 + 8),
  );
  return { boxes, right };
}

export function SequenceDiagram({ spec }: { spec: SequenceSpec }) {
  const { participants, messages, fragments } = spec;
  const index = new Map(participants.map((p, i) => [p.id, i]));
  const x = (id: string) => MARGIN + (index.get(id) ?? 0) * COL + COL / 2;
  const { boxes, right } = frames(spec, x);
  const width = Math.ceil(Math.max(MARGIN * 2 + participants.length * COL, right));
  const { msgY, top, bottom, others, height } = layout(spec);
  const title = (id: string) => participants.find((p) => p.id === id)?.title ?? id;

  const description = (
    <>
      <p>{`${UI.participants}: ${participants.map((p) => (p.tech ? `${p.title} [${p.tech}]` : p.title)).join(", ")}.`}</p>
      <ol>
        {messages.map((m, i) => {
          const opens = fragments
            .filter((f) => f.start === i)
            .map((f) => `${UI.begin} ${f.kind} [${f.label}]. `);
          const elses = fragments.flatMap((f) =>
            (f.others ?? []).filter((o) => o.at === i).map((o) => `${UI.otherwise} [${o.label}]. `),
          );
          const closes = fragments.filter((f) => f.end === i).map((f) => ` ${UI.end} ${f.kind}.`);
          const arrow = m.kind === "return" ? UI.returns : UI.sends;
          return (
            <li key={i}>
              {`${opens.join("")}${elses.join("")}${title(m.from)} ${arrow} ${title(m.to)}: ${plain(m.text.replaceAll("\n", " "))}.${closes.join("")}`}
            </li>
          );
        })}
      </ol>
    </>
  );

  return (
    <Figure
      title={spec.title}
      caption={spec.caption}
      width={width}
      height={height}
      description={description}
    >
      <Markers id={spec.id} />
      {participants.map((p) => {
        const cx = x(p.id);
        const cls =
          p.kind === "external"
            ? styles.boxExternal
            : p.kind === "actor"
              ? styles.boxSun
              : styles.boxPaper;
        const text = p.kind === "actor" ? styles.onSun : styles.onPaper;
        return (
          <g key={p.id}>
            <line
              x1={cx}
              y1={HEAD_Y + HEAD_H}
              x2={cx}
              y2={height - 6}
              className={styles.lifeline}
            />
            <rect
              x={cx - COL / 2 + 8}
              y={HEAD_Y}
              width={COL - 16}
              height={HEAD_H}
              rx={p.kind === "actor" ? 16 : 0}
              className={cls}
            />
            <text
              x={cx}
              y={HEAD_Y + 20}
              textAnchor="middle"
              className={`${styles.nodeTitle} ${text}`}
            >
              {p.title}
            </text>
            {p.tech && (
              <text
                x={cx}
                y={HEAD_Y + 36}
                textAnchor="middle"
                className={`${styles.nodeTech} ${text}`}
              >
                {p.tech}
              </text>
            )}
          </g>
        );
      })}
      {fragments.map((f, fi) => {
        const { x0, x1, tab } = boxes[fi]!;
        const y0 = top.get(fi) ?? 0;
        const y1 = bottom.get(fi) ?? y0;
        return (
          <g key={fi}>
            <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} className={styles.fragment} />
            <path
              d={`M${x0} ${y0} h${tab} v12 l-6 6 h${-tab + 6} Z`}
              className={styles.fragmentTab}
            />
            <text x={x0 + 6} y={y0 + 13} className={styles.fragmentKind}>
              {f.kind}
            </text>
            <text x={x0 + tab + 6} y={y0 + 13} className={styles.fragmentGuard}>
              {`[${f.label}]`}
            </text>
            {f.others?.map((o, k) => {
              const oy = others.get(`${fi}-${k}`) ?? 0;
              return (
                <g key={k}>
                  <line x1={x0} y1={oy} x2={x1} y2={oy} className={styles.fragmentSplit} />
                  <text x={x0 + 6} y={oy + 15} className={styles.fragmentGuard}>
                    {`[${o.label}]`}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
      {messages.map((m, i) => {
        const y = msgY[i] ?? 0;
        const x1 = x(m.from);
        const x2 = x(m.to);
        const lines = m.text.split("\n");
        lines[0] = `${i + 1}. ${lines[0]}`;
        const kind = m.kind ?? "call";
        const marker = kind === "call" ? "arrow" : "open";
        const cls = kind === "return" ? styles.edgeDash : styles.edge;
        if (x1 === x2) {
          return (
            <g key={i}>
              <polyline
                points={`${x1},${y} ${x1 + SELF_W},${y} ${x1 + SELF_W},${y + 14} ${x1 + 2},${y + 14}`}
                className={cls}
                markerEnd={`url(#${spec.id}-${marker})`}
              />
              {lines.map((line, k) => (
                <text
                  key={k}
                  x={x1 + 6}
                  y={y - 5 - (lines.length - 1 - k) * LINE_H}
                  className={styles.msgLabel}
                >
                  {plain(line)}
                </text>
              ))}
            </g>
          );
        }
        const mid = (x1 + x2) / 2;
        const dir = x2 > x1 ? 1 : -1;
        return (
          <g key={i}>
            <line
              x1={x1}
              y1={y}
              x2={x2 - dir * 2}
              y2={y}
              className={cls}
              markerEnd={`url(#${spec.id}-${marker})`}
            />
            {lines.map((line, k) => (
              <text
                key={k}
                x={mid}
                y={y - 5 - (lines.length - 1 - k) * LINE_H}
                textAnchor="middle"
                className={styles.msgLabel}
              >
                {plain(line)}
              </text>
            ))}
          </g>
        );
      })}
    </Figure>
  );
}
