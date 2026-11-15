// The engineering view is data (content.ts, diagrams.ts, sequences.ts) drawn by generic components,
// so its English text stays out of the shared dictionary and the main bundle.

/** Inline markup in any text: `code` becomes <code>. */
export type Rich = string;

export type NodeKind =
  "person" | "system" | "external" | "container" | "store" | "component" | "port";

export interface DNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: NodeKind;
  title: string;
  tech?: string;
  lines?: string[];
}

export interface DBoundary {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

/** sync: request and response; async: fire and forget or a poll; realize: implements a port; dep: imports. */
export type EdgeKind = "sync" | "async" | "realize" | "dep";

export interface DEdge {
  from: string;
  to: string;
  points: [number, number][];
  label?: string;
  /** Label position; by default the middle of the first segment. */
  at?: [number, number];
  anchor?: "start" | "middle" | "end";
  kind?: EdgeKind;
}

export interface BoxDiagramSpec {
  id: string;
  title: string;
  caption: Rich;
  width: number;
  height: number;
  boundaries: DBoundary[];
  nodes: DNode[];
  edges: DEdge[];
}

export interface SeqParticipant {
  id: string;
  title: string;
  tech?: string;
  kind?: "actor" | "system" | "external";
}

export interface SeqMessage {
  from: string;
  to: string;
  /** "\n" breaks the label into lines. */
  text: string;
  kind?: "call" | "return" | "async";
}

export interface SeqFragment {
  kind: "alt" | "opt" | "loop" | "par" | "break";
  label: string;
  /** Index of the first and the last message inside, inclusive. */
  start: number;
  end: number;
  /** Further operands of an alt or par: the message they start at, and their guard. */
  others?: { at: number; label: string }[];
}

export interface SequenceSpec {
  id: string;
  title: string;
  caption: Rich;
  participants: SeqParticipant[];
  messages: SeqMessage[];
  fragments: SeqFragment[];
}

export interface TableSpec {
  id: string;
  caption: string;
  columns: string[];
  /** The first cell of each row is its header. */
  rows: Rich[][];
}

export type Block =
  | { kind: "p"; text: Rich }
  | { kind: "h3"; text: string }
  | { kind: "list"; items: Rich[] }
  | { kind: "table"; table: TableSpec }
  | { kind: "box"; diagram: BoxDiagramSpec }
  | { kind: "seq"; diagram: SequenceSpec };

export interface TechSection {
  id: string;
  title: string;
  blocks: Block[];
}
