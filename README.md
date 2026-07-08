# reg-datapoint-mapper — Datapoint → Regulation mapping

A working proof of concept for the pilot: it links reporting **datapoints** to the exact
regulatory **paragraphs** that define them.

It is a **standalone consumer** of the [`regulation-parser`](https://github.com/vanessasml/eba-regulations-parser)
package: the parser is pulled from GitHub as a dependency (see `pyproject.toml`) and called
in one place — `ingest.py` — to turn regulation PDFs into citation-anchored JSON. The rest
of the app never imports the parser; it works off that JSON. Swapping the parser version is
a dependency bump, nothing else.

## What it does

1. **Ingests** regulation PDFs via `regparser.parse_pdf` (`ingest.py`), producing one JSON
   per document with every citable paragraph's legal label, breadcrumb and page span.
2. **Matches** a set of DPM-style datapoints to the most relevant paragraphs with a
   lexical TF-IDF + cosine engine, returning the top 3 candidates each, a confidence
   score, and the **quoted legal text as evidence**.
The `review.html` app has six tabs, grouped to read as a flow — **inputs → engine → what
it unlocks**:

**Inputs**

3. **Regulations** (tab ①) — browse all 21 ingested regulations; pick a document and read
   its paragraphs with citation labels, breadcrumbs and page numbers, with an in-document
   text filter.
4. **Datapoints** (tab ②) — the ingested datapoints document as a table: each datapoint's
   cell, **framework**, metric, dimensions→members, and the (initially empty) legal
   reference. The template/definition side — no values. A **framework filter** (IRRBB,
   FINREP, Outsourcing, …) shows the tool spans many templates, not one.

**Engine**

5. **Regulation → Datapoint mapping** (tab ③) — the product. For each datapoint the engine
   proposes the provisions that define it (confidence + quoted legal text); a reviewer
   confirms, corrects, or rejects (human-in-the-loop). Exports decisions as JSON.

**What it unlocks**

6. **Supervisor register** (tab ④) — the combined traceability view: coverage KPIs, a
   forward datapoint→provision table (with a **framework filter**), a reverse
   *by-regulation* index (impact analysis: if a provision changes, which datapoints are
   affected), and a CSV export.
7. **Bank returns** (tab ⑤) — two example submitted returns (`bank_returns/*.csv`, with
   entity LEI, reporting date and figures) traced end to end: each reported value → its
   datapoint definition → the regulation provision behind it. One definition, many values.
8. **Banks overview** (tab ⑥) — the supervisory pay-off: a matrix of datapoints × banks
   showing each institution's reported value side by side, every row still anchored to the
   provision that defines it. Comparability is the whole point of standardised datapoints.

Datapoints now use the real DPM shape — a **metric**, **dimensions → members**, and a
**template coordinate** (e.g. `J 05.00 · r0010/c0010`) — so swapping in a real slice of the
EBA DPM database is a data change, not a code change.

## Setup

Requires Python ≥ 3.12 (the parser package does). Install the dependency — the parser —
from GitHub:

```bash
# with uv (reads pyproject.toml, installs the parser from GitHub)
uv sync

# or with pip
pip install "regulation-parser @ git+https://github.com/vanessasml/eba-regulations-parser.git"
```

## Run the pipeline

```bash
# 1. Ingest PDFs → data/regulations/*.json   (calls the parser package)
python ingest.py path/to/pdfs            # or set REG_PDF_DIR; defaults to ../eba-regulations-parser/examples/pdfs

# 2. Match datapoints → provisions
python match.py                          # -> matches.json

# 3. (optional) regenerate the sample datapoints file
python gen_datapoints_file.py            # -> example_datapoints.csv / .json

# 4. Build the app
python build_ui.py                       # -> review.html
```

Then open `review.html` in any browser — it is fully self-contained (data inlined, no
external requests, no server needed).

## Files

| File | Purpose |
|------|---------|
| `pyproject.toml` | Declares the `regulation-parser` GitHub dependency. |
| `ingest.py` | **Integration boundary** — calls `regparser.parse_pdf` to produce `data/regulations/*.json`. |
| `match.py` | Datapoints + TF-IDF matcher over the ingested regulation JSON. Edit `DATAPOINTS` to add your own. |
| `gen_datapoints_file.py` | Emits the sample `example_datapoints.csv / .json`. |
| `build_ui.py` | Embeds everything into the review app. |
| `bank_returns/*.csv` | Two example filled bank returns (the value side). |
| `data/regulations/` | Ingested regulation JSON (git-ignored; regenerate with `ingest.py`). |
| `review.html` | The interactive six-tab app. |

## How this maps to production

This prototype deliberately keeps the two hard parts *out* of scope, exactly as the pilot
proposes. The datapoints here are an illustrative sample — in production they come from the
**EBA DPM dictionary**. The matcher is lexical only; a production version adds an **LLM
re-ranker** on the shortlist for semantic precision. What is already real and reusable: the
extracted, citation-anchored regulation text, the candidate-plus-evidence structure, the
confidence banding, and the human-in-the-loop review + export workflow. Every proposed link
carries the quoted source provision, so nothing is a black box.
