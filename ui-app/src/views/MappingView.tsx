/** Tab ③ — Regulation → Datapoint mapping: the review flow at the heart of the
 *  pilot. Semantics are an exact port of the legacy ui/template.html review
 *  tab: per-datapoint candidate cards, Confirm/Reject toggles, "no correct
 *  match", filter + progress, and the mapping_decisions.json export. */
import { useState } from "react";
import type { Candidate, Datapoint } from "../types";
import { useAppState, usePayload, type MappingDecision } from "../store";
import {
  Btn,
  Card,
  Chip,
  ConfBar,
  EmptyState,
  Evi,
  ProgressBar,
  Reveal,
  SectionTitle,
  StatusPill,
  Toolbar,
  download,
  toast,
} from "../components/ui";
import "./MappingView.css";

type Filter = "all" | "undecided" | "accepted" | "none";

const EMPTY_HINTS: Record<Exclude<Filter, "all">, { title: string; hint: string }> = {
  undecided: {
    title: "Every datapoint has been reviewed",
    hint: "Nothing is left undecided — switch the filter to “all datapoints” to revisit a decision.",
  },
  accepted: {
    title: "No confirmed links yet",
    hint: "Confirm a candidate provision on a datapoint card and it will appear here.",
  },
  none: {
    title: "No datapoints marked “no correct match”",
    hint: "Use the link at the bottom of a datapoint card when none of the proposed provisions is right.",
  },
};

export default function MappingView() {
  const { payload } = usePayload();
  const { getDecision } = useAppState();
  const [filter, setFilter] = useState<Filter>("all");
  if (!payload) return null;

  const dps = payload.data.datapoints;
  const total = dps.length;

  let nUndecided = 0;
  let nAccepted = 0;
  let nNone = 0;
  for (const dp of dps) {
    const st = getDecision(dp.code).status;
    if (st === "undecided") nUndecided += 1;
    else if (st === "accepted") nAccepted += 1;
    else nNone += 1;
  }
  const done = total - nUndecided;

  const visible =
    filter === "all" ? dps : dps.filter((dp) => getDecision(dp.code).status === filter);

  /** Exact legacy export schema (mapping_decisions.json). */
  const exportDecisions = () => {
    const out = dps.map((dp) => {
      const d = getDecision(dp.code);
      const c = d.chosen >= 0 ? dp.candidates[d.chosen] : null;
      return {
        code: dp.code,
        name: dp.name,
        cell: dp.cell,
        decision: d.status,
        mapped_to: c
          ? { doc: c.doc, label: c.label, page: c.page, confidence: c.confidence }
          : null,
        rejected: [...d.rejected].map((i) => ({
          label: dp.candidates[i].label,
          doc: dp.candidates[i].doc,
        })),
      };
    });
    download(
      "mapping_decisions.json",
      JSON.stringify({ reviewed_at: new Date().toISOString(), decisions: out }, null, 2),
      "application/json",
    );
    toast("Exported mapping_decisions.json");
  };

  if (total === 0) {
    return (
      <EmptyState
        title="No datapoints to review"
        hint="matches.json carries no datapoints — run python3 match.py in the repo root, then python3 build_ui.py."
      />
    );
  }

  return (
    <>
      <SectionTitle sub="the engine">Regulation → Datapoint mapping</SectionTitle>
      <p className="lede">
        For each datapoint the engine proposes the regulation provisions that define it, with a
        confidence score and the quoted legal text. A reviewer confirms, corrects, or rejects —
        nothing becomes &ldquo;confirmed&rdquo; without a human.
      </p>

      <Toolbar>
        <label>
          Show
          <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            <option value="all">all datapoints ({total})</option>
            <option value="undecided">undecided ({nUndecided})</option>
            <option value="accepted">confirmed ({nAccepted})</option>
            <option value="none">no match ({nNone})</option>
          </select>
        </label>
        <ProgressBar value={total ? (done / total) * 100 : 0} />
        <span className="muted small" style={{ whiteSpace: "nowrap" }}>
          {done} / {total} reviewed
        </span>
        <Btn variant="primary" onClick={exportDecisions}>
          Export decisions
        </Btn>
      </Toolbar>

      {visible.length === 0 && filter !== "all" ? (
        <EmptyState title={EMPTY_HINTS[filter].title} hint={EMPTY_HINTS[filter].hint} />
      ) : (
        visible.map((dp, i) => <DatapointCard key={dp.code} dp={dp} index={i} />)
      )}
    </>
  );
}

