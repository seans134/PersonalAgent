export function formatGrade(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

export function gradeZone(value: number | null): "danger" | "warning" | "success" | "empty" {
  if (value === null || !Number.isFinite(value)) return "empty";
  if (value < 60) return "danger";
  if (value < 80) return "warning";
  return "success";
}
