import { gradeZone } from "./grade-format";

const ZONE_VAR: Record<"danger" | "warning" | "success", string> = {
  danger: "var(--color-danger)",
  warning: "var(--color-warning)",
  success: "var(--color-success)",
};

export function BulletBar({
  value,
  target = null,
  height = 14,
  ariaLabel,
}: {
  value: number | null;
  target?: number | null;
  height?: number;
  ariaLabel: string;
}) {
  const zone = gradeZone(value);
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div role="img" aria-label={ariaLabel} className="bullet" style={{ height }}>
      <div className="bullet__zone bullet__zone--danger" />
      <div className="bullet__zone bullet__zone--warning" />
      <div className="bullet__zone bullet__zone--success" />
      {value !== null && (
        <div
          className="bullet__fill"
          style={{ transform: `scaleX(${pct / 100})`, background: ZONE_VAR[zone === "empty" ? "warning" : zone] }}
        />
      )}
      {target !== null && (
        <div className="bullet__target" style={{ left: `${Math.max(0, Math.min(100, target))}%` }} />
      )}
    </div>
  );
}
