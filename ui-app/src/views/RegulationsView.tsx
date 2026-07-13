/** Tab ① — Regulations: browse the ingested corpus. A regulation selector plus
 *  full-text paragraph search over payload.regs. The corpus MAY BE EMPTY in a
 *  build (data/regulations is git-ignored) — show a helpful empty state that
 *  points at ingest.py instead of a broken page. */
import { useMemo, useState } from "react";
import { usePayload } from "../store";
import { EmptyState, Reveal, SectionTitle, Toolbar } from "../components/ui";
import "./RegulationsView.css";

/** Cap rendered paragraphs so a 6,000-leaf regulation stays snappy. */
const MAX_LEAVES = 500;

export default function RegulationsView() {
  const { payload } = usePayload();
  const [regIdx, setRegIdx] = useState(0);
  const [query, setQuery] = useState("");

  const regs = payload?.regs ?? [];
  const reg = regs.length > 0 ? regs[Math.min(regIdx, regs.length - 1)] : null;

  const items = useMemo(() => {
    if (!reg) return [];
    const q = query.trim().toLowerCase();
    if (!q) return reg.leaves;
    return reg.leaves.filter((l) =>
      `${l.text} ${l.label} ${l.crumb}`.toLowerCase().includes(q),
    );
  }, [reg, query]);

  if (!payload) return null;

  if (!reg) {
    return (
      <>
        <SectionTitle sub="input A — the law">Regulations</SectionTitle>
        <p className="lede">
          The ingested corpus: every regulation parsed into addressable, citable paragraphs. This is
          the raw material the mapping engine searches.
        </p>
        <EmptyState
          title="No regulation corpus in this build"
          hint="The parsed regulation JSONs (data/regulations/) are not checked in — they are produced locally from the source PDFs. Run `python3 ingest.py` in the repo root, then `python3 build_ui.py` to repack this page with the full corpus. The matcher's proposals in tab ③ still carry the quoted legal text for audit."
        />
      </>
    );
  }

  return (
    <>
      <SectionTitle sub="input A — the law">Regulations</SectionTitle>
      <p className="lede">
        The ingested corpus: every regulation parsed into addressable, citable paragraphs — the raw
        material the mapping engine searches. Pick a document and search its provisions.
      </p>

      <Toolbar>
        <label>
          Regulation
          <select
            value={Math.min(regIdx, regs.length - 1)}
            onChange={(e) => setRegIdx(Number(e.target.value))}
          >
            {regs.map((r, i) => (
              <option key={r.stem} value={i}>
                {r.title}
              </option>
            ))}
          </select>
        </label>
        <input
          type="search"
          placeholder="Search provisions…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search provisions"
        />
        <span className="muted small" style={{ whiteSpace: "nowrap" }}>
          {items.length.toLocaleString("en-US")} of {reg.leaves.length.toLocaleString("en-US")} shown
        </span>
      </Toolbar>

      <p className="muted small rg-meta">
        {reg.filename} · {reg.paragraphs.toLocaleString("en-US")} paragraphs ·{" "}
        {reg.pages ?? "?"} pages
      </p>

      {items.length === 0 ? (
        <EmptyState
          title="No provisions match"
          hint="No paragraph in this regulation matches the search — try fewer or different words."
        />
      ) : (
        <>
          {items.slice(0, MAX_LEAVES).map((l, i) => (
            <Reveal key={`${reg.stem}|${l.label}|${i}`} delay={Math.min(i, 8) * 30}>
              <div className="rg-leaf">
                <div className="rg-leaf-top">
                  <span className="ui-cite">{l.label}</span>
                  {l.page != null && <span className="rg-page">p.{l.page}</span>}
                  {l.kind && <span className="rg-kind">{l.kind}</span>}
                </div>
                {l.crumb && <div className="rg-crumb">{l.crumb}</div>}
                <p className="rg-text">{l.text}</p>
              </div>
            </Reveal>
          ))}
          {items.length > MAX_LEAVES && (
            <p className="muted small">
              Showing the first {MAX_LEAVES.toLocaleString("en-US")} provisions — refine the search
              to see the rest.
            </p>
          )}
        </>
      )}
    </>
  );
}
