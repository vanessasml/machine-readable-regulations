/** Tab ④ — Rules: machine-extracted validation rules, pending human approval.
 *  Exact port of the legacy rules tab: filter, rule cards (expression, binding
 *  chips, machine gates that BLOCK approval, source quote, note), Approve /
 *  Reject / Back-to-pending via useAppState().setRuleState, and the
 *  rule_decisions.json export. Only approved rules ever reach the verdicts. */
import { useState } from "react";
import type { Rule, RuleStatus } from "../types";
import { useAppState, usePayload } from "../store";
import {
  Btn,
  Card,
  Chip,
  EmptyState,
  Evi,
  Pill,
  Reveal,
  SectionTitle,
  StatusPill,
  Toolbar,
  download,
  toast,
} from "../components/ui";
import "./RulesView.css";

type Filter = "all" | RuleStatus;

export default function RulesView() {
  const { payload } = usePayload();
  const { ruleStates, setRuleState } = useAppState();
  const [filter, setFilter] = useState<Filter>("all");
  if (!payload) return null;

  const all = payload.rules.rules;
  const meta = payload.rules.meta;
  const nActive = all.filter((r) => ruleStates[r.id] === "active").length;
  const nPending = all.filter((r) => (ruleStates[r.id] ?? "pending") === "pending").length;
  const visible = all.filter((r) => filter === "all" || (ruleStates[r.id] ?? "pending") === filter);

  /** Exact legacy export schema (rule_decisions.json). */
  const exportRules = () => {
    const out = all.map((r) => ({
      id: r.id,
      name: r.name,
      expr: r.expr,
      bindings: r.bindings,
      decision: ruleStates[r.id] ?? "pending",
      source: r.source,
    }));
    download(
      "rule_decisions.json",
      JSON.stringify({ reviewed_at: new Date().toISOString(), rules: out }, null, 2),
      "application/json",
    );
    toast("Exported rule_decisions.json");
  };

  if (all.length === 0) {
    return (
      <>
        <SectionTitle sub="the executable side">Rules</SectionTitle>
        <EmptyState
          title="No rules yet"
          hint="Run `python3 extract_rules.py` in the repo root (add --live once regulation JSONs and Anthropic credentials are available), then `python3 build_ui.py` to repack this page."
        />
      </>
    );
  }

  const setRule = (id: string, st: RuleStatus) => {
    setRuleState(id, st);
    toast(`${id} → ${st === "active" ? "approved" : st}`);
  };

  return (
    <>
      <SectionTitle sub="the executable side">Rules — extracted, then approved</SectionTitle>
      <p className="lede">
        Validation rules drafted from the legal text, each one traceable to the provision it encodes.
        A rule does nothing until a supervisor approves it here — the verdicts engine (tab ⑧) only
        applies approved rules.
      </p>

      <Toolbar>
        <label>
          Show
          <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            <option value="all">all rules ({all.length})</option>
            <option value="pending">pending ({nPending})</option>
            <option value="active">approved ({nActive})</option>
            <option value="rejected">rejected ({all.length - nActive - nPending})</option>
          </select>
        </label>
        <span className="rv-count">
          {all.length} rules · {nActive} approved · {nPending} pending
        </span>
        <span className="grow" />
        <Btn variant="primary" onClick={exportRules}>
          Export rule decisions
        </Btn>
      </Toolbar>

      {meta.note && <p className="rv-meta">{meta.note}</p>}

      {visible.length === 0 ? (
        <EmptyState
          title="No rules in this state"
          hint="Switch the filter to “all rules” to see the full extraction."
        />
      ) : (
        visible.map((r, i) => (
          <RuleCard key={r.id} rule={r} index={i} state={ruleStates[r.id] ?? "pending"} onSet={setRule} />
        ))
      )}
    </>
  );
}

// ------------------------------------------------------------------ rule card

const STATE_LABEL: Record<RuleStatus, string> = {
  pending: "Pending review",
  active: "Approved",
  rejected: "Rejected",
};

function RuleCard({
  rule: r,
  index,
  state,
  onSet,
}: {
  rule: Rule;
  index: number;
  state: RuleStatus;
  onSet: (id: string, st: RuleStatus) => void;
}) {
  const { payload } = usePayload();
  const dpName = (code: string): string =>
    payload?.data.datapoints.find((dp) => dp.code === code)?.name ?? "";

  const gates = [
    ...(r.unbound ?? []).map((v) => ({ key: `ub|${v}`, text: `${v} unbound` })),
    ...(r.unknown_datapoints ?? []).map((u) => ({ key: `uk|${u}`, text: `unknown: ${u}` })),
  ];
  const blocked = gates.length > 0;
  const tone = state === "active" ? "done" : state === "rejected" ? "skip" : "default";

  return (
    <Reveal delay={Math.min(index, 8) * 40}>
      <Card tone={tone}>
        <div className="rv-head">
          <span className="ui-code">{r.id}</span>
          <span className="rv-name">{r.name}</span>
          <Pill variant={r.severity}>{r.severity}</Pill>
          {(r.origin || r.confidence != null) && (
            <span className="muted small" style={{ whiteSpace: "nowrap" }}>
              {r.origin ?? ""}
              {r.origin ? " · " : ""}conf {Math.round((r.confidence || 0) * 100)}%
            </span>
          )}
          <span className="rv-status">
            <StatusPill status={state} label={STATE_LABEL[state]} />
          </span>
        </div>

        <div className="rule-expr">{r.expr}</div>

        <div className="chips rv-binds">
          {Object.entries(r.bindings ?? {}).map(([v, dp]) => {
            const name = dpName(dp);
            return (
              <Chip key={v}>
                <b>{v}</b> → {dp}
                {name ? ` · ${name}` : ""}
              </Chip>
            );
          })}
          {gates.map((g) => (
            <Chip key={g.key} bad title="machine gate — approval blocked until resolved">
              {g.text}
            </Chip>
          ))}
        </div>

        {r.source && (
          <div className="rv-src">
            <div className="rv-src-top">
              <span className="rv-src-doc">{r.source.doc_title || r.source.doc}</span>
              <span className="muted small">
                {r.source.label}
                {r.source.page != null ? ` · p.${r.source.page}` : ""}
              </span>
            </div>
            {r.source.via && <p className="rv-src-via">{r.source.via}</p>}
            {r.source.quote && (
              <div className="rv-quote">
                <Evi>{r.source.quote}</Evi>
              </div>
            )}
          </div>
        )}

        {r.note && <p className="rv-note">{r.note}</p>}

        <div className="rv-actions">
          <Btn
            variant="accept"
            active={state === "active"}
            disabled={blocked}
            title={blocked ? "resolve bindings first" : undefined}
            onClick={() => onSet(r.id, "active")}
          >
            {state === "active" ? "✓ Approved" : "Approve"}
          </Btn>
          <Btn variant="reject" active={state === "rejected"} onClick={() => onSet(r.id, "rejected")}>
            Reject
          </Btn>
          {state !== "pending" && (
            <Btn variant="ghost" onClick={() => onSet(r.id, "pending")}>
              Back to pending
            </Btn>
          )}
        </div>
      </Card>
    </Reveal>
  );
}