// ------------------------------------------------------------ datapoint card

function DatapointCard({ dp, index }: { dp: Datapoint; index: number }) {
  const { getDecision, toggleNone } = useAppState();
  const d = getDecision(dp.code);
  const tone = d.status === "accepted" ? "done" : d.status === "none" ? "skip" : "default";

  return (
    <Reveal delay={Math.min(index, 8) * 40}>
      <Card tone={tone}>
        <div className="row">
          <span className="ui-code">{dp.code}</span>
          <span className="mv-name">{dp.name}</span>
          <span style={{ marginLeft: "auto" }}>
            <StatusPill status={d.status} />
          </span>
        </div>

        <div className="chips" style={{ margin: "10px 0 4px" }}>
          <Chip>
            <b>Metric</b> {dp.metric.data_type} · {dp.metric.period}
          </Chip>
          <Chip>
            <b>Cell</b> {dp.cell}
          </Chip>
          {dp.dimensions.map((x) => (
            <Chip key={`${x.dim}|${x.member}`}>
              <b>{x.dim}</b> = {x.member}
            </Chip>
          ))}
        </div>

        {dp.note && <p className="mv-note">{dp.note}</p>}

        {dp.candidates.length > 0 ? (
          dp.candidates.map((c, i) => (
            <CandidateRow key={i} dp={dp} decision={d} cand={c} index={i} />
          ))
        ) : (
          <p className="mv-note">
            The matcher proposed no candidate provisions for this datapoint — mark
            &ldquo;no correct match&rdquo; or extend the regulation corpus.
          </p>
        )}

        <div className="mv-foot">
          <Btn variant="ghost" onClick={() => toggleNone(dp.code)}>
            {d.status === "none" ? "↩ undo “no correct match”" : "Mark “no correct match”"}
          </Btn>
        </div>
      </Card>
    </Reveal>
  );
}

// ------------------------------------------------------------- candidate row

function CandidateRow({
  dp,
  decision,
  cand: c,
  index: i,
}: {
  dp: Datapoint;
  decision: MappingDecision;
  cand: Candidate;
  index: number;
}) {
  const { toggleAccept, toggleReject } = useAppState();
  const chosen = decision.status === "accepted" && decision.chosen === i;
  const rejected = decision.rejected.has(i);

  const copyCitation = () => {
    const page = c.page != null ? ` (p.${c.page})` : "";
    void navigator.clipboard?.writeText(`${c.label}${page} — ${c.doc}`);
    toast("Citation copied");
  };

  return (
    <div className={"mv-cand" + (chosen ? " chosen" : "") + (rejected ? " rejected" : "")}>
      <div className="row">
        <ConfBar confidence={c.confidence} band={c.band} />
        <button
          type="button"
          className="ui-cite mv-cite"
          title="Copy citation"
          onClick={copyCitation}
        >
          {c.label}
          {c.page != null ? ` · p.${c.page}` : ""}
        </button>
        <span className="mv-doc">{c.doc_title}</span>
      </div>

      {c.breadcrumb && <div className="mv-crumb">{c.breadcrumb}</div>}
      <Evi>{c.evidence}</Evi>

      <div className="row" style={{ marginTop: 10 }}>
        <Btn variant="accept" active={chosen} onClick={() => toggleAccept(dp.code, i)}>
          {chosen ? "✓ Confirmed" : "Confirm link"}
        </Btn>
        <Btn variant="reject" active={rejected} onClick={() => toggleReject(dp.code, i)}>
          Reject
        </Btn>
      </div>
    </div>
  );
}
