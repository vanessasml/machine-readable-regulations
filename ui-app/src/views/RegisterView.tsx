/** Tab ⑤ — Supervisor register: the audit-ready output the mapping unlocks.
 *  KPI band, combined forward table (datapoint → provision), reverse
 *  by-regulation index (impact analysis), and the legacy CSV export.
 *  All displayed links derive from useAppState().effective(dp), so decisions
 *  taken in tab ③ flow through live. */
import { useState } from "react";
import type { Candidate, Datapoint } from "../types";
import { useAppState, usePayload, type EffectiveLink } from "../store";
import {
  Btn,
  Card,
  Chip,
  EmptyState,
  KPI,
  KPIRow,
  Reveal,
  SectionTitle,
  StatusPill,
  Toolbar,
  download,
  toast,
} from "../components/ui";
import "./RegisterView.css";

/** Lowercase table-tag labels (legacy .tag look). */
const TAG_LABEL: Record<EffectiveLink["status"], string> = {
  accepted: "confirmed",
  proposed: "proposed",
  none: "no match",
};

interface Row {
  dp: Datapoint;
  status: EffectiveLink["status"];
  cand: Candidate | null;
}

export default function RegisterView() {
  const { payload } = usePayload();
  const { effective } = useAppState();
  const [fw, setFw] = useState("");
  if (!payload) return null;

  const dps = payload.data.datapoints;
  const frameworks = [...new Set(dps.map((dp) => dp.framework || "Other"))].sort();

  const rows: Row[] = dps
    .filter((dp) => !fw || (dp.framework || "Other") === fw)
    .map((dp) => ({ dp, ...effective(dp) }));

  // ------------------------------------------------------------------- KPIs
  const nConf = rows.filter((r) => r.status === "accepted").length;
  const nProp = rows.filter((r) => r.status === "proposed").length;
  const nNone = rows.filter((r) => r.status === "none").length;
  const withBasis = rows.filter((r) => r.status !== "none" && r.cand !== null);
  const coverage = rows.length ? Math.round((withBasis.length / rows.length) * 100) : 0;
  const confVals = rows
    .filter((r) => r.status === "accepted" && r.cand !== null)
    .map((r) => (r.cand as Candidate).confidence);
  const avgConf = confVals.length
    ? Math.round(confVals.reduce((a, b) => a + b, 0) / confVals.length)
    : 0;
  const docsCovered = new Set(withBasis.map((r) => (r.cand as Candidate).doc)).size;

  // ------------------------------------------------- reverse index (impact)
  const byReg = new Map<string, { title: string; items: Row[] }>();
  for (const r of rows) {
    if (r.status === "none" || !r.cand) continue;
    const g = byReg.get(r.cand.doc) ?? { title: r.cand.doc_title, items: [] };
    g.items.push(r);
    byReg.set(r.cand.doc, g);
  }
  const groups = [...byReg.entries()].sort((a, b) => b[1].items.length - a[1].items.length);

  // ------------------------------------------------- CSV export (legacy schema)
  /** Always exports the FULL register (unfiltered), exactly like the legacy page. */
  const exportCsv = () => {
    const q = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const head = [
      "datapoint_code",
      "datapoint_name",
      "template_cell",
      "status",
      "regulation",
      "provision",
      "page",
      "confidence",
    ];
    const lines = [head.join(",")];
    for (const dp of dps) {
      const { status, cand } = effective(dp);
      const has = status !== "none" && cand !== null;
      lines.push(
        [
          dp.code,
          dp.name,
          dp.cell,
          status,
          has ? cand.doc : "",
          has ? cand.label : "",
          has ? cand.page : "",
          has ? cand.confidence : "",
        ]
          .map(q)
          .join(","),
      );
    }
    download("mapping_register.csv", lines.join("\n"), "text/csv");
    toast("Exported mapping_register.csv");
  };

  return (
    <>
      <SectionTitle sub="what the mapping unlocks">Supervisor register</SectionTitle>
      <p className="lede">
        The combined register: every datapoint with its effective legal basis. Confirmed links come
        from the mapping review (tab ③); proposed rows show the engine&rsquo;s top candidate still
        awaiting a reviewer.
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
          {fw ? `${rows.length} of ${dps.length} datapoints` : `${dps.length} datapoints`}
        </span>
        <span className="grow" />
        <Btn variant="primary" onClick={exportCsv}>
          Export register (CSV)
        </Btn>
      </Toolbar>

      <KPIRow>
        <KPI label="Datapoints" value={rows.length} delay={0} />
        <KPI label="Confirmed" value={nConf} delay={60} />
        <KPI label="Proposed (unreviewed)" value={nProp} delay={120} />
        <KPI label="No match" value={nNone} delay={180} />
        <KPI label="Coverage (with legal basis)" value={coverage} suffix="%" delay={240} />
        <KPI label="Avg confidence (confirmed)" value={avgConf} suffix="%" delay={300} />
        <KPI label="Regulations covered" value={docsCovered} delay={360} />
      </KPIRow>

      <SectionTitle sub="datapoint → status → provision">Combined mapping register</SectionTitle>
      <Reveal>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Datapoint</th>
                <th>Template cell</th>
                <th>Regulation</th>
                <th>Provision</th>
                <th className="num">Conf.</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ dp, status, cand }) => {
                const basis = status !== "none" ? cand : null;
                return (
                  <tr key={dp.code}>
                    <td>
                      <span className="ui-code">{dp.code}</span>{" "}
                      <Chip>{dp.framework || "Other"}</Chip>
                      <span className="rv-name">{dp.name}</span>
                    </td>
                    <td className="mono">{dp.cell}</td>
                    <td>
                      {basis ? (
                        <>
                          <span className="rv-doc">{basis.doc_title}</span>
                          <br />
                          <span className="rv-stem">{basis.doc}</span>
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {status === "none" ? (
                        <span className="muted">— no match —</span>
                      ) : basis ? (
                        <span className="mono" style={{ whiteSpace: "nowrap" }}>
                          {basis.label}
                          {basis.page != null ? ` · p.${basis.page}` : ""}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="num">{basis ? `${basis.confidence}%` : "—"}</td>
                    <td>
                      <StatusPill status={status} label={TAG_LABEL[status]} />
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    No datapoints in this framework.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Reveal>

      <SectionTitle sub="impact analysis">
        By regulation — which datapoints derive from each document
      </SectionTitle>
      <p className="lede">
        The reverse index. Read it the other way for impact analysis: if a provision is amended,
        these are the datapoints affected.
      </p>

      {groups.length === 0 ? (
        <EmptyState
          title="No mappings yet"
          hint="Once datapoints are linked to provisions (confirmed or proposed), they group here by source regulation."
        />
      ) : (
        groups.map(([doc, g], gi) => (
          <Reveal key={doc} delay={Math.min(gi, 8) * 40}>
            <Card>
              <div className="row">
                <h4 className="rv-reg-title">{g.title}</h4>
                <span className="ui-code">{doc}</span>
                <span className="muted small" style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>
                  {g.items.length} datapoint{g.items.length === 1 ? "" : "s"} mapped here
                </span>
              </div>
              <div className="rv-items">
                {g.items.map(({ dp, status, cand }) => (
                  <div className="rv-item" key={dp.code}>
                    <span className="mono">{dp.cell}</span>
                    <span className="grow">{dp.name}</span>
                    <span className="mono">
                      {cand ? cand.label : ""}
                      {cand && cand.page != null ? ` · p.${cand.page}` : ""}
                    </span>
                    <StatusPill status={status} label={TAG_LABEL[status]} />
                  </div>
                ))}
              </div>
            </Card>
          </Reveal>
        ))
      )}
    </>
  );
}
