/** Home — the boss-visible landing page.
 *  Hero (problem statement + CTA), the team's whiteboard as an animated flow
 *  diagram (post-it nodes, draw-in SVG connectors, 🙂 human-in-the-loop
 *  markers), a two-card principles strip, and a KPI stats band fed from the
 *  live payload. Connector geometry is measured from the DOM at runtime, so
 *  the same topology re-flows from the 3-column desktop grid to the stacked
 *  mobile grid without special cases. */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Btn, Card, KPI, KPIRow, Reveal, SectionTitle } from "../components/ui";
import { useAppState, usePayload, type Tab } from "../store";
import type { Payload } from "../types";
import PipelineFlow from "./PipelineFlow";
import "./HomeView.css";

// ------------------------------------------------------------------ helpers

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Once-only IntersectionObserver: true when the element scrolls into view. */
function useInView<T extends HTMLElement>(threshold = 0.15) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      setInView(true);
      return;
    }
    // Above-the-fold content mounted inside a crossfading container: the
    // observer records isIntersecting=false at mount and never re-fires (it
    // tracks geometry, not the opacity fade). Reveal on the next frame if the
    // element is already in/near the viewport; observe only if genuinely below.
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    let raf = 0;
    let io: IntersectionObserver | null = null;
    if (rect.top < vh * 0.95) {
      raf = requestAnimationFrame(() => setInView(true));
    } else {
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              setInView(true);
              io?.disconnect();
            }
          }
        },
        { threshold },
      );
      io.observe(el);
    }
    // Hard guarantee against a permanently-hidden diagram.
    const fallback = window.setTimeout(() => setInView(true), 600);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      io?.disconnect();
      clearTimeout(fallback);
    };
  }, [threshold]);
  return { ref, inView };
}

// -------------------------------------------------------- diagram geometry

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ConnSpec {
  from: string;
  to: string;
  hitl?: boolean;
  label?: string;
  labelWidth?: number; // px, tuned per label so it never overlaps a node
}

interface PathGeo {
  d: string;
  arrow: string; // polygon points for the arrowhead
  start: { x: number; y: number };
  mid: { x: number; y: number }; // where the 🙂 / label sits
}

/** The whiteboard topology. Order = draw-in stagger order. */
const CONNECTORS: ConnSpec[] = [
  { from: "regs", to: "rules", hitl: true, label: "machine drafts, human reviews", labelWidth: 96 },
  { from: "rules", to: "map" },
  { from: "tpl", to: "map" },
  { from: "tpl", to: "subs", label: "bank fills out", labelWidth: 110 },
  { from: "map", to: "apply" },
  { from: "subs", to: "apply" },
  {
    from: "apply",
    to: "verdict",
    hitl: true,
    label: "the supervisor reviews the mapping and every verdict",
    labelWidth: 250,
  },
];

const MEASURE_KEYS = ["regs", "rules", "tpl", "subs", "map", "apply", "verdict"];

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Build a connector between two measured rects. Same-row pairs get a straight
 *  horizontal arrow; everything else a vertical-tangent bezier whose anchor
 *  points lean toward each other, so converging arrows separate naturally. */
function buildPath(a: Rect, b: Rect): PathGeo {
  const acy = a.y + a.h / 2;
  const bcx = b.x + b.w / 2;
  const bcy = b.y + b.h / 2;
  const sameRow = Math.abs(acy - bcy) < Math.max(a.h, b.h) / 2 && b.x >= a.x + a.w;

  if (sameRow) {
    const y = (acy + bcy) / 2;
    const sx = a.x + a.w + 2;
    const tip = b.x - 2;
    const base = tip - 9;
    return {
      d: `M ${sx} ${y} L ${base} ${y}`,
      arrow: `${base},${y - 4.5} ${base},${y + 4.5} ${tip},${y}`,
      start: { x: sx, y },
      mid: { x: (sx + tip) / 2, y },
    };
  }

  const sxf = clamp((bcx - a.x) / a.w, 0.18, 0.82);
  const sx = a.x + a.w * sxf;
  const sy = a.y + a.h + 2;
  const exf = clamp((sx - b.x) / b.w, 0.18, 0.82);
  const ex = b.x + b.w * exf;
  const tipY = b.y - 2;
  const base = tipY - 9;
  const k = Math.max(22, (base - sy) * 0.45);
  return {
    d: `M ${sx} ${sy} C ${sx} ${sy + k}, ${ex} ${base - k}, ${ex} ${base}`,
    arrow: `${ex - 4.5},${base} ${ex + 4.5},${base} ${ex},${tipY}`,
    start: { x: sx, y: sy },
    mid: { x: (sx + ex) / 2, y: (sy + base) / 2 },
  };
}

