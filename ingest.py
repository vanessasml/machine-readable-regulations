"""Ingest step — the integration boundary with the parser package.

Turns regulation PDFs into the JSON the matcher consumes by calling `regparser.parse_pdf`
(the `regulation-parser` package, pulled from GitHub — see pyproject.toml). The prototype
depends on the parser ONLY through this one import, so the two stay cleanly decoupled.

Usage:
    python ingest.py [PDF_DIR]
    # PDF_DIR defaults to $REG_PDF_DIR, else ../examples/pdfs (the parser's sample PDFs).

Writes one <stem>.json per PDF into data/regulations/, matching the parser's canonical
schema (doc_id, leaves, outline, full_text, quality, …). Re-run whenever the PDFs or the
parser version change.
"""
import glob
import json
import os
import sys

from regparser import parse_pdf  # provided by the regulation-parser package

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "data", "regulations")


def main(argv=None):
    argv = argv if argv is not None else sys.argv[1:]
    pdf_dir = (
        argv[0] if argv
        else os.environ.get(
            "REG_PDF_DIR",
            os.path.join(HERE, "..", "eba-regulations-parser", "examples", "pdfs"),
        )
    )
    pdfs = sorted(glob.glob(os.path.join(pdf_dir, "*.pdf")))
    if not pdfs:
        print(f"No PDFs found in {pdf_dir!r}. Pass a folder or set REG_PDF_DIR.")
        return 1

    os.makedirs(OUT_DIR, exist_ok=True)
    for path in pdfs:
        stem = os.path.splitext(os.path.basename(path))[0]
        result = parse_pdf(path)
        with open(os.path.join(OUT_DIR, stem + ".json"), "w", encoding="utf-8") as f:
            json.dump(result.model_dump(mode="json"), f, ensure_ascii=False, indent=2)
        print(f"  {stem}: {len(result.leaves)} leaves (quality {result.quality.score})")

    print(f"Ingested {len(pdfs)} regulation(s) → {os.path.relpath(OUT_DIR, HERE)}/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
