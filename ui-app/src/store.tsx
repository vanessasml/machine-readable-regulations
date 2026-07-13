/** App-wide state: payload loading + navigation + human-in-the-loop decisions.
 *  Wrap the app in <StoreProvider>; read with usePayload() / useAppState().
 *  Semantics mirror the legacy ui/template.html exactly (see comments). */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getPayload } from "./data";
import type { Candidate, Datapoint, Payload, Rule, RuleStatus } from "./types";

// ---------------------------------------------------------------- state shapes

export type Page = "home" | "work";

export type Tab =
  | "regs"      // ① Regulations
  | "dps"       // ② Datapoints
  | "review"    // ③ Regulation → Datapoint mapping
  | "rules"     // ④ Rules
  | "register"  // ⑤ Supervisor register
  | "banks"     // ⑥ Bank returns
  | "overview"  // ⑦ Banks overview
  | "verdicts"; // ⑧ Verdicts

export type DecisionStatus = "undecided" | "accepted" | "none";

/** Per-datapoint mapping review decision (legacy `decisions[code]`). */
export interface MappingDecision {
  status: DecisionStatus;
  chosen: number;          // candidate index when accepted, else -1
  rejected: Set<number>;   // rejected candidate indices
}

/** The link the register/banks/overview tabs display for a datapoint:
 *  accepted -> the chosen candidate; none -> null; otherwise the top proposal. */
export interface EffectiveLink {
  status: "accepted" | "proposed" | "none";
  cand: Candidate | null;
}

export type SupDecision = "approved" | "not_approved";

export const DEFAULT_DECISION: MappingDecision = {
  status: "undecided",
  chosen: -1,
  rejected: new Set<number>(),
};

// ------------------------------------------------------------------- contexts

export interface PayloadState {
  payload: Payload | null; // null while loading or on error
  loading: boolean;
  error: string | null;
}

export interface AppState {
  // navigation
  page: Page;
  setPage: (p: Page) => void;
  tab: Tab;
  setTab: (t: Tab) => void;

  // ③ mapping review decisions, keyed by Datapoint.code
  decisions: Record<string, MappingDecision>;
  /** Read a decision; returns DEFAULT_DECISION when unset (never mutates). */
  getDecision: (code: string) => MappingDecision;
  /** Replace a decision wholesale. */
  setDecision: (code: string, d: MappingDecision) => void;
  /** Legacy accept-toggle: clicking the chosen candidate un-decides; otherwise
   *  accepts it (and clears any rejection on it). */
  toggleAccept: (code: string, index: number) => void;
  /** Legacy reject-toggle: un-rejects if rejected; otherwise rejects (and if it
   *  was the chosen one, the datapoint reverts to undecided). */
  toggleReject: (code: string, index: number) => void;
  /** Legacy "no correct match" toggle: none <-> undecided (clears chosen). */
  toggleNone: (code: string) => void;
  /** Effective link for register/banks/overview (legacy `effective(dp)`). */
  effective: (dp: Datapoint) => EffectiveLink;

  // ④ rule approvals, keyed by Rule.id — initialized from rules[].status
  ruleStates: Record<string, RuleStatus>;
  setRuleState: (id: string, st: RuleStatus) => void;
  /** Rules whose live state is 'active' (the only ones verdicts may apply). */
  activeRules: () => Rule[];

  // ⑧ supervisor decisions, keyed by Bank.lei (absent = awaiting supervisor)
  supDecisions: Record<string, SupDecision>;
  setSupDecision: (lei: string, d: SupDecision) => void;
}

const PayloadCtx = createContext<PayloadState | null>(null);
const AppCtx = createContext<AppState | null>(null);

// ------------------------------------------------------------------- provider

