import { UI } from "./content";
import { Figure, Markers } from "./Figure";
import type { BoxDiagramSpec, DEdge, DNode } from "./model";
import { plain } from "./rich";
import styles from "./tech.module.css";

const TEXT_CLASS: Record<DNode["kind"], string> = {
  person: styles.onPaper!,
  system: styles.onCobalt!,
  external: styles.onPaper!,
  container: styles.onPaper!,
  store: styles.onPaper!,
  component: styles.onPaper!,
  port: styles.onSun!,
};

function Shape({ n }: { n: DNode }) {
  if (n.kind === "store") {
    const ry = 8;
    const d =
      `M${n.x} ${n.y + ry} a${n.w / 2} ${ry} 0 0 1 ${n.w} 0 V${n.y + n.h - ry} ` +
      `a${n.w / 2} ${ry} 0 0 1 ${-n.w} 0 Z`;
    return (
      <>
        <path d={d} className={styles.boxPaper} />
        <path d={`M${n.x} ${n.y + ry} a${n.w / 2} ${ry} 0 0 0 ${n.w} 0`} className={styles.line} />
      </>
    );
  }
  const cls = {
    person: styles.boxPaper,
    system: styles.boxCobalt,
    external: styles.boxExternal,
    container: styles.boxPaper,
    component: styles.boxThin,
    port: styles.boxSun,
  }[n.kind];
  return (
    <rect
      x={n.x}
      y={n.y}
      width={n.w}
      height={n.h}
      rx={n.kind === "person" ? 18 : 0}
      className={cls}
    />
  );
}

function Node({ n }: { n: DNode }) {
  const cx = n.x + n.w / 2;
  const top = n.y + (n.kind === "store" ? 30 : 22);
  const text = TEXT_CLASS[n.kind];
  return (
    <g>
      <Shape n={n} />
      <text x={cx} y={top} textAnchor="middle" className={`${styles.nodeTitle} ${text}`}>
        {n.title}
      </text>
      {n.tech && (
        <text x={cx} y={top + 15} textAnchor="middle" className={`${styles.nodeTech} ${text}`}>
          {`[${n.tech}]`}
        </text>
      )}
      {n.lines?.map((line, i) => (
        <text
          key={i}
          x={cx}
          y={top + (n.tech ? 31 : 17) + i * 14}
          textAnchor="middle"
          className={`${styles.nodeLine} ${text}`}
        >
          {plain(line)}
        </text>
      ))}
    </g>
  );
}

function Edge({ e, id }: { e: DEdge; id: string }) {
  const kind = e.kind ?? "sync";
  const marker = { sync: "arrow", async: "open", realize: "tri", dep: "open" }[kind];
  const cls = {
    sync: styles.edge,
    async: styles.edgeDash,
    realize: styles.edgeDash,
    dep: styles.edgeDot,
  }[kind];
  const [a, b] = e.points;
  const at = e.at ?? (a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 6] : [0, 0]);
  const lines = e.label ? e.label.split("\n") : [];
  return (
    <g>
      <polyline
        points={e.points.map((p) => p.join(",")).join(" ")}
        className={cls}
        markerEnd={`url(#${id}-${marker})`}
      />
      {lines.map((line, i) => (
        <text
          key={i}
          x={at[0]}
          y={at[1] + i * 13}
          textAnchor={e.anchor ?? "middle"}
          className={styles.edgeLabel}
        >
          {plain(line)}
        </text>
      ))}
    </g>
  );
}

export function BoxDiagram({ spec }: { spec: BoxDiagramSpec }) {
  const byId = new Map(spec.nodes.map((n) => [n.id, n]));
  const name = (id: string) =>
    byId.get(id)?.title ?? spec.boundaries.find((b) => b.id === id)?.label ?? id;
  const description = (
    <>
      <p>{`${UI.elements}:`}</p>
      <ul>
        {spec.boundaries.map((b) => (
          <li key={b.id}>{`${UI.boundary}: ${b.label}`}</li>
        ))}
        {spec.nodes.map((n) => (
          <li key={n.id}>
            {[n.title, n.tech && `[${n.tech}]`, ...(n.lines ?? []).map(plain)]
              .filter(Boolean)
              .join(". ")}
          </li>
        ))}
      </ul>
      <p>{`${UI.relations}:`}</p>
      <ul>
        {spec.edges.map((e, i) => (
          <li key={i}>
            {`${name(e.from)} ${UI.kinds[e.kind ?? "sync"]} ${name(e.to)}${e.label ? `: ${plain(e.label.replaceAll("\n", " "))}` : ""}`}
          </li>
        ))}
      </ul>
    </>
  );
  return (
    <Figure
      title={spec.title}
      caption={spec.caption}
      width={spec.width}
      height={spec.height}
      description={description}
    >
      <Markers id={spec.id} />
      {spec.boundaries.map((b) => (
        <g key={b.id}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} className={styles.boundary} />
          <text x={b.x + 10} y={b.y + 18} className={styles.boundaryLabel}>
            {b.label}
          </text>
        </g>
      ))}
      {spec.edges.map((e, i) => (
        <Edge key={i} e={e} id={spec.id} />
      ))}
      {spec.nodes.map((n) => (
        <Node key={n.id} n={n} />
      ))}
    </Figure>
  );
}
