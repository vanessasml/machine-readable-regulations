"""Extract machine-readable rules from ingested regulations → rules.json.

Two modes:

LIVE (the real pipeline step)
    python3 extract_rules.py --live [--doc EBA_GL_2018_02]
    Sends citation-anchored paragraphs (data/regulations/*.json) plus the
    datapoint vocabulary (example_datapoints.json) to claude-opus-4-8 with a
    structured-output schema. Every returned rule is then machine-gated before
    it may enter rules.json:
      · the expression must parse (same parser the engine executes),
      · every variable must be bound to a known datapoint (or flagged),
      · duplicates of existing rules are dropped.
    Needs the `anthropic` SDK and credentials (ANTHROPIC_API_KEY or an
    `ant auth login` profile). Nothing here auto-activates: extracted rules
    land as status "pending" for the human reviewer in review.html.

STARTER (default when regulations or credentials are missing)
    python3 extract_rules.py
    Writes a small hand-curated rulebook over the sample datapoints so the
    whole chain is demonstrable today. Each starter rule inherits its legal
    source from the mapping engine's own output: the top provision matched to
    the datapoint it binds (matches.json). Clearly labelled origin "starter".
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import date

import rules_engine

HERE = os.path.dirname(os.path.abspath(__file__))
RULES_PATH = os.path.join(HERE, "rules.json")
MATCHES_PATH = os.path.join(HERE, "matches.json")
DATAPOINTS_PATH = os.path.join(HERE, "example_datapoints.json")
REG_DIR = os.environ.get("REG_JSON_DIR", os.path.join(HERE, "data", "regulations"))

MODEL = "claude-opus-4-8"

# ---------------------------------------------------------------- shared gates

def known_datapoint_ids() -> set[str]:
    doc = json.load(open(DATAPOINTS_PATH, encoding="utf-8"))
    return {dp["datapoint_id"] for dp in doc.get("datapoints", [])}


def canonical(expr: str) -> str:
    return re.sub(r"\s+", "", expr)


def gate(rule: dict, known_dps: set[str], existing: list[dict]) -> tuple[dict | None, str | None]:
    """Returns (gated_rule, None) or (None, reason_rejected)."""
    try:
        node = rules_engine.parse(rule["expr"])
    except rules_engine.ExprError as err:
        return None, f"malformed expression: {err}"
    rule_vars = rules_engine.variables(node)
    bindings = rule.get("bindings", {})
    unbound = [v for v in rule_vars if not bindings.get(v)]
    unknown = [f"{v} → {bindings[v]}" for v in rule_vars
               if bindings.get(v) and bindings[v] not in known_dps]
    for other in existing:
        if canonical(other["expr"]) == canonical(rule["expr"]) \
                and other.get("bindings") == bindings:
            return None, f"duplicate of {other['id']}"
    rule["unbound"] = unbound
    rule["unknown_datapoints"] = unknown
    return rule, None


# ---------------------------------------------------------------- starter mode

def source_from_mapping(dp_code: str) -> dict:
    """A starter rule cites the provision the mapping engine matched to the
    datapoint it binds — the rule inherits its legal anchor through the Map."""
    matches = json.load(open(MATCHES_PATH, encoding="utf-8"))
    for dp in matches["datapoints"]:
        if dp["code"] == dp_code and dp.get("candidates"):
            c = dp["candidates"][0]
            return {
                "doc": c["doc"], "doc_title": c["doc_title"], "label": c["label"],
                "page": c.get("page"), "quote": c.get("evidence", ""),
                "via": "inherited from datapoint mapping (top candidate)",
            }
    return {"doc": None, "doc_title": None, "label": None, "page": None,
            "quote": "", "via": "no mapping candidate found"}


STARTER_RULES = [
    dict(id="R-001", name="IRRBB supervisory outlier test — early-warning threshold",
         expr="sot_decline_vs_tier1 <= 15", severity="warning", confidence=0.95,
         bindings={"sot_decline_vs_tier1": "J 07.00 r0020 c0010"},
         note="Decline in economic value of equity above 15% of Tier 1 must be "
              "notified to the competent authority (EBA/GL/2018/02)."),
    dict(id="R-002", name="Recovery CET1 indicator above regulatory minimum",
         expr="recovery_cet1_ratio >= 4.5", severity="blocking", confidence=0.85,
         bindings={"recovery_cet1_ratio": "REC 01.00 r0010 c0010"},
         note="Recovery-plan capital indicators are calibrated above the CRR "
              "Art. 92(1)(a) 4.5% CET1 minimum (EBA/GL/2015/02)."),
    dict(id="R-003", name="No open major incident on record",
         expr="major_incident == 0", severity="warning", confidence=0.70,
         bindings={"major_incident": "INC 01.00 r0010 c0010"},
         note="A classified major incident is not a breach — failing this check "
              "routes the supervisor to verify the PSD2 Art. 96 notification file."),
    dict(id="R-004", name="NPE gross carrying amount non-negative",
         expr="npe_gross >= 0", severity="blocking", confidence=0.90,
         bindings={"npe_gross": "F 18.00 r0070 c0010"},
         note="Gross carrying amounts cannot be negative."),
    dict(id="R-005", name="Forborne exposures non-negative",
         expr="forborne_gross >= 0", severity="blocking", confidence=0.90,
         bindings={"forborne_gross": "F 19.00 r0080 c0010"},
         note="Gross carrying amounts cannot be negative."),
    dict(id="R-006", name="ECL allowance non-negative",
         expr="ecl_allowance >= 0", severity="blocking", confidence=0.90,
         bindings={"ecl_allowance": "F 12.01 r0010 c0010"},
         note="Loss allowances are reported as non-negative amounts."),
    dict(id="R-007", name="High-earner count non-negative",
         expr="high_earners >= 0", severity="blocking", confidence=0.90,
         bindings={"high_earners": "HE 01.00 r0010 c0010"},
         note="A count of natural persons cannot be negative."),
]


def build_starter() -> dict:
    known = known_datapoint_ids()
    rules, rejected = [], []
    for raw in STARTER_RULES:
        rule = dict(raw)
        dp_code = next(iter(rule["bindings"].values()))
        rule["source"] = source_from_mapping(dp_code)
        rule["status"] = "pending"
        rule["origin"] = "starter"
        gated, reason = gate(rule, known, rules)
        (rules.append(gated) if gated else rejected.append((rule["id"], reason)))
    return {
        "meta": {
            "origin": "starter",
            "generated_at": date.today().isoformat(),
            "model": None,
            "note": "Hand-curated starter rulebook over the sample datapoints; "
                    "sources inherited from the mapping engine's top candidates. "
                    "Replace/extend with `extract_rules.py --live` once regulation "
                    "JSONs and Anthropic credentials are available. All rules start "
                    "as 'pending' — nothing applies until approved in review.html.",
        },
        "rules": rules,
    }, rejected


# ---------------------------------------------------------------- live mode

EXTRACTION_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["rules", "non_mechanical"],
    "properties": {
        "rules": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["name", "expr", "severity", "confidence",
                             "bindings", "source_label", "source_quote", "note"],
                "properties": {
                    "name": {"type": "string"},
                    "expr": {"type": "string"},
                    "severity": {"type": "string", "enum": ["blocking", "warning"]},
                    "confidence": {"type": "number"},
                    "bindings": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["variable", "datapoint_id"],
                            "properties": {
                                "variable": {"type": "string"},
                                "datapoint_id": {"type": "string"},
                            },
                        },
                    },
                    "source_label": {"type": "string"},
                    "source_quote": {"type": "string"},
                    "note": {"type": "string"},
                },
            },
        },
        "non_mechanical": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["source_quote", "reason"],
                "properties": {
                    "source_quote": {"type": "string"},
                    "reason": {"type": "string"},
                },
            },
        },
    },
}


def live_extract(doc_filter: str | None) -> tuple[dict, list]:
    import glob

    import anthropic

    dp_doc = json.load(open(DATAPOINTS_PATH, encoding="utf-8"))
    dp_lines = "\n".join(
        f"  {dp['datapoint_id']} — {dp['name']} "
        f"({dp['metric']['data_type']}, {dp.get('framework', '')})"
        for dp in dp_doc["datapoints"]
    )
    system = f"""You extract machine-checkable validation rules from EBA regulation text.

