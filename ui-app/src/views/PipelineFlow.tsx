/**
 * PipelineFlow — "Regulation to verdict, in motion".
 *
 * A looping, four-station data-flow the head of division can read at a glance:
 *   1 Regulation  — legal text is scanned; a clause detaches as a rule.
 *   2 Rules       — the machine-readable checks compile into the rack.
 *   3 Bank data   — a bank's reported values flow through a validation gate.
 *   4 Supervisor  — the reconciled result assembles and a human stamps it.
 *
 * All motion is CSS (PipelineFlow.css) on one shared 9s clock — no animation
 * library, no runtime deps, composited and cheap. This component only lays out
 * the fixed 1080x344 design-space scene and scales it to fit the column; the
 * base CSS doubles as the reduced-motion resting frame. Figures in the footer
 * come from the live payload so the illustrative loop stays honest.
 */
import { useEffect, useRef, type CSSProperties } from "react";
import type { Payload } from "../types";
import { Reveal } from "../components/ui";
import "./PipelineFlow.css";

// example checks shown in the rack (standard prudential ratios — readable at a
// glance; the real machine-drafted rules live in workflow tab 4).
const RULES: { name: string; op: string; thr: string; hot?: boolean }[] = [
  { name: "CET1", op: "≥", thr: "8.0" },
  { name: "LCR", op: "≥", thr: "100", hot: true },
  { name: "NSFR", op: "≥", thr: "100" },
  { name: "LEV", op: "≥", thr: "3.0" },
];

// six values in the data river (a bank's reported figures rising into the gate)
const RIVER = ["13.4", "142", "3.1", "0.98", "8.7", "104"];

// the six validation cells; one is a flag (a point of attention)
const CELLS: { warn?: boolean }[] = [{}, {}, { warn: true }, {}, {}, {}];

interface Act {
  tag: string;
  h: string;
  d: string;
  human?: boolean;
}
const ACTS: Act[] = [
  { tag: "Machine", h: "Legal text → rules", d: "The engine reads the statute and drafts checkable rules, each quoting its provision." },
  { tag: "Machine", h: "Rules compile", d: "One comparator, one threshold, one source — locked before they ever run." },
  { tag: "Machine", h: "Data, validated", d: "A bank’s reported values flow through the gate; every check passes or raises a flag." },
  { tag: "Human", h: "A supervisor signs off", d: "The result assembles; the human approves and the decision locks in.", human: true },
];

/** allow CSS custom properties in an inline style object */
type Vars = CSSProperties & Record<`--${string}`, string>;

