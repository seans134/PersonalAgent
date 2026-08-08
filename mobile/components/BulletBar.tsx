import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";

type Zone = "danger" | "warning" | "success";

function gradeZone(value: number | null): Zone | "empty" {
  if (value === null || !Number.isFinite(value)) return "empty";
  if (value < 60) return "danger";
  if (value < 80) return "warning";
  return "success";
}

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, value));
}

type BulletBarProps = {
  value: number | null;
  target?: number | null;
  height?: number;
};

/**
 * RN port of the web bullet bar (src/components/bullet-bar.tsx): a track with
 * three tinted danger/warning/success zones (60/20/20%), a fill fired by
 * `value`, and an optional 2px target tick. Plain Views — no react-native-svg.
 */
export function BulletBar({ value, target = null, height = 14 }: BulletBarProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const zone = gradeZone(value);
  const pct = value === null ? 0 : clampPct(value);
  const fillColor = zone === "empty" ? theme.colors.warning : theme.colors[zone];

  return (
    <View style={[styles.track, { height }]}>
      <View style={[styles.zone, styles.zoneDanger, { backgroundColor: theme.colors.danger }]} />
      <View style={[styles.zone, styles.zoneWarning, { backgroundColor: theme.colors.warning }]} />
      <View style={[styles.zone, styles.zoneSuccess, { backgroundColor: theme.colors.success }]} />
      {value !== null && (
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: fillColor }]} />
      )}
      {target !== null && (
        <View style={[styles.target, { left: `${clampPct(target)}%`, backgroundColor: theme.colors.ink }]} />
      )}
    </View>
  );
}

function makeStyles(theme: Theme) {
  const { radius } = theme;
  return StyleSheet.create({
    track: {
      width: "100%",
      overflow: "hidden",
      borderRadius: radius.node,
      backgroundColor: theme.colors.surface2,
      position: "relative",
    },
    zone: {
      position: "absolute",
      top: 0,
      bottom: 0,
      opacity: 0.18,
    },
    zoneDanger: {
      left: "0%",
      width: "60%",
    },
    zoneWarning: {
      left: "60%",
      width: "20%",
    },
    zoneSuccess: {
      left: "80%",
      width: "20%",
    },
    fill: {
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
    },
    target: {
      position: "absolute",
      top: 0,
      bottom: 0,
      width: 2,
    },
  });
}
