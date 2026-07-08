"""
Datapoint -> Regulation mapping prototype.

Reads the extracted EBA regulation JSON produced by regparser (examples/output/*.json),
indexes every citable paragraph (`leaf`), and for a set of DPM-style datapoints proposes
the most relevant provision(s) with a confidence score and the quoted legal text as
evidence. Output (matches.json) feeds the human-in-the-loop review UI (review.html).

Pure standard library: a small TF-IDF + cosine matcher, no external dependencies.
"""

import json
import math
import re
import glob
import os
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
# Regulation JSON produced by `ingest.py` (which calls the regulation-parser package).
OUTPUT_DIR = os.environ.get("REG_JSON_DIR", os.path.join(HERE, "data", "regulations"))
MIN_TEXT_LEN = 160          # ignore tiny/administrative fragments
TOP_N = 3                   # candidates proposed per datapoint

STOPWORDS = set("""
a an the of to in for on and or as by with at from that this these those is are be been being
which such shall should may must can will would not no any all its it their his her they them
under pursuant accordance article paragraph point section annex where when whether other more
than into out over per any each both same such other any been being has have had do does did
""".split())

# Human-readable titles for the loaded documents (fallback to doc id if missing).
DOC_TITLES = {
    "EBA_GL_2018_02": "GL on management of interest rate risk (IRRBB), EBA/GL/2018/02",
    "EBA_GL_2018_06": "GL on management of non-performing and forborne exposures, EBA/GL/2018/06",
    "EBA_CP_2018_01": "CP – Draft GL on NPE and forborne exposures, EBA/CP/2018/01",
    "EBA_GL_2019_02": "GL on outsourcing arrangements, EBA/GL/2019/02",
    "EBA_GL_2016_10": "GL on ICAAP and ILAAP information for SREP, EBA/GL/2016/10",
    "EBA_GL_2017_06": "GL on credit risk management and expected credit losses, EBA/GL/2017/06",
    "EBA_GL_2020_06": "GL on loan origination and monitoring, EBA/GL/2020/06",
    "EBA_GL_2015_02": "GL on recovery plan indicators, EBA/GL/2015/02",
    "EBA_GL_2017_10": "GL on major incident reporting under PSD2, EBA/GL/2017/10",
    "EBA_GL_2022_08": "GL on data collection on high earners, EBA/GL/2022/08",
    "EBA_GL_2015_22": "GL on sound remuneration policies, EBA/GL/2015/22",
    "EBA_CP_2017_17": "CP – Draft GL on institution's stress testing, EBA/CP/2017/17",
}