export default function PipelineFlow({ payload }: { payload: Payload }) {
  const fitRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // scale the fixed 1080px stage to its column width (keeps px geometry exact)
  useEffect(() => {
    const fit = fitRef.current;
    const stage = stageRef.current;
    if (!fit || !stage) return;
    const resize = () => {
      const scale = Math.min(1, fit.clientWidth / 1080);
      stage.style.transform = `scale(${scale})`;
      fit.style.height = `${344 * scale}px`;
    };
    resize();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(resize);
      ro.observe(fit);
    }
    window.addEventListener("resize", resize);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  const nDocs = payload.data.documents_indexed;
  const nRules = payload.rules.rules.length;
  const nBanks = payload.banks.length;
  const nChecks = nRules * nBanks;

  return (
    <Reveal>
      <section className="pl-wrap" aria-label="How one supervisory run flows from regulation to verdict">
        <div className="fd-caption">
          <span className="fd-caption-title">Regulation to verdict, in motion</span>
          <span className="fd-caption-sub">one run through the pipeline — statute to sign-off</span>
        </div>

        <div className="pl-fit" ref={fitRef}>
          <div className="pl-stage" ref={stageRef} aria-hidden="true">
            {/* rails */}
            <div className="pl-rail pl-r1" />
            <div className="pl-rail pl-r2" />
            <div className="pl-rail pl-r3" />

            {/* 1 — regulation */}
            <div className="pl-station pl-s1">
              <div className="pl-label"><span className="pl-n">1</span>Regulation</div>
              <div className="pl-card">
                <div className="pl-glow" />
                <div className="pl-scan" />
                <div className="pl-doc">
                  <div className="pl-ln w1" />
                  <div className="pl-ln w2" />
                  <div className="pl-ln w3 pl-key" />
                  <div className="pl-ln w4" />
                  <div className="pl-ln w5 pl-key" />
                  <div className="pl-ln w2" />
                  <div className="pl-ln w6" />
                </div>
              </div>
            </div>

            {/* 2 — rules */}
            <div className="pl-station pl-s2">
              <div className="pl-label"><span className="pl-n">2</span>Rules</div>
              <div className="pl-card">
                <div className="pl-glow" />
                <div className="pl-rack">
                  {RULES.map((r) => (
                    <div className={"pl-rule" + (r.hot ? " pl-hot" : "")} key={r.name}>
                      <span>{r.name}</span>
                      <span className="pl-op">{r.op}</span>
                      <span>{r.thr}</span>
                      <span className="pl-tick">{"✓"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 3 — bank data */}
            <div className="pl-station pl-s3">
              <div className="pl-label"><span className="pl-n">3</span>Bank data</div>
              <div className="pl-card">
                <div className="pl-glow" />
                <div className="pl-river">
                  {RIVER.map((v, i) => (
                    <div
                      className="pl-drop"
                      key={v}
                      style={{ left: `${14 + (i % 3) * 58}px`, animationDelay: `${-i * 0.4}s` }}
                    >
                      {v}
                    </div>
                  ))}
                </div>
                <div className="pl-gate">
                  <div className="pl-gatehead">validate {"←"} reported</div>
                  <div className="pl-cells">
                    {CELLS.map((c, i) => (
                      <div className={"pl-cell" + (c.warn ? " pl-warn" : "")} key={i}>
                        {c.warn ? "!" : "✓"}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 4 — supervisor */}
            <div className="pl-station pl-s4">
              <div className="pl-label"><span className="pl-n">4</span>Supervisor</div>
              <div className="pl-card">
                <div className="pl-glow" />
                <div className="pl-screen">
                  <div className="pl-vrow"><span className="pl-k">CET1</span><span>13.4%</span><span className="pl-v pl-ok">pass</span></div>
                  <div className="pl-vrow"><span className="pl-k">LCR</span><span>142%</span><span className="pl-v pl-ok">pass</span></div>
                  <div className="pl-vrow"><span className="pl-k">Incident</span><span>1</span><span className="pl-v pl-note">note</span></div>
                </div>
                <div className="pl-seal-ring" />
                <div className="pl-stamp">
                  <svg className="pl-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="11" width="16" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                  Approved
                </div>
              </div>
            </div>

            {/* traveling consignment */}
            <div className="pl-mover pl-m1"><span className="pl-pill pl-clause">clause &sect;4.1</span></div>
            <div className="pl-mover pl-m2"><span className="pl-pill pl-ruletok">LCR {"≥"} 100</span></div>
            <div className="pl-mover pl-m3"><span className="pl-pill pl-result">verdict</span></div>

            {/* progress */}
            <div className="pl-progress"><div className="pl-fill" /></div>
          </div>
        </div>

        {/* act legend (syncs with the loop) */}
        <div className="pl-acts">
          {ACTS.map((a) => (
            <div className={"pl-act" + (a.human ? " pl-human" : "")} key={a.h}>
              <div className="pl-tag">{a.tag}</div>
              <p className="pl-h">{a.h}</p>
              <p className="pl-d">{a.d}</p>
            </div>
          ))}
        </div>

        <p className="pl-foot">
          This run: <b>{nDocs}</b> regulations indexed &middot; <b>{nRules}</b> machine-drafted rules &middot;{" "}
          <b>{nBanks}</b> bank returns &middot; up to <b>{nChecks}</b> checks &mdash; every verdict citing the
          provision it enforces.
        </p>
      </section>
    </Reveal>
  );
}
