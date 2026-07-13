/** Shared UI primitives — ALL views must build from these (plus the class
 *  conventions in design.css). Keep views free of ad-hoc colors: use tokens. */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { Band, Severity } from "../types";

// ------------------------------------------------------------------ helpers

/** Trigger a client-side file download (used by the export buttons). */
export function download(name: string, content: string, type: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Format a raw bank-return cell for display (legacy fmtVal). */
export function fmtVal(value: string, unit: string): string {
  if (unit === "EUR") {
    const n = Number(value);
    if (!Number.isNaN(n)) return n.toLocaleString("en-US") + " EUR";
  }
  if (unit === "%") return value + " %";
  return value;
}

/** Format an engine number for display (legacy fmtNum). */
export function fmtNum(x: number): string {
  return Math.abs(x) >= 1e6 ? x.toLocaleString("en-US") : (Math.round(x * 10000) / 10000).toString();
}

const BAND_COLOR: Record<Band, string> = {
  high: "var(--ok)",
  medium: "var(--warn)",
  low: "var(--faint)",
};

// -------------------------------------------------------------------- toast

let toastFn: ((msg: string) => void) | null = null;

/** Show a transient confirmation toast ("Citation copied", "Exported …"). */
export function toast(msg: string): void {
  toastFn?.(msg);
}

/** Mounted once by App; do not mount in views. */
export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number>(0);
  useEffect(() => {
    toastFn = (m: string) => {
      setMsg(m);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setMsg(null), 1600);
    };
    return () => {
      toastFn = null;
      window.clearTimeout(timer.current);
    };
  }, []);
  return (
    <div className={"ui-toast" + (msg ? " show" : "")} role="status" aria-live="polite">
      {msg}
    </div>
  );
}

// --------------------------------------------------------------------- Card

export function Card({
  tone = "default",
  className = "",
  children,
  style,
}: {
  /** done = confirmed/approved (green edge) · skip = rejected/none (dimmed) · flat = no margin/shadow */
  tone?: "default" | "done" | "skip" | "flat";
  className?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const toneCls = tone === "default" ? "" : ` tone-${tone}`;
  return (
    <div className={`ui-card${toneCls} ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}

// --------------------------------------------------------------------- Pill

export function Pill({
  variant,
  children,
}: {
  /** confidence band, rule severity, or neutral */
  variant: Band | Severity | "neutral";
  children: ReactNode;
}) {
  return <span className={`ui-pill v-${variant}`}>{children}</span>;
}

// --------------------------------------------------------------- StatusPill

export type StatusPillStatus =
  | "undecided" | "accepted" | "none"          // mapping decisions
  | "proposed"                                  // effective link
  | "pending" | "active" | "rejected"           // rule states
  | "approved" | "not_approved" | "awaiting";   // supervisor decisions

const STATUS_META: Record<StatusPillStatus, { cls: string; label: string }> = {
  undecided: { cls: "s-neutral", label: "Undecided" },
  accepted: { cls: "s-ok", label: "Confirmed" },
  none: { cls: "s-bad", label: "No match" },
  proposed: { cls: "s-neutral", label: "Proposed" },
  pending: { cls: "s-neutral", label: "Pending review" },
  active: { cls: "s-ok", label: "Approved" },
  rejected: { cls: "s-bad", label: "Rejected" },
  approved: { cls: "s-ok", label: "Approved" },
  not_approved: { cls: "s-bad", label: "Not approved" },
  awaiting: { cls: "s-neutral", label: "Awaiting supervisor" },
};

export function StatusPill({ status, label }: { status: StatusPillStatus; label?: string }) {
  const meta = STATUS_META[status];
  return <span className={`ui-status ${meta.cls}`}>{label ?? meta.label}</span>;
}

// --------------------------------------------------------------------- Chip

export function Chip({
  children,
  bad = false,
  title,
}: {
  children: ReactNode;
  /** machine-gate style: red chip (e.g. unbound variable) */
  bad?: boolean;
  title?: string;
}) {
  return (
    <span className={"ui-chip" + (bad ? " bad" : "")} title={title}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------- Btn

export function Btn({
  variant = "default",
  active = false,
  disabled = false,
  onClick,
  children,
  title,
  className = "",
}: {
  variant?: "default" | "primary" | "accept" | "reject" | "ghost";
  /** accent fill for toggle buttons (Confirm/Reject in their "on" state) */
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  const v = variant === "default" ? "" : ` v-${variant}`;
  return (
    <button
      type="button"
      className={`ui-btn${v}${active ? " on" : ""} ${className}`.trim()}
      disabled={disabled}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ Toolbar

/** Sticky filter/action bar at the top of a view. Compose with <label>,
 *  <select>, <input type="search">, <ProgressBar>, <Btn variant="primary">. */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="ui-toolbar">{children}</div>;
}

// ---------------------------------------------------------------------- KPI

/** Stat tile with an animated count-up (respects prefers-reduced-motion).
 *  Numeric values animate; string values render as-is. */
export function KPI({
  label,
  value,
  suffix = "",
  delay = 0,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  delay?: number;
}) {
  const isNum = typeof value === "number";
  const [disp, setDisp] = useState<number>(0);
  useEffect(() => {
    if (!isNum) return;
    const target = value as number;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisp(target);
      return;
    }
    let raf = 0;
    const dur = 650;
    const t0 = performance.now() + delay;
    const decimals = Number.isInteger(target) ? 0 : 1;
    const step = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - t0) / dur));
      const eased = 1 - Math.pow(1 - p, 3);
      const v = target * eased;
      setDisp(Number(v.toFixed(decimals)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [isNum, value, delay]);
  return (
    <div className="ui-kpi">
      <b>
        {isNum ? disp.toLocaleString("en-US") : value}
        {suffix}
      </b>
      <span>{label}</span>
    </div>
  );
}

/** Layout row for KPI tiles. */
export function KPIRow({ children }: { children: ReactNode }) {
  return <div className="ui-kpi-row">{children}</div>;
}

// -------------------------------------------------------------- ProgressBar

export function ProgressBar({ value }: { value: number /* 0..100 */ }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="ui-progress" role="progressbar" aria-valuenow={Math.round(clamped)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${clamped}%` }} />
    </div>
  );
}

