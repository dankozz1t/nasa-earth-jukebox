import { useEffect } from "react";
import { useLocation } from "react-router";
import { BoxDiagram } from "./BoxDiagram";
import { SECTIONS, UI } from "./content";
import { DataTable } from "./DataTable";
import type { Block } from "./model";
import { rich } from "./rich";
import { SequenceDiagram } from "./SequenceDiagram";
import styles from "./tech.module.css";

function BlockView({ block }: { block: Block }) {
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
      return <DataTable table={block.table} />;
    case "box":
      return <BoxDiagram spec={block.diagram} />;
    case "seq":
      return <SequenceDiagram spec={block.diagram} />;
  }
}

// Architecture description in arc42 order, C4 for structure, UML for behaviour. English only, so it is marked lang="en".
export default function TechView() {
  const { hash } = useLocation();

  // A deep link to a section (/how#tech-api) lands once this chunk has drawn it.
  useEffect(() => {
    if (!hash.startsWith("#tech-")) return;
    document.getElementById(hash.slice(1))?.scrollIntoView?.();
  }, [hash]);

  return (
    <div lang="en" className={styles.tech}>
      <nav aria-labelledby="tech-toc" className={styles.toc}>
        <h2 id="tech-toc" className={styles.tocTitle}>
          {UI.toc}
        </h2>
        <ol>
          {SECTIONS.map((s, i) => (
            <li key={s.id}>
              <a href={`#tech-${s.id}`}>{`${i + 1}. ${s.title}`}</a>
            </li>
          ))}
        </ol>
      </nav>
      {SECTIONS.map((s, i) => (
        <section
          key={s.id}
          id={`tech-${s.id}`}
          aria-labelledby={`tech-${s.id}-h`}
          className={styles.section}
        >
          <h2 id={`tech-${s.id}-h`} className={styles.h2}>
            <span className={styles.secNum}>{`${i + 1}.`}</span> {s.title}
          </h2>
          {s.blocks.map((b, k) => (
            <BlockView key={k} block={b} />
          ))}
        </section>
      ))}
    </div>
  );
}
