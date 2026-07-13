"""Assemble the self-contained app (review.html) with four tabs:
   ① Review              — human-in-the-loop confirmation of each datapoint -> provision link
   ② Supervisor register — combined traceability register (forward, reverse, KPIs, CSV)
   ③ Regulations         — browse the ingested EBA regulations and their paragraphs
   ④ Datapoints          — view the ingested datapoints document(s)

Embeds three datasets: matches (DATA), regulation leaves (REGS), datapoint docs (DPDOCS).
"""
import json, os, glob, sys, csv

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from match import DOC_TITLES  # reuse the human titles

OUTPUT_DIR = os.environ.get("REG_JSON_DIR", os.path.join(HERE, "data", "regulations"))
data = json.load(open(os.path.join(HERE, "matches.json"), encoding="utf-8"))


def load_regs():
    regs = []
    for path in sorted(glob.glob(os.path.join(OUTPUT_DIR, "*.json"))):
        d = json.load(open(path, encoding="utf-8"))
        stem = os.path.splitext(os.path.basename(path))[0]
        leaves = []
        for l in d["leaves"]:
            text = (l.get("text") or "").strip()
            if not text:
                continue
            leaves.append({
                "label": l.get("label") or l.get("id"),
                "kind": l.get("kind"),
                "crumb": " › ".join(l.get("breadcrumb") or []),
                "page": l.get("span", {}).get("page_start"),
                "text": text if len(text) <= 2000 else text[:2000] + " …",
            })
        regs.append({
            "stem": stem,
            "title": DOC_TITLES.get(stem, d.get("doc_id", stem)),
            "filename": d.get("filename", stem + ".pdf"),
            "pages": d.get("pages"),
            "paragraphs": len(leaves),
            "leaves": leaves,
        })
    return regs


def load_dpdocs():
    docs = []
    p = os.path.join(HERE, "example_datapoints.json")
    if os.path.exists(p):
        d = json.load(open(p, encoding="utf-8"))
        docs.append({
            "filename": "example_datapoints.csv / .json",
            "framework": d.get("framework", ""),
            "taxonomy_version": d.get("taxonomy_version", ""),
            "datapoints": d.get("datapoints", []),
        })
    return docs


def load_banks():
    banks = []
    for path in sorted(glob.glob(os.path.join(HERE, "bank_returns", "*.csv"))):
        rows = list(csv.DictReader(open(path, encoding="utf-8")))
        if not rows:
            continue
        banks.append({
            "filename": os.path.basename(path),
            "name": rows[0]["entity_name"],
            "lei": rows[0]["entity_lei"],
            "date": rows[0]["reference_date"],
            "values": {r["datapoint_id"]: {"value": r["value"], "unit": r["unit"]} for r in rows},
        })
    return banks


def load_rules_doc():
    p = os.path.join(HERE, "rules.json")
    if os.path.exists(p):
        return json.load(open(p, encoding="utf-8"))
    return {"meta": {}, "rules": []}


regs = load_regs()
dpdocs = load_dpdocs()
banks = load_banks()
rules_doc = load_rules_doc()

# Always write the combined payload (consumed by the React app's dev server).
payload = {"data": data, "regs": regs, "dpdocs": dpdocs, "banks": banks, "rules": rules_doc}
with open(os.path.join(HERE, "payload.json"), "w", encoding="utf-8") as f:
    json.dump(payload, f, ensure_ascii=False)
print("Wrote payload.json")

DIST = os.path.join(HERE, "ui-app", "dist", "index.html")
if os.path.exists(DIST):
    # Pack the React single-file build: inline the payload for the quoted token.
    shell = open(DIST, encoding="utf-8").read()
    blob = json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")
    html = shell.replace('"__PAYLOAD__"', blob)
    source = "ui-app/dist (React build)"
else:
    # Legacy fallback: the original vanilla template.
    TEMPLATE = open(os.path.join(HERE, "ui", "template.html"), encoding="utf-8").read()
    html = (TEMPLATE
            .replace("__DATA__", json.dumps(data, ensure_ascii=False))
            .replace("__REGS__", json.dumps(regs, ensure_ascii=False))
            .replace("__DPDOCS__", json.dumps(dpdocs, ensure_ascii=False))
            .replace("__BANKS__", json.dumps(banks, ensure_ascii=False))
            .replace("__RULES__", json.dumps(rules_doc, ensure_ascii=False)))
    source = "ui/template.html (legacy)"
with open(os.path.join(HERE, "review.html"), "w", encoding="utf-8") as f:
    f.write(html)
print("Wrote review.html (%.1f KB, from %s) · %d regulations · %d datapoint docs · %d bank returns · %d rules"
      % (len(html) / 1024, source, len(regs), len(dpdocs), len(banks), len(rules_doc.get("rules", []))))
