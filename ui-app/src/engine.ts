/** TypeScript port of rules_engine.py — semantics match EXACTLY.
 *
 *  Rule expressions: arithmetic over snake_case variables with exactly ONE
 *  comparator per rule (== <= >= < >). Variables are bound to datapoint ids
 *  via the rule's `bindings`; the bank's reported value is substituted at
 *  apply time. Deterministic: same input, same verdict.
 */
import type { Bank, Rule } from "./types";

// equality tolerance: reported figures are rounded (mirror rules_engine.py)
export const ABS_TOL = 0.01;
export const REL_TOL = 1e-4;

export class ExprError extends Error {}

export type CmpOp = "==" | "<=" | ">=" | "<" | ">";

export type Node =
  | ["num", number]
  | ["var", string]
  | ["neg", Node]
  | ["bin", "+" | "-" | "*" | "/", Node, Node]
  | ["cmp", CmpOp, Node, Node];

const COMPARATORS: readonly string[] = ["==", "<=", ">=", "<", ">"];
const NUM_RE = /^(?:\d+\.\d*|\.\d+|\d+)$/;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function tokenize(src: string): string[] {
  // sticky mirror of Python's _TOKEN regex (leading whitespace consumed per token)
  const re = /\s*(\d+\.\d*|\.\d+|\d+|[A-Za-z_][A-Za-z0-9_]*|==|<=|>=|<|>|[-+*/()])/y;
  const out: string[] = [];
  let pos = 0;
  while (pos < src.length) {
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) {
      if (src.slice(pos).trim() === "") break;
      throw new ExprError(`bad token at: ${JSON.stringify(src.slice(pos, pos + 20))}`);
    }
    out.push(m[1]);
    pos = re.lastIndex;
  }
  return out;
}

class Parser {
  private i = 0;
  constructor(private toks: string[]) {}

  private peek(): string | null {
    return this.i < this.toks.length ? this.toks[this.i] : null;
  }
  private next(): string {
    const tok = this.peek();
    if (tok === null) throw new ExprError("unexpected end of expression");
    this.i += 1;
    return tok;
  }
  private expect(tok: string): void {
    const got = this.next();
    if (got !== tok) throw new ExprError(`expected ${JSON.stringify(tok)}, got ${JSON.stringify(got)}`);
  }

  parse(): Node {
    const node = this.comparison();
    if (this.peek() !== null) throw new ExprError(`trailing tokens: ${this.toks.slice(this.i).join(" ")}`);
    return node;
  }

  private comparison(): Node {
    const lhs = this.sum();
    const p = this.peek();
    if (p !== null && COMPARATORS.includes(p)) {
      const op = this.next() as CmpOp;
      return ["cmp", op, lhs, this.sum()];
    }
    return lhs;
  }
  private sum(): Node {
    let node = this.product();
    while (this.peek() === "+" || this.peek() === "-") {
      const op = this.next() as "+" | "-";
      node = ["bin", op, node, this.product()];
    }
    return node;
  }
  private product(): Node {
    let node = this.unary();
    while (this.peek() === "*" || this.peek() === "/") {
      const op = this.next() as "*" | "/";
      node = ["bin", op, node, this.unary()];
    }
    return node;
  }
  private unary(): Node {
    if (this.peek() === "-") {
      this.next();
      return ["neg", this.unary()];
    }
    return this.atom();
  }
  private atom(): Node {
    const tok = this.next();
    if (NUM_RE.test(tok)) return ["num", parseFloat(tok)];
    if (tok === "(") {
      const node = this.comparison();
      this.expect(")");
      return node;
    }
    if (IDENT_RE.test(tok)) return ["var", tok];
    throw new ExprError(`unexpected token ${JSON.stringify(tok)}`);
  }
}

export type CmpNode = ["cmp", CmpOp, Node, Node];

/** Parse a rule expression; throws ExprError unless it is exactly one comparison. */
export function parse(src: string): CmpNode {
  const node = new Parser(tokenize(src)).parse();
  if (node[0] !== "cmp") throw new ExprError("a rule must contain exactly one comparator");
  return node as CmpNode;
}

/** Sorted unique variable names referenced by the expression. */
export function variables(node: Node): string[] {
  const seen = new Set<string>();
  const walk = (n: Node): void => {
    switch (n[0]) {
      case "var":
        seen.add(n[1]);
        break;
      case "num":
        break;
      case "neg":
        walk(n[1]);
        break;
      case "bin":
      case "cmp":
        walk(n[2]);
        walk(n[3]);
        break;
    }
  };
  walk(node);
  return [...seen].sort();
}

