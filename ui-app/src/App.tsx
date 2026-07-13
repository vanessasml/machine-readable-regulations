import type { ComponentType } from "react";
import { useAppState, usePayload, type Tab } from "./store";
import { EmptyState, Toaster } from "./components/ui";
import HomeView from "./views/HomeView";
import RegulationsView from "./views/RegulationsView";
import DatapointsView from "./views/DatapointsView";
import MappingView from "./views/MappingView";
import RulesView from "./views/RulesView";
import RegisterView from "./views/RegisterView";
import BanksView from "./views/BanksView";
import OverviewView from "./views/OverviewView";
import VerdictsView from "./views/VerdictsView";

interface TabDef {
  key: Tab;
  num: string;
  label: string;
  group: string;
}

const TABS: TabDef[] = [
  { key: "regs", num: "①", label: "Regulations", group: "Inputs" },
  { key: "dps", num: "②", label: "Datapoints", group: "Inputs" },
  { key: "review", num: "③", label: "Mapping", group: "Engine" },
  { key: "rules", num: "④", label: "Rules", group: "Engine" },
  { key: "register", num: "⑤", label: "Register", group: "What it unlocks" },
  { key: "banks", num: "⑥", label: "Bank returns", group: "What it unlocks" },
  { key: "overview", num: "⑦", label: "Overview", group: "What it unlocks" },
  { key: "verdicts", num: "⑧", label: "Verdicts", group: "What it unlocks" },
];

// group captions in workflow order (Inputs → Engine → What it unlocks)
const GROUPS: string[] = TABS.reduce<string[]>((acc, t) => (acc.includes(t.group) ? acc : [...acc, t.group]), []);

const VIEWS: Record<Tab, ComponentType> = {
  regs: RegulationsView,
  dps: DatapointsView,
  review: MappingView,
  rules: RulesView,
  register: RegisterView,
  banks: BanksView,
  overview: OverviewView,
  verdicts: VerdictsView,
};

export default function App() {
  const { payload, loading, error } = usePayload();
  const { page, setPage, tab, setTab } = useAppState();

  const View = VIEWS[tab];

  return (
    <>
      <div className="app-shell">
        <header className="topbar">
          <div className="bar-inner">
            <button type="button" className="brand" onClick={() => setPage("home")} aria-label="Machine-readable regulations — home">
              <span className="brand-mark" aria-hidden="true">&sect;</span>
              <span className="brand-text">
                <h1>Machine-readable regulations</h1>
                <span className="brand-kicker">Supervisory pilot</span>
              </span>
            </button>
            <nav className="pagenav" aria-label="Pages">
              <button
                type="button"
                className={"pbtn" + (page === "home" ? " on" : "")}
                onClick={() => setPage("home")}
                aria-current={page === "home" ? "page" : undefined}
              >
                Home
              </button>
              <button
                type="button"
                className={"pbtn" + (page === "work" ? " on" : "")}
                onClick={() => setPage("work")}
                aria-current={page === "work" ? "page" : undefined}
              >
                Workflow
              </button>
            </nav>
          </div>
        </header>

        {page === "work" && (
          <nav className="subnav" aria-label="Workflow steps">
            <div className="bar-inner">
              {GROUPS.map((grp, gi) => (
                <div className="navseg" key={grp}>
                  {gi > 0 && (
                    <span className="navflow" aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M4 2.5L9 7l-5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  )}
                  <div className="navgroup">
                    <span className="navgroup-cap">{grp}</span>
                    <div className="navgroup-tabs">
                      {TABS.filter((t) => t.group === grp).map((t) => (
                        <button
                          type="button"
                          key={t.key}
                          className={"tab" + (tab === t.key ? " on" : "")}
                          onClick={() => setTab(t.key)}
                          aria-current={tab === t.key ? "step" : undefined}
                        >
                          <span className="tab-num" aria-hidden="true">{t.num}</span>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </nav>
        )}

        <main className="view-stage">
          {loading ? (
            <div className="app-loading">
              <span className="dot" />
              <span>Loading corpus…</span>
            </div>
          ) : error ? (
            <EmptyState title="Could not load the data payload" hint={error} />
          ) : page === "home" ? (
            <div className="view-anim" key="home">
              <HomeView />
            </div>
          ) : (
            <div className="view-anim" key={tab}>
              <View />
            </div>
          )}
        </main>
      </div>

      {payload && page === "work" && (
        <footer className="app-footer">
          Indexed {payload.data.paragraphs_indexed.toLocaleString("en-US")} paragraphs across{" "}
          {payload.data.documents_indexed} regulations · {payload.data.datapoints.length} datapoints ·{" "}
          {payload.rules.rules.length} rules · {payload.banks.length} bank returns · lexical TF-IDF
          matcher, illustrative DPM datapoints. Every link keeps quoted legal text for audit.
        </footer>
      )}

      <Toaster />
    </>
  );
}