/** SVG path that draws itself in via stroke-dashoffset once `drawn` is true. */
function DrawnPath({ d, delay, drawn }: { d: string; delay: number; drawn: boolean }) {
  const ref = useRef<SVGPathElement>(null);
  const [len, setLen] = useState(0);
  useLayoutEffect(() => {
    if (ref.current) setLen(ref.current.getTotalLength());
  }, [d]);
  return (
    <path
      ref={ref}
      d={d}
      className="fd-line"
      style={{
        strokeDasharray: len || 1,
        strokeDashoffset: drawn && len ? 0 : len || 1,
        opacity: len ? 1 : 0,
        transitionDelay: `${delay}ms`,
      }}
    />
  );
}

// ---------------------------------------------------------------- the view

export default function HomeView() {
  const { payload } = usePayload();
  const { setPage, setTab } = useAppState();
  const goto = useCallback(
    (t: Tab) => {
      setTab(t);
      setPage("work");
    },
    [setPage, setTab],
  );
  if (!payload) return null;
  return (
    <div className="home-root">
      <Hero goto={goto} onExplore={() => setPage("work")} />
      <PipelineFlow payload={payload} />
      <StatsBand payload={payload} />
      <Principles />
      <FlowDiagram payload={payload} goto={goto} />
    </div>
  );
}

// --------------------------------------------------------------------- hero

function Hero({ goto, onExplore }: { goto: (t: Tab) => void; onExplore: () => void }) {
  return (
    <section className="home-hero">
      <Reveal>
        <div className="home-overline">Supervisory pilot · Traceable by design</div>
      </Reveal>
      <Reveal delay={70}>
        <h3 className="home-headline">
          <span className="hl-a">Machines draft the checks.</span>{" "}
          <span className="hl-b">Supervisors sign the verdict.</span>
        </h3>
      </Reveal>
      <Reveal delay={140}>
        <p className="home-prob">
          Today the same provision is <b>hand-encoded three times</b> — and redone at every
          amendment:
        </p>
      </Reveal>
      <Reveal delay={190}>
        <div className="home-triple" role="list">
          <span className="tf" role="listitem"><b>Authorities</b><i>→</i>rules</span>
          <span className="tf" role="listitem"><b>Each bank</b><i>→</i>templates</span>
          <span className="tf" role="listitem"><b>Supervisors</b><i>→</i>verdicts</span>
        </div>
      </Reveal>
      <Reveal delay={260}>
        <div className="home-cta">
          <Btn variant="primary" onClick={() => goto("verdicts")}>
            Trace a verdict to its law →
          </Btn>
          <Btn variant="ghost" onClick={onExplore}>
            Walk the workflow →
          </Btn>
        </div>
      </Reveal>
    </section>
  );
}

// ------------------------------------------------------------- flow diagram

interface NodeDef {
  key: string;
  tilt: "tilt-l" | "tilt-r";
  who: string;
  title: string;
  what: string;
  ruleEx?: string;
  stat?: string;
  tags: { num: string; label: string; tab: Tab }[];
}

