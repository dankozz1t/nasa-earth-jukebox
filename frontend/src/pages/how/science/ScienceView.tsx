/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- a scroll box must be reachable by keyboard (WCAG 2.1.1) */
import { useEffect } from "react";
import { useLocation } from "react-router";
import { useT } from "../../../shared/i18n";
import type { TableSpec } from "../tech/model";
import { rich } from "../tech/rich";
import { CONTENT, type ScienceBlock } from "./content";
import styles from "./science.module.css";

// A table wider than a phone scrolls inside its own box; the first cell of each row is its header.
function Table({ table }: { table: TableSpec }) {
  const captionId = `cap-${table.id}`;

  return (
    <div className={styles.tableWrap} tabIndex={0} role="group" aria-labelledby={captionId}>
      <table className={styles.table} data-cols={table.columns.length}>
        <caption id={captionId} className={styles.caption}>
          {table.caption}
        </caption>
        <thead>
          <tr>
            {table.columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) =>
                c === 0 ? (
                  <th key={c} scope="row">
                    {rich(cell)}
                  </th>
                ) : (
                  <td key={c}>{rich(cell)}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// The steps of a pipeline as numbered boxes: an ordered list, so it reads in order without the picture.
function Flow({ id, label, steps }: { id: string; label: string; steps: string[] }) {
  return (
    <figure className={styles.flowFigure}>
      <figcaption id={id} className={styles.caption}>
        {label}
      </figcaption>
      <ol className={styles.flow} aria-labelledby={id}>
        {steps.map((step, i) => (
          <li key={i} className={styles.step}>
            <span className={styles.num} aria-hidden="true">
              {i + 1}
            </span>
            <span>{rich(step)}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

function BlockView({ block, id }: { block: ScienceBlock; id: string }) {
  switch (block.kind) {
    case "p":
      return <p className={styles.p}>{rich(block.text)}</p>;
    case "h3":
      return <h3 className={styles.h3}>{block.text}</h3>;
    case "list":
      return (
        <ul className={styles.list}>
          {block.items.map((item, i) => (
            <li key={i}>{rich(item)}</li>
          ))}
        </ul>
      );
    case "table":
      return <Table table={block.table} />;
    case "flow":
      return <Flow id={id} label={block.label} steps={block.steps} />;
  }
}

// Science, NASA and music, each a short section that can be linked (/how#science-nasa).
export default function ScienceView() {
  const { lang } = useT();
  const { hash } = useLocation();
  const content = CONTENT[lang];

  useEffect(() => {
    if (!hash.startsWith("#science-")) return;
    document.getElementById(hash.slice(1))?.scrollIntoView?.();
  }, [hash]);

  return (
    <div className={styles.science}>
      <p className={styles.intro}>{content.intro}</p>
      <nav aria-labelledby="science-toc" className={styles.toc}>
        <h2 id="science-toc" className={styles.tocTitle}>
          {content.toc}
        </h2>
        <ol>
          {content.sections.map((s) => (
            <li key={s.id}>
              <a href={`#science-${s.id}`}>{s.title}</a>
            </li>
          ))}
        </ol>
      </nav>
      {content.sections.map((s) => (
        <section
          key={s.id}
          id={`science-${s.id}`}
          aria-labelledby={`science-${s.id}-h`}
          className={styles.section}
        >
          <h2 id={`science-${s.id}-h`} className={styles.h2}>
            {s.title}
          </h2>
          {s.blocks.map((b, k) => (
            <BlockView key={k} block={b} id={`science-${s.id}-${k}`} />
          ))}
        </section>
      ))}
    </div>
  );
}
