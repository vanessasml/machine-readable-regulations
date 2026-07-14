/** Payload types — the exact shapes produced by build_ui.py (payload.json).
 *  Derived from matches.json / rules.json / example_datapoints.json /
 *  bank_returns/*.csv and the build_ui.py loaders. Do not widen casually:
 *  the packer inlines this JSON verbatim into the built page. */

// ---------------------------------------------------------------- matches.json

export interface Metric {
  data_type: string; // "Monetary" | "Percentage" | "Boolean" | "Integer" | ...
  period: string;    // "Instant" | "Duration" | ...
}

export interface Dimension {
  dim: string;    // e.g. "Main category"
  domain: string; // e.g. "IRRBB measure"
  member: string; // e.g. "Economic value of equity"
}

export interface TableCoord {
  table: string; // "J 05.00"
  row: string;   // "0010"
  col: string;   // "0010"
}

export type Band = "high" | "medium" | "low";

export interface Candidate {
  doc: string;         // stem, e.g. "EBA_GL_2018_02"
  doc_title: string;   // human title
  label: string;       // citation label, e.g. "Paragraph 19"
  breadcrumb: string;  // " › "-joined path; may be ""
  page: number | null;
  score: number;       // raw matcher score, e.g. 0.3903
  confidence: number;  // integer percent 0-100
  band: Band;
  evidence: string;    // quoted provision text
}

export interface Datapoint {
  code: string;      // datapoint id, e.g. "J 05.00 r0010 c0010" (key into Bank.values)
  name: string;
  metric: Metric;
  dimensions: Dimension[];
  table: TableCoord;
  note: string;
  cell: string;      // display coordinate, e.g. "J 05.00 · r0010/c0010"
  framework: string; // e.g. "IRRBB"; may be "" — treat falsy as "Other"
  candidates: Candidate[]; // ranked, best first; may be empty
}

export interface Matches {
  generated_from: string;
  documents_indexed: number;
  paragraphs_indexed: number;
  datapoints: Datapoint[];
}

// ------------------------------------------------- data/regulations (via build_ui)

export interface RegLeaf {
  label: string;        // citation label or id
  kind: string | null;  // e.g. "paragraph"
  crumb: string;        // " › "-joined breadcrumb; may be ""
  page: number | null;  // page_start
  text: string;         // trimmed, capped at ~2000 chars
}

export interface Reg {
  stem: string;     // file stem, e.g. "EBA_GL_2018_02"
  title: string;    // human title
  filename: string; // source pdf name
  pages: number | null;
  paragraphs: number; // = leaves.length
  leaves: RegLeaf[];
}

// -------------------------------------------------------- example_datapoints.json

export interface DpDocEntry {
  datapoint_id: string; // same id space as Datapoint.code
  name: string;
  framework: string;
  metric: Metric;
  dimensions: Dimension[];
  table_coordinate: { table: string; cell: string }; // cell like "r0010/c0010"
  definition: string | null;
  legal_reference: string | null; // null until the mapping fills it
}

export interface DpDoc {
  filename: string;         // "example_datapoints.csv / .json"
  framework: string;        // document-level framework description
  taxonomy_version: string; // e.g. "sample-1.0"
  datapoints: DpDocEntry[];
}

// ------------------------------------------------------------- bank_returns/*.csv

export interface BankCell {
  value: string; // raw CSV string, e.g. "-412000000", "12.4", "Yes"
  unit: string;  // "EUR" | "%" | "Y/N" | "count" | ...
}

export interface Bank {
  filename: string;
  name: string;
  lei: string; // unique key for supervisor decisions
  date: string; // reference date, e.g. "2025-12-31"
  values: Record<string, BankCell>; // datapoint_id -> raw cell
}

// -------------------------------------------------------------------- rules.json

export type Severity = "blocking" | "warning";
export type RuleStatus = "pending" | "active" | "rejected";

export interface RuleSource {
  doc: string;
  doc_title: string;
  label: string;
  page: number | null;
  quote: string;
  via?: string; // e.g. "inherited from datapoint mapping (top candidate)"
}

export interface Rule {
  id: string;   // "R-001"
  name: string;
  expr: string; // one comparator, e.g. "sot_decline_vs_tier1 <= 15"
  severity: Severity;
  confidence: number; // 0..1 (NOT percent)
  bindings: Record<string, string>; // variable -> datapoint id
  source?: RuleSource;
  note?: string;
  status: RuleStatus; // initial status from the file; live state lives in the store
  origin?: string;    // "starter" | "llm" | ...
  unbound?: string[];              // machine gate: variables without a binding
  unknown_datapoints?: string[];   // machine gate: bindings to unknown datapoints
}

export interface RulesMeta {
  origin?: string;
  generated_at?: string;
  model?: string | null;
  note?: string;
}

export interface RulesDoc {
  meta: RulesMeta;
  rules: Rule[];
}

// ----------------------------------------------------------------------- payload

export interface Payload {
  data: Matches;
  regs: Reg[];     // MAY BE EMPTY (data/regulations is git-ignored) — handle gracefully
  dpdocs: DpDoc[]; // may be empty
  banks: Bank[];   // may be empty
  rules: RulesDoc;
}