function evalNode(node: Node, env: Record<string, number>): number {
  switch (node[0]) {
    case "num":
      return node[1];
    case "var":
      if (!(node[1] in env)) throw new ExprError(`unbound variable ${JSON.stringify(node[1])}`);
      return env[node[1]];
    case "neg":
      return -evalNode(node[1], env);
    case "bin": {
      const a = evalNode(node[2], env);
      const b = evalNode(node[3], env);
      if (node[1] === "+") return a + b;
      if (node[1] === "-") return a - b;
      if (node[1] === "*") return a * b;
      if (b === 0) throw new ExprError("division by zero");
      return a / b;
    }
    default:
      throw new ExprError(`cannot evaluate ${JSON.stringify(node)}`);
  }
}

export interface CheckResult {
  ok: boolean;
  lhs: number;
  rhs: number;
  op: CmpOp;
}

/** Evaluate both sides and compare with the engine's tolerances. */
export function check(node: CmpNode, env: Record<string, number>): CheckResult {
  const op = node[1];
  const lhs = evalNode(node[2], env);
  const rhs = evalNode(node[3], env);
  let ok: boolean;
  if (op === "==") {
    const tol = Math.max(ABS_TOL, REL_TOL * Math.max(Math.abs(lhs), Math.abs(rhs)));
    ok = Math.abs(lhs - rhs) <= tol;
  } else if (op === "<=") {
    ok = lhs <= rhs + ABS_TOL;
  } else if (op === ">=") {
    ok = lhs >= rhs - ABS_TOL;
  } else if (op === "<") {
    ok = lhs < rhs;
  } else {
    ok = lhs > rhs;
  }
  return { ok, lhs, rhs, op };
}

// ---------------------------------------------------------------- data loading

/** CSV value -> number. Booleans: Yes/No -> 1/0 (also when unit is "Y/N").
 *  Commas stripped. Unparseable -> null. Mirror of rules_engine.coerce(). */
export function coerceVal(value: unknown, unit: string): number | null {
  const v = (value ?? "").toString().trim();
  if (unit === "Y/N" || /^(yes|no)$/i.test(v)) {
    return /^yes$/i.test(v) ? 1 : 0;
  }
  const stripped = v.replace(/,/g, "");
  if (stripped === "") return null;
  const n = Number(stripped);
  return Number.isNaN(n) ? null : n;
}

/** Bank return -> numeric env: datapoint_id -> number (unparseable cells dropped). */
export function bankNumeric(bank: Bank): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [dpId, cell] of Object.entries(bank.values)) {
    const n = coerceVal(cell.value, cell.unit);
    if (n !== null) out[dpId] = n;
  }
  return out;
}

// ---------------------------------------------------------------- application

export type VerdictStatus = "pass" | "fail" | "no_data" | "invalid";

export interface Verdict {
  status: VerdictStatus;
  lhs?: number;   // pass | fail
  rhs?: number;   // pass | fail
  op?: CmpOp;     // pass | fail
  substituted?: Record<string, number>; // pass | fail
  missing?: string[]; // no_data — e.g. "x (unbound)" or "x → DP (no value reported)"
  detail?: string;    // invalid — parse error message
}

/** One rule, one bank. Never throws on data gaps. `values` = bankNumeric(bank). */
export function applyRule(rule: Rule, values: Record<string, number>): Verdict {
  let node: CmpNode;
  try {
    node = parse(rule.expr);
  } catch (err) {
    return { status: "invalid", detail: err instanceof Error ? err.message : String(err) };
  }
  const bindings = rule.bindings ?? {};
  const env: Record<string, number> = {};
  const missing: string[] = [];
  for (const v of variables(node)) {
    const dp = bindings[v];
    if (dp === undefined || dp === null) {
      missing.push(`${v} (unbound)`);
    } else if (!(dp in values)) {
      missing.push(`${v} → ${dp} (no value reported)`);
    } else {
      env[v] = values[dp];
    }
  }
  if (missing.length) return { status: "no_data", missing };
  const r = check(node, env);
  return {
    status: r.ok ? "pass" : "fail",
    lhs: r.lhs,
    rhs: r.rhs,
    op: r.op,
    substituted: { ...env },
  };
}
