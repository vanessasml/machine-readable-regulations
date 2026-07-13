/** Tab ② — Datapoints: the DPM-style datapoint dictionary (input B).
 *  Framework filter + one table per ingested document over payload.dpdocs:
 *  template coordinate, metric, dimensions → members, and the legal-reference
 *  column the mapping tool exists to fill. */
import { useState } from "react";
import { usePayload } from "../store";
import {
  Card,
  Chip,
  EmptyState,
  Reveal,
  SectionTitle,
  StatusPill,
  Toolbar,
} from "../components/ui";

export default function DatapointsView() {
  const { payload } = usePayload();
  const [fw, setFw] = useState("");
  if (!payload) return null;

  const docs = payload.dpdocs;

  if (docs.length === 0) {
    return (
      <>
        <SectionTitle sub="input B — what banks must report">Datapoints</SectionTitle>
        <EmptyState
          title="No datapoints document ingested"
          hint="example_datapoints.json is missing from this build — run `python3 build_ui.py` in the repo root with the sample artifacts in place."
        />
      </>
    );
  }

  const frameworks = [
    ...new Set(docs.flatMap((d) => d.datapoints.map((dp) => dp.framework || "Other"))),
  ].sort();
  const total = docs.reduce((n, d) => n + d.datapoints.length, 0);
  const shown = docs.reduce(
    (n, d) => n + d.datapoints.filter((dp) => !fw || (dp.framework || "Other") === fw).length,
    0,
  );

  return (
    <>
      <SectionTitle sub="input B — what banks must report">Datapoints</SectionTitle>
      <p className="lede">
        The machine-readable datapoint dictionary, DPM-style: each reportable cell with its metric,
        dimensional qualification and template coordinate. The <b>legal reference</b> column is what
        the mapping engine (tab ③) exists to fill.
      </p>

      <Toolbar>
        <label>
          Framework
          <select value={fw} onChange={(e) => setFw(e.target.value)}>
            <option value="">all frameworks</option>
            {frameworks.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <span className="muted small" style={{ whiteSpace: "nowrap" }}>
          {fw ? `${shown} of ${total} datapoints` : `${total} datapoints`} · {frameworks.length}{" "}
          framework{frameworks.length === 1 ? "" : "s"}
        </span>
      </Toolbar>

      {docs.map((doc, di) => {
        const dps = doc.datapoints.filter((dp) => !fw || (dp.framework || "Other") === fw);
        return (
          <Reveal key={doc.filename} delay={Math.min(di, 8) * 40}>
            <Card>
              <div className="row">
                <h4 style={{ fontSize: 15.5 }}>{doc.filename}</h4>
                <StatusPill status="accepted" label={`${doc.datapoints.length} datapoints`} />
                <span className="muted small" style={{ marginLeft: "auto" }}>
                  {doc.framework} · taxonomy {doc.taxonomy_version}
                </span>
              </div>

              {dps.length === 0 ? (
                <p className="muted small" style={{ margin: "12px 0 4px" }}>
                  No datapoints in this document match the framework filter.
                </p>
              ) : (
                <div className="table-wrap" style={{ marginTop: 12 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Cell</th>
                        <th>Framework</th>
                        <th>Datapoint</th>
                        <th>Metric</th>
                        <th>Dimensions → members</th>
                        <th>Legal reference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dps.map((dp) => (
                        <tr key={dp.datapoint_id}>
                          <td className="mono">
                            {dp.table_coordinate.table} · {dp.table_coordinate.cell}
                          </td>
                          <td>
                            <Chip>{dp.framework || "Other"}</Chip>
                          </td>
                          <td>
                            <b>{dp.name}</b>
                            {dp.definition && (
                              <>
                                <br />
                                <span className="muted small">{dp.definition}</span>
                              </>
                            )}
                          </td>
                          <td>
                            {dp.metric.data_type}
                            <br />
                            <span className="muted small">{dp.metric.period}</span>
                          </td>
                          <td>
                            <div className="chips">
                              {dp.dimensions.map((x) => (
                                <Chip key={`${x.dim}|${x.member}`}>
                                  <b>{x.dim}</b> = {x.member}
                                </Chip>
                              ))}
                            </div>
                          </td>
                          <td>
                            {dp.legal_reference ? (
                              dp.legal_reference
                            ) : (
                              <span className="muted">— to be mapped —</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="muted small" style={{ margin: "10px 0 0" }}>
                The <b>legal reference</b> column is what the mapping tool fills — confirmed links
                in the register populate it.
              </p>
            </Card>
          </Reveal>
        );
      })}
    </>
  );
}