function FlowDiagram({ payload, goto }: { payload: Payload; goto: (t: Tab) => void }) {
  const dps = payload.data.datapoints;
  const nFrameworks = new Set(dps.map((d) => d.framework || "Other")).size;
  const nCandidates = dps.reduce((s, d) => s + d.candidates.length, 0);
  const nRules = payload.rules.rules.length;
  const nBanks = payload.banks.length;
  const rawEx = payload.rules.rules[0]?.expr ?? "sot_decline_vs_tier1 <= 15";
  const ruleEx = rawEx.length > 30 ? rawEx.slice(0, 29) + "…" : rawEx;

  const nodes: NodeDef[] = [
    {
      key: "regs",
      tilt: "tilt-l",
      who: "Lawyers · legislators",
      title: "Regulations",
      what: "Natural-language legal text — the source of every requirement.",
      stat: `${payload.data.documents_indexed} documents · ${payload.data.paragraphs_indexed.toLocaleString("en-US")} paragraphs`,
      tags: [{ num: "①", label: "Regulations", tab: "regs" }],
    },
    {
      key: "rules",
      tilt: "tilt-r",
      who: "Machine-drafted",
      title: "Rules",
      what: "Each obligation restated as a checkable formula, quoting the provision it comes from.",
      ruleEx,
      stat: `${nRules} rules drafted`,
      tags: [{ num: "④", label: "Rules", tab: "rules" }],
    },
    {
      key: "tpl",
      tilt: "tilt-l",
      who: "Accountants",
      title: "Datapoint templates",
      what: "One per reporting framework — IRRBB, FINREP, outsourcing, …",
      stat: `${dps.length} datapoints · ${nFrameworks} frameworks`,
      tags: [{ num: "②", label: "Datapoints", tab: "dps" }],
    },
    {
      key: "map",
      tilt: "tilt-r",
      who: "Engine + reviewer",
      title: "Map",
      what: "Every rule variable bound to the datapoint that carries it, every datapoint to the provision defining it.",
      stat: `${nCandidates} candidate links proposed`,
      tags: [{ num: "③", label: "Mapping", tab: "review" }],
    },
    {
      key: "subs",
      tilt: "tilt-l",
      who: "Banks",
      title: "Submission files",
      what: "Values per datapoint — entity, reference date, figures.",
      stat: `${nBanks} bank returns received`,
      tags: [
        { num: "⑥", label: "Bank returns", tab: "banks" },
        { num: "⑦", label: "Overview", tab: "overview" },
      ],
    },
    {
      key: "apply",
      tilt: "tilt-r",
      who: "Engine",
      title: "Apply rules on detected datapoints",
      what: "Substitute each variable with the bank's reported value; every verdict cites the provision it enforces.",
      stat: `up to ${nRules * nBanks} checks per run`,
      tags: [{ num: "⑧", label: "Verdicts", tab: "verdicts" }],
    },
  ];

  const reduced = prefersReducedMotion();
  const d = (ms: number) => (reduced ? 0 : ms);

  const { ref: wrapRef, inView } = useInView<HTMLElement>(0.12);
  const fdRef = useRef<HTMLDivElement | null>(null);
  const nodeEls = useRef<Record<string, HTMLDivElement | null>>({});
  const [geo, setGeo] = useState<{ w: number; h: number; paths: (PathGeo | null)[] } | null>(null);

  const measure = useCallback(() => {
    const host = fdRef.current;
    if (!host) return;
    const rects: Record<string, Rect> = {};
    for (const key of MEASURE_KEYS) {
      const el = nodeEls.current[key];
      if (!el) return; // not everything mounted yet
      rects[key] = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
    }
    const paths = CONNECTORS.map((c) => {
      const a = rects[c.from];
      const b = rects[c.to];
      return a && b ? buildPath(a, b) : null;
    });
    setGeo({ w: host.clientWidth, h: host.clientHeight, paths });
  }, []);

  useLayoutEffect(() => {
    measure();
    const host = fdRef.current;
    window.addEventListener("resize", measure);
    let ro: ResizeObserver | null = null;
    if (host && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => measure());
      ro.observe(host);
    }
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [measure]);

  return (
    <Reveal>
      <section ref={wrapRef} className="fd-wrap" aria-label="How the pilot fits together">
        <div className="fd-caption">
          <span className="fd-caption-title">Who owns each step</span>
          <span className="fd-caption-sub">
            the actors behind each hand-off — open any card to jump into that step of the workflow
          </span>
        </div>

        <div ref={fdRef} className={"fd" + (inView ? " in" : "")}>
          {/* connector layer */}
          <svg className="fd-svg" width={geo?.w ?? 0} height={geo?.h ?? 0} aria-hidden="true">
            {geo?.paths.map((p, i) =>
              p ? (
                <g key={`${CONNECTORS[i].from}-${CONNECTORS[i].to}`}>
                  <DrawnPath d={p.d} delay={d(340 + i * 110)} drawn={inView} />
                  <circle
                    className={"fd-dot" + (inView ? " in" : "")}
                    cx={p.start.x}
                    cy={p.start.y}
                    r={2.6}
                    style={{ transitionDelay: `${d(340 + i * 110)}ms` }}
                  />
                  <polygon
                    className={"fd-head" + (inView ? " in" : "")}
                    points={p.arrow}
                    style={{ transitionDelay: `${d(340 + i * 110 + 520)}ms` }}
                  />
                </g>
              ) : null,
            )}
          </svg>

          {/* post-it nodes */}
          {nodes.map((n, i) => (
            <div
              key={n.key}
              ref={(el) => {
                nodeEls.current[n.key] = el;
              }}
              className={`fd-note fd-n-${n.key} ${n.tilt}`}
              style={{ animationDelay: `${d(i * 80)}ms` }}
            >
              <span className="who">{n.who}</span>
              <span className="ttl">{n.title}</span>
              <span className="what">{n.what}</span>
              {n.ruleEx && <code className="rule-ex-chip">{n.ruleEx}</code>}
              {n.stat && <span className="fd-stat">{n.stat}</span>}
              <span className="fd-tags">
                {n.tags.map((t) => (
                  <button
                    key={t.tab}
                    type="button"
                    className="fd-tag"
                    title={`Open ${t.num} ${t.label} in the workflow`}
                    onClick={() => goto(t.tab)}
                  >
                    {t.num} {t.label}
                  </button>
                ))}
              </span>
            </div>
          ))}

          {/* final verdict pills */}
          <div
            ref={(el) => {
              nodeEls.current.verdict = el;
            }}
            className="fd-verdict"
            style={{ animationDelay: `${d(6 * 80)}ms` }}
          >
            <span className="v ok">Approved</span>
            <span className="v ko">Not approved</span>
          </div>

          {/* legend */}
          <div className="fd-legend" style={{ animationDelay: `${d(7 * 80)}ms` }}>
            <div className="fd-legend-item">
              <span className="hitl" aria-hidden="true">🙂</span>
              <span>human in the loop — a person decides</span>
            </div>
            <div className="fd-legend-item">
              <svg className="fd-legend-arrow" width="26" height="10" viewBox="0 0 26 10" aria-hidden="true">
                <line x1="1" y1="5" x2="17" y2="5" />
                <polygon points="17,1 25,5 17,9" />
              </svg>
              <span>data flows automatically</span>
            </div>
            <div className="fd-legend-item">
              <span className="fd-legend-tagsample">① … ⑧</span>
              <span>opens that step of the workflow</span>
            </div>
          </div>

          {/* 🙂 markers + hand-off labels, pinned to connector midpoints */}
          {geo?.paths.map((p, i) => {
            const c = CONNECTORS[i];
            if (!p || (!c.hitl && !c.label)) return null;
            return (
              <div
                key={`mark-${c.from}-${c.to}`}
                className={"fd-mark" + (c.hitl ? "" : " center") + (inView ? " in" : "")}
                style={{
                  left: p.mid.x,
                  top: p.mid.y,
                  transitionDelay: `${d(340 + i * 110 + 340)}ms`,
                }}
              >
                {c.hitl && (
                  <span className="hitl" title="human in the loop">🙂</span>
                )}
                {c.label && (
                  <span className="fd-lbl" style={{ maxWidth: c.labelWidth }}>
                    {c.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </Reveal>
  );
}

// --------------------------------------------------------------- principles

function Principles() {
  return (
    <div className="home-principles">
      <Reveal>
        <Card className="home-principle">
          <span className="glyph" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15.5 4.5l2.5 2.5L7.5 17.5 4 18l.5-3.5z" />
              <path d="M13.5 6.5l2.5 2.5" />
            </svg>
          </span>
          <div>
            <h4>Probabilistic components only draft or triage</h4>
            <p>
              The matcher ranks candidate provisions and the extractor drafts rules — with
              confidence bands and the quoted legal text attached. Their output is a
              proposal, never a decision.
            </p>
          </div>
        </Card>
      </Reveal>
      <Reveal delay={90}>
        <Card className="home-principle">
          <span className="glyph" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="M7.5 11.5l2.5 2.5 4.5-5" />
            </svg>
          </span>
          <div>
            <h4>The final decision is the supervisor&rsquo;s</h4>
            <p>
              Mappings are confirmed by a reviewer, rules are approved before they ever run,
              and every verdict waits for sign-off. Each step keeps its quote for audit.
            </p>
          </div>
        </Card>
      </Reveal>
    </div>
  );
}

// -------------------------------------------------------------------- stats

function StatsBand({ payload }: { payload: Payload }) {
  // Mount the KPI targets only once scrolled into view, so the count-up
  // animation plays when the band is actually visible.
  const { ref, inView } = useInView<HTMLElement>(0.3);
  const v = (n: number) => (inView ? n : 0);
  return (
    <section ref={ref} className="home-stats">
      <SectionTitle sub="live from the pipeline artifacts">What is in this demo</SectionTitle>
      <KPIRow>
        <KPI label="regulation documents indexed" value={v(payload.data.documents_indexed)} />
        <KPI label="paragraphs indexed" value={v(payload.data.paragraphs_indexed)} delay={120} />
        <KPI label="datapoints tracked" value={v(payload.data.datapoints.length)} delay={240} />
        <KPI label="rules machine-drafted" value={v(payload.rules.rules.length)} delay={360} />
      </KPIRow>
    </section>
  );
}