# Datapoints in the real DPM shape: each carries a metric (what is measured), a set of
# dimensions -> members (semantic categorisation) and a template coordinate (positional
# definition). In production these rows come straight from the published EBA DPM database;
# here a representative slice, themed to the regulations available in examples/output/.
#   metric:     {data_type, period}
#   dimensions: [{dim, domain, member}, ...]
#   table:      {table, row, col}
#   note:       plain-language gloss (optional, aids matching + review)
DATAPOINTS = [
    dict(code="J 05.00 r0010 c0010", name="Change in economic value of equity (ΔEVE)",
         metric=dict(data_type="Monetary", period="Instant"),
         dimensions=[dict(dim="Main category", domain="IRRBB measure", member="Economic value of equity"),
                     dict(dim="Scenario", domain="Interest rate scenario", member="Supervisory shock scenario")],
         table=dict(table="J 05.00", row="0010", col="0010"),
         note="change in economic value of equity under supervisory interest rate shock scenarios, non-trading book banking book"),
    dict(code="J 06.00 r0010 c0010", name="Net interest income sensitivity",
         metric=dict(data_type="Monetary", period="Duration"),
         dimensions=[dict(dim="Main category", domain="IRRBB measure", member="Net interest income"),
                     dict(dim="Time horizon", domain="Time band", member="12 months")],
         table=dict(table="J 06.00", row="0010", col="0010"),
         note="sensitivity of net interest income to interest rate changes over a twelve month horizon under shock scenarios"),
    dict(code="J 07.00 r0020 c0010", name="Supervisory outlier test – decline vs Tier 1",
         metric=dict(data_type="Percentage", period="Instant"),
         dimensions=[dict(dim="Main category", domain="IRRBB measure", member="Economic value of equity decline"),
                     dict(dim="Reference amount", domain="Own funds", member="Tier 1 capital")],
         table=dict(table="J 07.00", row="0020", col="0010"),
         note="supervisory outlier test where the decline in economic value of equity exceeds the threshold of Tier 1 own funds"),
    dict(code="F 18.00 r0070 c0010", name="Non-performing exposures – gross carrying amount",
         metric=dict(data_type="Monetary", period="Instant"),
         dimensions=[dict(dim="Credit quality", domain="Performing status", member="Non-performing"),
                     dict(dim="Valuation", domain="Accounting", member="Gross carrying amount")],
         table=dict(table="F 18.00", row="0070", col="0010"),
         note="gross carrying amount of non-performing exposures loans and advances past due unlikely to pay"),
    dict(code="F 19.00 r0080 c0010", name="Forborne exposures – forbearance measures",
         metric=dict(data_type="Monetary", period="Instant"),
         dimensions=[dict(dim="Credit quality", domain="Forbearance status", member="Exposures with forbearance measures"),
                     dict(dim="Valuation", domain="Accounting", member="Gross carrying amount")],
         table=dict(table="F 19.00", row="0080", col="0010"),
         note="exposures subject to forbearance measures concessions granted to a debtor facing financial difficulties refinancing modification"),
    dict(code="OUT 01.00 r0010 c0050", name="Outsourcing register – critical or important function",
         metric=dict(data_type="Boolean", period="Instant"),
         dimensions=[dict(dim="Function type", domain="Outsourcing", member="Critical or important function"),
                     dict(dim="Provider", domain="Service provider", member="Cloud service provider")],
         table=dict(table="OUT 01.00", row="0010", col="0050"),
         note="register of outsourcing arrangements recording whether the outsourced function is critical or important and the service provider"),
    dict(code="ICAAP 02.00 r0030 c0010", name="ICAAP internal capital",
         metric=dict(data_type="Monetary", period="Instant"),
         dimensions=[dict(dim="Capital concept", domain="Internal capital", member="Total internal capital"),
                     dict(dim="Purpose", domain="Assessment", member="ICAAP")],
         table=dict(table="ICAAP 02.00", row="0030", col="0010"),
         note="internal capital and capital allocation under the internal capital adequacy assessment process ICAAP to cover risks"),
    dict(code="F 12.01 r0010 c0010", name="Expected credit loss allowance (IFRS 9)",
         metric=dict(data_type="Monetary", period="Instant"),
         dimensions=[dict(dim="Allowance type", domain="Impairment", member="Allowances for expected credit losses"),
                     dict(dim="Stage", domain="IFRS 9 stage", member="Stage 2 lifetime ECL")],
         table=dict(table="F 12.01", row="0010", col="0010"),
         note="allowances for expected credit losses accounting for impairment and provisioning of credit losses"),
    dict(code="REC 01.00 r0010 c0010", name="Recovery plan indicator – CET1 ratio",
         metric=dict(data_type="Percentage", period="Instant"),
         dimensions=[dict(dim="Indicator category", domain="Recovery indicator", member="Capital"),
                     dict(dim="Measure", domain="Own funds ratio", member="Common Equity Tier 1 ratio")],
         table=dict(table="REC 01.00", row="0010", col="0010"),
         note="recovery plan capital indicators such as the common equity tier 1 ratio to identify points at which recovery actions may be taken"),
    dict(code="INC 01.00 r0010 c0010", name="Major operational or security incident (PSD2)",
         metric=dict(data_type="Boolean", period="Instant"),
         dimensions=[dict(dim="Incident class", domain="Incident", member="Major operational or security incident"),
                     dict(dim="Reporter", domain="Entity", member="Payment service provider")],
         table=dict(table="INC 01.00", row="0010", col="0010"),
         note="classification and reporting of a major operational or security incident by a payment service provider to the competent authority"),
    dict(code="HE 01.00 r0010 c0010", name="High earners – count in EUR 1–5m band",
         metric=dict(data_type="Integer", period="Duration"),
         dimensions=[dict(dim="Remuneration band", domain="Pay band", member="EUR 1 000 000 to 5 000 000"),
                     dict(dim="Population", domain="Staff", member="High earners")],
         table=dict(table="HE 01.00", row="0010", col="0010"),
         note="number of natural persons remunerated one million euro or more per financial year broken down by pay band high earners"),
]


def dp_text(dp):
    """Build the match query from the datapoint's structured DPM fields."""
    parts = [dp["name"], dp.get("note", "")]
    for d in dp.get("dimensions", []):
        parts += [d.get("member", ""), d.get("dim", ""), d.get("domain", "")]
    return " ".join(parts)


