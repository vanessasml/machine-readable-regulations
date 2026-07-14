/** ⑦ Banks overview — the datapoints × banks comparability matrix.
 *  Port of legacy renderOverview(): one row per datapoint (definition +
 *  effective legal basis, live from tab ③), one equal-width column per bank
 *  with its formatted reported value. Adds a framework filter. */
import { useState } from "react";
import type { Candidate } from "../types";
import { useAppState, usePayload } from "../store";
import {
  EmptyState,
  Reveal,
  StatusPill,
  Toolbar,
  fmtVal,
  toast,
} from "../components/ui";

// ------------------------------------------------------------------ citation

function copyCitation(cand: Candidate): void {
  const cite =
    `${cand.doc} — ${cand.label}` + (cand.page != null ? `, p.${cand.page}` : "");
  const done = () => toast("Citation copied");
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(cite).then(done, done);
    return;
  }
  // file:// fallback (the packed review.html runs outside a secure context)
  const ta = document.createElement("textarea");
  ta.value = cite;
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } catch {
    /* best effort */
  }
  ta.remove();
  done();
}

/** Copyable provision citation token (label · page). */
function Cite({ cand }: { cand: Candidate }) {
  return (
    <span
      className="ui-cite"
      role="button"
      tabIndex={0}
      title={`Copy citation — ${cand.doc_title}`}
      onClick={() => copyCitation(cand)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          copyCitation(cand);
        }
      }}
    >
      {cand.label}
      {cand.page != null ? ` · p.${cand.page}` : ""}
    </span>
  );
}

// ---------------------------------------------------------------------- view

export default function OverviewView() {
  const { payload } = usePayload();
  const { effective } = useAppState();
  const [fw, setFw] = useState("");
  if (!payload) return null;

  const banks = payload.banks;
  const dps = payload.data.datapoints;

  if (!banks.length) {
    return (
      <EmptyState
        title="No bank returns ingested"
        hint="Add bank return CSV files under bank_returns/ and re-run python3 build_ui.py — the cross-bank comparability matrix will appear here."
      />
    );
  }
  if (!dps.length) {
    return (
      <EmptyState
        title="No datapoints in the dictionary"
        hint="Run python3 match.py to produce matches.json, then re-run python3 build_ui.py."
      />
    );
  }

  const frameworks = [...new Set(dps.map((dp) => dp.framework || "Other"))].sort();
  const shown = fw ? dps.filter((dp) => (dp.framework || "Other") === fw) : dps;

  // Equal-width bank columns so figures line up for comparison.
  const bankW = `${Math.max(12, Math.round(48 / banks.length))}%`;

  return (
    <>
      <Toolbar>
        <label>
          Show
          <select
            value={fw}
            onChange={(e) => setFw(e.target.value)}
            aria-label="Filter by framework"
          >
            <option value="">all frameworks</option>
            {frameworks.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <span className="grow" />
        <span className="small muted">
          {fw ? `${shown.length} of ${dps.length}` : `${dps.length}`} datapoints
          · {frameworks.length} frameworks · {banks.length} bank returns
        </span>
      </Toolbar>

      <p className="lede">
        One row per datapoint definition with its effective legal basis, one
        column per institution — figures are comparable by construction because
        every value traces to the same provision.
      </p>

      <Reveal>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: "24%" }}>Datapoint</th>
                <th>Legal basis</th>
                {banks.map((b) => (
                  <th
                    key={b.lei}
                    className="num"
                    style={{ width: bankW, minWidth: 110 }}
                  >
                    {b.name}
                    <br />
                    <span style={{ fontWeight: 400, color: "var(--muted)" }}>
                      {b.date}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((dp) => {
                const eff = effective(dp);
                const cand = eff.status !== "none" ? eff.cand : null;
                return (
                  <tr key={dp.code}>
                    <td>
                      <span className="ui-code">{dp.cell}</span>
                      <div style={{ marginTop: 4 }}>{dp.name}</div>
                      <div className="small faint">
                        {dp.framework || "Other"}
                      </div>
                    </td>
                    <td>
                      {cand ? (
                        <>
                          <div
                            className="small"
                            style={{ fontWeight: 600, color: "var(--navy)" }}
                            title={cand.doc_title}
                          >
                            {cand.doc}
                          </div>
                          <div className="row" style={{ gap: 8, marginTop: 2 }}>
                            <Cite cand={cand} />
                            <StatusPill
                              status={eff.status}
                              label={
                                eff.status === "accepted"
                                  ? "confirmed"
                                  : "proposed"
                              }
                            />
                          </div>
                        </>
                      ) : (
                        <span className="muted">— no match —</span>
                      )}
                    </td>
                    {banks.map((b) => {
                      const v = b.values[dp.code];
                      return (
                        <td key={b.lei} className="mono num">
                          {v ? (
                            fmtVal(v.value, v.unit)
                          ) : (
                            <span className="faint">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Reveal>

      <Reveal delay={60}>
        <p className="small muted" style={{ marginTop: 10 }}>
          Basis tags update live with decisions made in the mapping review.
          Click a citation to copy it.
        </p>
      </Reveal>
    </>
  );
}