// ------------------------------------------------------------------ ConfBar

/** Confidence bar + percent + band pill (candidate confidence display). */
export function ConfBar({ confidence, band }: { confidence: number; band: Band }) {
  return (
    <span className="ui-conf">
      <span className="track">
        <span className="fill" style={{ width: `${confidence}%`, background: BAND_COLOR[band] }} />
      </span>
      <b>{confidence}%</b>
      <Pill variant={band}>{band}</Pill>
    </span>
  );
}

// ---------------------------------------------------------------------- Evi

/** Quoted-evidence block (the legal text a candidate or rule cites). */
export function Evi({ children }: { children: ReactNode }) {
  return <blockquote className="ui-evi" style={{ margin: 0 }}>{children}</blockquote>;
}

// --------------------------------------------------------------- EmptyState

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="ui-empty">
      <span className="glyph" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="16" height="16" rx="4" />
          <path d="M7 8.5h8M7 12h8M7 15.5h5" />
        </svg>
      </span>
      <h4>{title}</h4>
      {hint && <p>{hint}</p>}
      {action}
    </div>
  );
}

// ------------------------------------------------------------- SectionTitle

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="ui-sec">
      <h3>{children}</h3>
      {sub && <span className="sub">· {sub}</span>}
    </div>
  );
}

// ------------------------------------------------------------------- Reveal

/** Staggered entrance wrapper: fades/rises in when scrolled into view.
 *  Stagger lists with delay={i * 40} (cap the index, e.g. Math.min(i, 8)). */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reveal = () => el.classList.add("in");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      reveal();
      return;
    }
    // If it's already within (or above) the viewport at mount — the common case
    // for above-the-fold content mounted inside a crossfading container, where
    // IntersectionObserver records isIntersecting=false and never re-fires —
    // reveal on the next frame so the entrance transition still plays.
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    let raf = 0;
    let io: IntersectionObserver | null = null;
    if (rect.top < vh * 0.95) {
      raf = requestAnimationFrame(reveal);
    } else {
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              reveal();
              io?.disconnect();
            }
          }
        },
        { threshold: 0.05 },
      );
      io.observe(el);
    }
    // Hard guarantee: content is never left permanently invisible, whatever the
    // observer does (hidden parent, opacity fade, layout race).
    const fallback = window.setTimeout(reveal, 600);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      io?.disconnect();
      clearTimeout(fallback);
    };
  }, []);
  return (
    <div ref={ref} className={`ui-reveal ${className}`.trim()} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
