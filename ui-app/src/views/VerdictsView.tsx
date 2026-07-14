/** Tab ⑧ — Verdicts: the approved rules applied to each bank return.
 *  The engine (a TS port of rules_engine.py) produces evidence — pass / fail /
 *  no-data rows with the substituted numbers and the legal citation — and the
 *  supervisor takes the decision: Approve return / Not approved. Exact port of
 *  the legacy verdicts tab, including the supervisor_decisions.json export. */
import { applyRule, bankNumeric, type Verdict } from "../engine";
import type { Bank, Rule } from "../types";
import { useAppState, usePayload, type SupDecision } from "../store";
import {
  Btn,
  Card,
  Chip,
  EmptyState,
  Pill,
  Reveal,
  SectionTitle,
  StatusPill,
  Toolbar,
  download,
  fmtNum,
  toast,
} from "../components/ui";
import "./VerdictsView.css";

export default function VerdictsView() {
  const { payload } = usePayload();
  const { activeRules, supDecisions, setSupDecision } = useAppState();
  if (!payload) return null;

  const banks = payload.banks;
  const rules = activeRules();

  /** Exact legacy export schema (supervisor_decisions.json). */
  const exportVerdicts = () => {
    const out = banks.map((bank) => {
      const values = bankNumeric(bank);
      const verdicts = rules.map((r) => ({ rule_id: r.id, ...applyRule(r, values) }));
      return {
        bank: bank.name,
        lei: bank.lei,
        reference_date: bank.date,
        supervisor_decision: supDecisions[bank.lei] ?? "undecided",
        engine: verdicts,
      };
    });
    download(
      "supervisor_decisions.json",
      JSON.stringify(
        { decided_at: new Date().toISOString(), active_rules: rules.map((r) => r.id), banks: out },
        null,
        2,
      ),
      "application/json",
    );
    toast("Exported supervisor_decisions.json");
  };

  const decide = (bank: Bank, d: SupDecision) => {
    setSupDecision(bank.lei, d);
    toast(`${bank.name} → ${d === "approved" ? "approved" : "not approved"}`);
  };

  return (
    <>
      <SectionTitle sub="what the rules unlock">Verdicts — engine evidence, human decision</SectionTitle>
      <p className="lede">
        Every approved rule, applied deterministically to every bank return — same input, same
        verdict, each line citing the provision it enforces. The engine presents evidence;
        the supervisor <span className="hitl" aria-hidden="true">🙂</span> takes the decision.
      </p>

      <Toolbar>
        <span className="muted small" style={{ whiteSpace: "nowrap" }}>
          {rules.length} approved rule{rules.length === 1 ? "" : "s"} × {banks.length} bank return
          {banks.length === 1 ? "" : "s"}
        </span>
        <span className="grow" />
        <Btn variant="primary" onClick={exportVerdicts} disabled={rules.length === 0}>
          Export supervisor decisions
        </Btn>
      </Toolbar>

      {banks.length === 0 ? (
        <EmptyState
          title="No bank returns ingested"
          hint="Drop CSV returns in bank_returns/ and run `python3 build_ui.py` to repack this page."
        />
      ) : rules.length === 0 ? (
        <EmptyState
          title="No approved rules yet"
          hint="Approve rules in tab ④ first — the engine only applies what a human has approved."
        />
      ) : (
        banks.map((bank, i) => (
          <BankCard
            key={bank.lei}
            bank={bank}
            rules={rules}
            index={i}
            decision={supDecisions[bank.lei]}
            onDecide={decide}
          />
        ))
      )}
    </>
  );
}

// ------------------------------------------------------------------ bank card

function BankCard({
  bank,
  rules,
  index,
  decision,
  onDecide,
}: {
  bank: Bank;
  rules: Rule[];
  index: number;
  decision: SupDecision | undefined;
  onDecide: (bank: Bank, d: SupDecision) => void;
}) {
  const values = bankNumeric(bank);
  const verdicts = rules.map((rule) => ({ rule, v: applyRule(rule, values) }));

  const nPass = verdicts.filter((x) => x.v.status === "pass").length;
  const failB = verdicts.filter((x) => x.v.status === "fail" && x.rule.severity === "blocking").length;
  const failW = verdicts.filter((x) => x.v.status === "fail" && x.rule.severity === "warning").length;
  const noData = verdicts.filter((x) => x.v.status === "no_data").length;

  const engineLine = failB
    ? `${failB} blocking failure${failB > 1 ? "s" : ""}`
    : failW
      ? `no blocking failures · ${failW} point${failW > 1 ? "s" : ""} of attention`
      : "all checks pass";

  return (
    <Reveal delay={Math.min(index, 8) * 40}>
      <Card tone={decision === "approved" ? "done" : "default"}>
        <div className="row">
          <h4 style={{ fontSize: 15.5 }}>{bank.name}</h4>
          <Chip>{bank.lei}</Chip>
          <Chip>{bank.date}</Chip>
          <span style={{ marginLeft: "auto" }}>
            <StatusPill status={decision ?? "awaiting"} />
          </span>
        </div>

        <div className="chips vd-summary">
          <Chip>
            <b>{nPass}</b> pass
          </Chip>
          <Chip bad={failB > 0}>
            <b>{failB}</b> blocking fail
          </Chip>
          <Chip>
            <b>{failW}</b> attention
          </Chip>
          <Chip>
            <b>{noData}</b> no data
          </Chip>
        </div>

        {verdicts.map(({ rule, v }) => (
          <VerdictRow key={rule.id} rule={rule} v={v} />
        ))}

        <div className="vd-decision">
          <span className="vd-hint">
            engine: {engineLine} — <b>the decision is yours</b>
          </span>
          <Btn
            variant="accept"
            active={decision === "approved"}
            onClick={() => onDecide(bank, "approved")}
          >
            Approve return
          </Btn>
          <Btn
            variant="reject"
            active={decision === "not_approved"}
            onClick={() => onDecide(bank, "not_approved")}
          >
            Not approved
          </Btn>
        </div>
      </Card>
    </Reveal>
  );
}

// ---------------------------------------------------------------- verdict row

function VerdictRow({ rule, v }: { rule: Rule; v: Verdict }) {
  const cls =
    v.status === "pass" ? "pass" : v.status === "fail" ? `fail-${rule.severity}` : v.status;
  const mark = v.status === "pass" ? "✓" : v.status === "fail" ? "✗" : "·";
  const detail =
    v.status === "pass" || v.status === "fail"
      ? `${fmtNum(v.lhs as number)} ${v.op} ${fmtNum(v.rhs as number)}`
      : v.status === "no_data"
        ? (v.missing ?? []).join("; ")
        : v.detail ?? "invalid expression";

  return (
    <div className={`vrow ${cls}`}>
      <span className="vmark" aria-hidden="true">
        {mark}
      </span>
      <b>{rule.id}</b> {rule.name}
      <Pill variant={rule.severity}>{rule.severity}</Pill>
      <span className="vsub">{detail}</span>
      {rule.source && (
        <span className="vcite">
          {rule.source.doc} {rule.source.label}
        </span>
      )}
    </div>
  );
}