def dp_label(dp):
    """Compact human label for a template coordinate, e.g. 'J 05.00 · r0010/c0010'."""
    tb = dp.get("table", {})
    return f"{tb.get('table', '')} · r{tb.get('row', '')}/c{tb.get('col', '')}".strip()


def framework_of(dp):
    """Reporting framework a datapoint belongs to, inferred from its template prefix."""
    t = (dp.get("table", {}).get("table") or "").split(" ")[0]
    return {
        "J": "IRRBB", "F": "FINREP", "C": "COREP", "OUT": "Outsourcing",
        "ICAAP": "ICAAP / SREP", "REC": "Recovery planning",
        "INC": "PSD2 incident reporting", "HE": "Remuneration (high earners)",
    }.get(t, "Other")


def tokenize(text):
    return [t for t in re.findall(r"[a-z]+", text.lower()) if t not in STOPWORDS and len(t) > 2]


def load_leaves():
    docs = {}
    corpus = []  # list of dict(doc_id, filename, leaf, tokens)
    for path in sorted(glob.glob(os.path.join(OUTPUT_DIR, "*.json"))):
        d = json.load(open(path, encoding="utf-8"))
        stem = os.path.splitext(os.path.basename(path))[0]
        docs[stem] = DOC_TITLES.get(stem, d.get("doc_id", stem))
        for leaf in d["leaves"]:
            text = (leaf.get("text") or "").strip()
            if len(text) < MIN_TEXT_LEN:
                continue
            corpus.append({
                "stem": stem,
                "title": docs[stem],
                "leaf": leaf,
                "tokens": Counter(tokenize(text)),
            })
    return docs, corpus


def build_idf(corpus):
    N = len(corpus)
    df = Counter()
    for c in corpus:
        for term in c["tokens"]:
            df[term] += 1
    return {t: math.log((N + 1) / (df_t + 1)) + 1 for t, df_t in df.items()}, N


def tfidf_vec(counter, idf):
    vec = {}
    total = sum(counter.values()) or 1
    for term, cnt in counter.items():
        if term in idf:
            vec[term] = (cnt / total) * idf[term]
    norm = math.sqrt(sum(v * v for v in vec.values())) or 1.0
    return {t: v / norm for t, v in vec.items()}


def cosine(a, b):
    if len(a) > len(b):
        a, b = b, a
    return sum(v * b.get(t, 0.0) for t, v in a.items())


def band(score):
    if score >= 0.50:
        return "high"
    if score >= 0.35:
        return "medium"
    return "low"


def snippet(text, limit=460):
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= limit else text[:limit].rsplit(" ", 1)[0] + " …"


def main():
    docs, corpus = load_leaves()
    idf, N = build_idf(corpus)
    for c in corpus:
        c["vec"] = tfidf_vec(c["tokens"], idf)

    results = []
    for dp in DATAPOINTS:
        q = tfidf_vec(Counter(tokenize(dp_text(dp))), idf)
        scored = sorted(
            ((cosine(q, c["vec"]), c) for c in corpus),
            key=lambda x: x[0], reverse=True,
        )[:TOP_N]
        candidates = []
        for score, c in scored:
            leaf = c["leaf"]
            candidates.append({
                "doc": c["stem"],
                "doc_title": c["title"],
                "label": leaf.get("label") or leaf.get("id"),
                "breadcrumb": " › ".join(leaf.get("breadcrumb") or []),
                "page": leaf.get("span", {}).get("page_start"),
                "score": round(float(score), 4),
                "confidence": round(min(float(score) / 0.80, 1.0) * 100),
                "band": band(score),
                "evidence": snippet(leaf.get("text", "")),
            })
        results.append({**dp, "cell": dp_label(dp), "framework": framework_of(dp),
                        "candidates": candidates})

    out = {
        "generated_from": os.path.relpath(OUTPUT_DIR, HERE),
        "documents_indexed": len(docs),
        "paragraphs_indexed": N,
        "datapoints": results,
    }
    with open(os.path.join(HERE, "matches.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"Indexed {N} paragraphs across {len(docs)} regulations.")
    for r in results:
        top = r["candidates"][0]
        print(f"  {r['code']:<14} -> {top['doc']} {top['label']} "
              f"(p.{top['page']}, {top['confidence']}% {top['band']})")


if __name__ == "__main__":
    main()
