/** ⑥ Bank returns — value → datapoint → law traceability.
 *  Port of legacy renderBanks(): every reported cell traces to its datapoint
 *  definition (code, name, metric, dimensions) and to the effective legal
 *  basis. The basis reacts live to mapping-review decisions (tab ③) via
 *  useAppState().effective(dp). */
import { useState } from "react";
import type { Candidate, Datapoint } from "../types";
import { useAppState, usePayload } from "../store";
import {
  Btn,
  Chip,
  EmptyState,
  Reveal,
  SectionTitle,
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

export default function BanksView() {
  const { payload } = usePayload();
  const { effective, setTab } = useAppState();
  const [idx, setIdx] = useState(0);
  if (!payload) return null;

  const banks = payload.banks;
  if (!banks.length) {
    return (
      <EmptyState
        title="No bank returns ingested"
        hint="Add bank return CSV files under bank_returns/ and re-run python3 build_ui.py — each reported value will then trace to its datapoint definition and legal basis here."
      />
    );
  }

  const bank = banks[Math.min(idx, banks.length - 1)];
  const dpByCode = new Map(
    payload.data.datapoints.map((dp): [string, Datapoint] => [dp.code, dp]),
  );

  // One row per reported value; the effective basis follows tab-③ decisions.
  const rows = Object.entries(bank.values).map(([code, cell]) => {
    const dp = dpByCode.get(code);
    let cand: Candidate | null = null;
    let status: "accepted" | "proposed" | null = null;
    if (dp) {
      const eff = effective(dp);
      if (eff.status !== "none" && eff.cand) {
        cand = eff.cand;
        status = eff.status;
      }
    }
    return { code, cell, dp, cand, status };
  });

  const nConfirmed = rows.filter((r) => r.status === "accepted").length;
  const nProposed = rows.filter((r) => r.status === "proposed").length;
  const nNoMatch = rows.filter((r) => r.dp && !r.cand).length;
  const nUnknown = rows.filter((r) => !r.dp).length;
  const basisSummary = [
    `${nConfirmed} confirmed`,
    `${nProposed} proposed`,
    ...(nNoMatch ? [`${nNoMatch} no match`] : []),
    ...(nUnknown ? [`${nUnknown} not in dictionary`] : []),
  ].join(" · ");

  return (
    <>
      <Toolbar>
        <label>
          Bank return
          <select
            value={idx}
            onChange={(e) => setIdx(Number(e.target.value))}
            aria-label="Select bank return"
          >
            {banks.map((b, i) => (
              <option key={b.lei} value={i}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <span className="grow" />
        <span className="small muted">
          {banks.length} return{banks.length === 1 ? "" : "s"} loaded · every
          value traces to quoted legal text
        </span>
      </Toolbar>

      {/* key by LEI so switching banks replays the entrance reveal */}
      <div key={bank.lei}>
        <Reveal>
          <SectionTitle sub={`LEI ${bank.lei} · reporting date ${bank.date}`}>
            {bank.name}
          </SectionTitle>
          <div className="chips">
            <Chip>
              <b>Source</b> {bank.filename}
            </Chip>
            <Chip>
              <b>Values</b> {rows.length} reported
            </Chip>
            <Chip>
              <b>Legal basis</b> {basisSummary}
            </Chip>
          </div>
        </Reveal>

        <Reveal delay={60}>
          <div className="table-wrap" style={{ marginTop: 14 }}>
            <table>
              <thead>
                <tr>
                  <th>Template cell</th>
                  <th>Datapoint</th>
                  <th className="num">Reported value</th>
                  <th>Legal basis (regulation → provision)</th>
                  <th>Basis</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.code}>
                    <td className="mono">{r.code}</td>
                    <td>
                      <b>{r.dp ? r.dp.name : r.code}</b>
                      {r.dp && (
                        <div className="small muted" style={{ marginTop: 2 }}>
                          {r.dp.metric.data_type} · {r.dp.metric.period}
                          {r.dp.dimensions.length > 0 && (
                            <>
                              {" · "}
                              {r.dp.dimensions
                                .map((d) => `${d.dim} = ${d.member}`)
                                .join(" · ")}
                            </>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="mono num">
                      {fmtVal(r.cell.value, r.cell.unit)}
                    </td>
                    <td>
                      {r.cand ? (
                        <>
                          <div
                            className="small"
                            style={{ fontWeight: 600, color: "var(--navy)" }}
                            title={r.cand.doc_title}
                          >
                            {r.cand.doc}
                          </div>
                          <Cite cand={r.cand} />
                        </>
                      ) : (
                        <span className="muted">
                          {r.dp
                            ? "— no match —"
                            : "— datapoint not in dictionary —"}
                        </span>
                      )}
                    </td>
                    <td>
                      {r.cand && r.status ? (
                        <StatusPill
                          status={r.status}
                          label={
                            r.status === "accepted" ? "confirmed" : "proposed"
                          }
                        />
                      ) : r.dp ? (
                        <StatusPill status="none" label="no match" />
                      ) : (
                        <span className="faint">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="row" style={{ marginTop: 10 }}>
            <span className="small muted">
              Confirming a link in the mapping review promotes its basis from{" "}
              <b>proposed</b> to <b>confirmed</b> — decisions flow straight
              through to this traceability view. Click a citation to copy it.
            </span>
            <Btn variant="ghost" onClick={() => setTab("review")}>
              Open mapping review →
            </Btn>
          </div>
        </Reveal>
      </div>
    </>
  );
}
