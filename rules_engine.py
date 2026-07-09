"""Deterministic rules engine — apply machine-readable rules to bank returns.

The rulebook (rules.json) is data; this engine executes it. Same input, same
verdict, every run — and every failure carries the provision the rule cites.
Nothing probabilistic lives here: extraction proposes (extract_rules.py),
a human approves (review.html, Rules tab), this file merely applies.

Rule expressions: one comparator per rule over snake_case variables,
   e.g.  sot_decline_vs_tier1 <= 15
Variables are bound to datapoints via the rule's `bindings`
   e.g.  {"sot_decline_vs_tier1": "J 07.00 r0020 c0010"}
and the bank's reported value for that datapoint is substituted at apply time.

Pure standard library. CLI:
    python3 rules_engine.py            # apply active rules to bank_returns/*.csv
    python3 rules_engine.py --all      # include pending rules too
"""

from __future__ import annotations

import csv
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
RULES_PATH = os.path.join(HERE, "rules.json")
BANKS_DIR = os.path.join(HERE, "bank_returns")

# equality tolerance: reported figures are rounded
ABS_TOL = 0.01
REL_TOL = 1e-4

_TOKEN = re.compile(r"\s*(\d+\.\d*|\.\d+|\d+|[A-Za-z_][A-Za-z0-9_]*|==|<=|>=|<|>|[-+*/()])")
_COMPARATORS = ("==", "<=", ">=", "<", ">")


class ExprError(ValueError):
    pass


def tokenize(src: str) -> list[str]:
    tokens, pos = [], 0
    while pos < len(src):
        m = _TOKEN.match(src, pos)
        if not m:
            if src[pos:].strip() == "":
                break
            raise ExprError(f"bad token at: {src[pos:pos + 20]!r}")
        tokens.append(m.group(1))
        pos = m.end()
    return tokens


class _Parser:
    def __init__(self, tokens: list[str]):
        self.toks, self.i = tokens, 0

    def peek(self):
        return self.toks[self.i] if self.i < len(self.toks) else None

    def next(self):
        tok = self.peek()
        if tok is None:
            raise ExprError("unexpected end of expression")
        self.i += 1
        return tok

    def expect(self, tok):
        got = self.next()
        if got != tok:
            raise ExprError(f"expected {tok!r}, got {got!r}")

    def parse(self):
        node = self.comparison()
        if self.peek() is not None:
            raise ExprError(f"trailing tokens: {self.toks[self.i:]}")
        return node

    def comparison(self):
        lhs = self.sum()
        if self.peek() in _COMPARATORS:
            op = self.next()
            return ("cmp", op, lhs, self.sum())
        return lhs

    def sum(self):
        node = self.product()
        while self.peek() in ("+", "-"):
            op = self.next()
            node = ("bin", op, node, self.product())
        return node

    def product(self):
        node = self.unary()
        while self.peek() in ("*", "/"):
            op = self.next()
            node = ("bin", op, node, self.unary())
        return node

    def unary(self):
        if self.peek() == "-":
            self.next()
            return ("neg", self.unary())
        return self.atom()

    def atom(self):
        tok = self.next()
        if re.fullmatch(r"\d+\.\d*|\.\d+|\d+", tok):
            return ("num", float(tok))
        if tok == "(":
            node = self.comparison()
            self.expect(")")
            return node
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", tok):
            return ("var", tok)
        raise ExprError(f"unexpected token {tok!r}")


def parse(src: str):
    node = _Parser(tokenize(src)).parse()
    if node[0] != "cmp":
        raise ExprError("a rule must contain exactly one comparator")
    return node


def variables(node) -> list[str]:
    kind = node[0]
    if kind == "var":
        return [node[1]]
    if kind == "num":
        return []
    if kind == "neg":
        return variables(node[1])
    out: list[str] = []
    for child in node[2:]:
        out += variables(child)
    return sorted(set(out))


def _eval(node, env: dict[str, float]) -> float:
    kind = node[0]
    if kind == "num":
        return node[1]
    if kind == "var":
        if node[1] not in env:
            raise ExprError(f"unbound variable {node[1]!r}")
        return env[node[1]]
    if kind == "neg":
        return -_eval(node[1], env)
    if kind == "bin":
        a, b = _eval(node[2], env), _eval(node[3], env)
        if node[1] == "+":
            return a + b
        if node[1] == "-":
            return a - b
        if node[1] == "*":
            return a * b
        if b == 0:
            raise ExprError("division by zero")
        return a / b
    raise ExprError(f"cannot evaluate {node!r}")


