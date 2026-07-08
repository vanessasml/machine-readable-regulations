"""Emit example datapoint files in the two shapes the EBA DPM is normally consumed in:
   - example_datapoints.csv  : flat "data point categorisation" export (one row per cell)
   - example_datapoints.json : structured metamodel view (metric + dimensions + coordinate)

Codes here are DPM-style but illustrative. In production these rows come from the
published EBA DPM database. The empty `legal_reference` column is the gap the mapping
tool fills.
"""
import csv, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(HERE, "matches.json"), encoding="utf-8"))
dps = data["datapoints"]

# ---- flat CSV (what most people recognise as a "datapoints file") -------------------
cols = ["datapoint_id", "framework", "table", "row", "col", "metric", "data_type", "period",
        "dim_1", "member_1", "dim_2", "member_2", "legal_reference"]
with open(os.path.join(HERE, "example_datapoints.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(cols)
    for dp in dps:
        tb = dp["cell"].split(" · ")[0]
        rc = dp["cell"].split(" · ")[1] if " · " in dp["cell"] else ""
        row = rc.split("/")[0].lstrip("r") if rc else ""
        col = rc.split("/")[1].lstrip("c") if "/" in rc else ""
        d = dp.get("dimensions", []) + [{}, {}]
        w.writerow([
            dp["code"], dp.get("framework", "Other"), tb, row, col,
            dp["name"], dp["metric"]["data_type"], dp["metric"]["period"],
            d[0].get("dim", ""), d[0].get("member", ""),
            d[1].get("dim", ""), d[1].get("member", ""),
            "",  # legal_reference — populated by the mapping tool
        ])

# ---- structured JSON (closer to the DPM metamodel) ----------------------------------
structured = [{
    "datapoint_id": dp["code"],
    "name": dp["name"],
    "framework": dp.get("framework", "Other"),
    "metric": dp["metric"],
    "dimensions": dp["dimensions"],
    "table_coordinate": {
        "table": dp["cell"].split(" · ")[0],
        "cell": dp["cell"].split(" · ")[1] if " · " in dp["cell"] else "",
    },
    "definition": dp.get("note", ""),
    "legal_reference": None,
} for dp in dps]
with open(os.path.join(HERE, "example_datapoints.json"), "w", encoding="utf-8") as f:
    json.dump({"framework": "Illustrative EBA-style datapoint set",
               "taxonomy_version": "sample-1.0", "datapoints": structured}, f,
              ensure_ascii=False, indent=2)

print(f"Wrote example_datapoints.csv and example_datapoints.json ({len(dps)} datapoints)")