export function StoreProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState<Page>("home");
  const [tab, setTab] = useState<Tab>("regs");
  const [decisions, setDecisions] = useState<Record<string, MappingDecision>>({});
  const [ruleStates, setRuleStates] = useState<Record<string, RuleStatus>>({});
  const [supDecisions, setSupDecisions] = useState<Record<string, SupDecision>>({});

  useEffect(() => {
    let alive = true;
    getPayload()
      .then((p) => {
        if (!alive) return;
        setPayload(p);
        // legacy: ruleState[r.id] = r.status || 'pending'
        const init: Record<string, RuleStatus> = {};
        for (const r of p.rules.rules) init[r.id] = r.status || "pending";
        setRuleStates(init);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const getDecision = useCallback(
    (code: string): MappingDecision => decisions[code] ?? DEFAULT_DECISION,
    [decisions],
  );

  const setDecision = useCallback((code: string, d: MappingDecision) => {
    setDecisions((prev) => ({ ...prev, [code]: d }));
  }, []);

  const toggleAccept = useCallback((code: string, index: number) => {
    setDecisions((prev) => {
      const d = prev[code] ?? DEFAULT_DECISION;
      const chosen = d.status === "accepted" && d.chosen === index;
      if (chosen) {
        return { ...prev, [code]: { status: "undecided", chosen: -1, rejected: new Set(d.rejected) } };
      }
      const rejected = new Set(d.rejected);
      rejected.delete(index);
      return { ...prev, [code]: { status: "accepted", chosen: index, rejected } };
    });
  }, []);

  const toggleReject = useCallback((code: string, index: number) => {
    setDecisions((prev) => {
      const d = prev[code] ?? DEFAULT_DECISION;
      const rejected = new Set(d.rejected);
      let { status, chosen } = d;
      if (rejected.has(index)) {
        rejected.delete(index);
      } else {
        rejected.add(index);
        if (chosen === index) {
          chosen = -1;
          status = "undecided";
        }
      }
      return { ...prev, [code]: { status, chosen, rejected } };
    });
  }, []);

  const toggleNone = useCallback((code: string) => {
    setDecisions((prev) => {
      const d = prev[code] ?? DEFAULT_DECISION;
      return {
        ...prev,
        [code]: {
          status: d.status === "none" ? "undecided" : "none",
          chosen: -1,
          rejected: new Set(d.rejected),
        },
      };
    });
  }, []);

  const effective = useCallback(
    (dp: Datapoint): EffectiveLink => {
      const d = decisions[dp.code] ?? DEFAULT_DECISION;
      if (d.status === "none") return { status: "none", cand: null };
      if (d.status === "accepted" && d.chosen >= 0) {
        return { status: "accepted", cand: dp.candidates[d.chosen] ?? null };
      }
      return { status: "proposed", cand: dp.candidates[0] ?? null };
    },
    [decisions],
  );

  const setRuleState = useCallback((id: string, st: RuleStatus) => {
    setRuleStates((prev) => ({ ...prev, [id]: st }));
  }, []);

  const activeRules = useCallback(
    (): Rule[] => (payload ? payload.rules.rules.filter((r) => ruleStates[r.id] === "active") : []),
    [payload, ruleStates],
  );

  const setSupDecision = useCallback((lei: string, d: SupDecision) => {
    setSupDecisions((prev) => ({ ...prev, [lei]: d }));
  }, []);

  const payloadState = useMemo<PayloadState>(
    () => ({ payload, loading, error }),
    [payload, loading, error],
  );

  const appState = useMemo<AppState>(
    () => ({
      page, setPage,
      tab, setTab,
      decisions, getDecision, setDecision, toggleAccept, toggleReject, toggleNone, effective,
      ruleStates, setRuleState, activeRules,
      supDecisions, setSupDecision,
    }),
    [
      page, tab, decisions, getDecision, setDecision, toggleAccept, toggleReject, toggleNone,
      effective, ruleStates, setRuleState, activeRules, supDecisions, setSupDecision,
    ],
  );

  return (
    <PayloadCtx.Provider value={payloadState}>
      <AppCtx.Provider value={appState}>{children}</AppCtx.Provider>
    </PayloadCtx.Provider>
  );
}

// ---------------------------------------------------------------------- hooks

/** Loaded payload + loading/error state. Views render only when payload != null. */
export function usePayload(): PayloadState {
  const ctx = useContext(PayloadCtx);
  if (!ctx) throw new Error("usePayload must be used inside <StoreProvider>");
  return ctx;
}

/** Navigation + all human-in-the-loop decision state. */
export function useAppState(): AppState {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useAppState must be used inside <StoreProvider>");
  return ctx;
}