Known datapoints (bind rule variables to these exact datapoint_ids):
{dp_lines}

Expression grammar: snake_case variables, numbers, + - * / ( ), exactly one
comparator per rule: == <= >= < >. Percentages stay in percent units (15% -> 15),
matching how the datapoints are reported.

Only propose a rule when the text states a checkable condition over these
datapoints; quote the exact sentence in source_quote and name its paragraph in
source_label. Every variable must appear in bindings. Provisions that cannot be
checked mechanically go in non_mechanical with the reason. Do not invent."""

    known = known_dps = known_datapoint_ids()
    existing_doc = rules_engine.load_rules()
    rules = list(existing_doc.get("rules", []))
    rejected = []
    client = anthropic.Anthropic()
    next_id = 1 + max((int(r["id"].split("-")[1]) for r in rules
                       if re.fullmatch(r"R-\d+", r.get("id", ""))), default=0)

    paths = sorted(glob.glob(os.path.join(REG_DIR, "*.json")))
    if doc_filter:
        paths = [p for p in paths if doc_filter in os.path.basename(p)]
    if not paths:
        raise SystemExit(f"no regulation JSON found in {REG_DIR!r} — run ingest.py first")

    for path in paths:
        d = json.load(open(path, encoding="utf-8"))
        stem = os.path.splitext(os.path.basename(path))[0]
        paragraphs = "\n\n".join(
            f"[{leaf.get('label') or leaf.get('id')}] {leaf.get('text', '').strip()}"
            for leaf in d["leaves"] if len((leaf.get("text") or "").strip()) >= 160
        )
        response = client.messages.create(
            model=MODEL,
            max_tokens=16000,
            thinking={"type": "adaptive"},
            output_config={"format": {"type": "json_schema", "schema": EXTRACTION_SCHEMA}},
            system=system,
            messages=[{"role": "user", "content": f"Document {stem}:\n\n{paragraphs}"}],
        )
        if response.stop_reason == "refusal":
            rejected.append((stem, "model declined (stop_reason: refusal)"))
            continue
        payload = json.loads(next(b.text for b in response.content if b.type == "text"))
        for raw in payload["rules"]:
            rule = {
                "id": f"R-{next_id:03d}",
                "name": raw["name"],
                "expr": raw["expr"],
                "severity": raw["severity"],
                "confidence": round(float(raw["confidence"]), 2),
                "bindings": {b["variable"]: b["datapoint_id"] for b in raw["bindings"]},
                "source": {"doc": stem, "doc_title": stem, "label": raw["source_label"],
                           "page": None, "quote": raw["source_quote"], "via": "live extraction"},
                "note": raw["note"],
                "status": "pending",
                "origin": f"llm:{response.model}",
            }
            gated, reason = gate(rule, known, rules)
            if gated:
                rules.append(gated)
                next_id += 1
            else:
                rejected.append((raw["name"], reason))
        print(f"  {stem}: extracted, {len(payload['rules'])} proposed, "
              f"{len(payload['non_mechanical'])} non-mechanical")

    return {
        "meta": {
            "origin": "live" if not existing_doc.get("rules") else "mixed",
            "generated_at": date.today().isoformat(),
            "model": MODEL,
            "note": "Live extraction; every rule machine-gated and pending human review.",
        },
        "rules": rules,
    }, rejected


# ---------------------------------------------------------------- entry point

def main(argv: list[str]) -> int:
    live = "--live" in argv
    doc_filter = None
    if "--doc" in argv:
        doc_filter = argv[argv.index("--doc") + 1]

    if live:
        out, rejected = live_extract(doc_filter)
    else:
        out, rejected = build_starter()
        print("Starter mode (use --live with regulation JSONs + credentials for real extraction).")

    with open(RULES_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"Wrote rules.json — {len(out['rules'])} rules, all pending human review.")
    for name, reason in rejected:
        print(f"  rejected: {name} — {reason}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