def check(node, env: dict[str, float]) -> tuple[bool, float, float]:
    op, lhs_n, rhs_n = node[1], node[2], node[3]
    lhs, rhs = _eval(lhs_n, env), _eval(rhs_n, env)
    if op == "==":
        tol = max(ABS_TOL, REL_TOL * max(abs(lhs), abs(rhs)))
        return abs(lhs - rhs) <= tol, lhs, rhs
    if op == "<=":
        return lhs <= rhs + ABS_TOL, lhs, rhs
    if op == ">=":
        return lhs >= rhs - ABS_TOL, lhs, rhs
    if op == "<":
        return lhs < rhs, lhs, rhs
    return lhs > rhs, lhs, rhs


# ---------------------------------------------------------------- data loading

def coerce(value: str, unit: str) -> float | None:
    """CSV value → number. Booleans: Yes/No → 1/0. Unparseable → None."""
    v = (value or "").strip()
    if unit == "Y/N" or v.lower() in ("yes", "no"):
        return 1.0 if v.lower() == "yes" else 0.0
    try:
        return float(v.replace(",", ""))
    except ValueError:
        return None


def load_rules(path: str = RULES_PATH) -> dict:
    if not os.path.exists(path):
        return {"meta": {}, "rules": []}
    return json.load(open(path, encoding="utf-8"))


def load_bank(path: str) -> dict:
    rows = list(csv.DictReader(open(path, encoding="utf-8")))
    values = {}
    for r in rows:
        num = coerce(r["value"], r.get("unit", ""))
        if num is not None:
            values[r["datapoint_id"]] = num
    return {
        "filename": os.path.basename(path),
        "name": rows[0]["entity_name"],
        "lei": rows[0]["entity_lei"],
        "date": rows[0]["reference_date"],
        "values": values,
    }


# ---------------------------------------------------------------- application

def apply_rule(rule: dict, values: dict[str, float]) -> dict:
    """One rule, one bank. Returns a verdict dict; never raises on data gaps."""
    try:
        node = parse(rule["expr"])
    except ExprError as err:
        return {"rule_id": rule["id"], "status": "invalid", "detail": str(err)}
    bindings = rule.get("bindings", {})
    env, missing = {}, []
    for var in variables(node):
        dp = bindings.get(var)
        if dp is None:
            missing.append(f"{var} (unbound)")
        elif dp not in values:
            missing.append(f"{var} → {dp} (no value reported)")
        else:
            env[var] = values[dp]
    if missing:
        return {"rule_id": rule["id"], "status": "no_data", "missing": missing}
    ok, lhs, rhs = check(node, env)
    return {
        "rule_id": rule["id"],
        "status": "pass" if ok else "fail",
        "lhs": lhs,
        "rhs": rhs,
        "substituted": {var: env[var] for var in env},
    }


def apply_all(rules: list[dict], bank: dict) -> list[dict]:
    return [apply_rule(r, bank["values"]) for r in rules]


def main(argv: list[str]) -> int:
    include_pending = "--all" in argv
    doc = load_rules()
    rules = [
        r for r in doc.get("rules", [])
        if include_pending or r.get("status") == "active"
    ]
    if not rules:
        print("No", "rules" if include_pending else "active rules",
              "in rules.json — run extract_rules.py, then approve rules in review.html.")
        return 1
    for path in sorted(glob.glob(os.path.join(BANKS_DIR, "*.csv"))):
        bank = load_bank(path)
        print(f"\n{bank['name']} ({bank['lei']}) — {bank['date']}")
        for rule, verdict in zip(rules, apply_all(rules, bank)):
            mark = {"pass": "✓", "fail": "✗", "no_data": "·", "invalid": "!"}[verdict["status"]]
            src = rule.get("source", {})
            cite = f"{src.get('doc', '?')} {src.get('label', '')}".strip()
            line = f"  {mark} {rule['id']} [{rule.get('severity', '?')}] {rule['name']} — {rule['expr']}"
            if verdict["status"] in ("pass", "fail"):
                line += f"  (lhs={verdict['lhs']:g}, rhs={verdict['rhs']:g})"
            elif verdict["status"] == "no_data":
                line += f"  [{'; '.join(verdict['missing'])}]"
            print(line)
            print(f"      ← {cite}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
