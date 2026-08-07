/**
 * Atlas design tokens — the single source of truth for both the web app and the
 * mobile app. "Cartographic" language: deep teal ink on teal-tinted chart paper,
 * with one warm compass accent reserved exclusively for "now".
 *
 * Web derives CSS variables + the Tailwind theme from these values; mobile
 * imports the objects directly through a useTheme() hook. Never hardcode a hex
 * in a component — add or reference a token here instead.
 */

export type ThemeMode = "light" | "dark";

/** Category of a planned item — drives node/stripe color on the Meridian. */
export type PlanCategory = "goal" | "focus" | "fitness" | "wellness" | "commit";

export interface ThemeColors {
  // Ground & surfaces
  paper: string;
  surface: string;
  surface2: string;
  // Text
  ink: string;
  inkMuted: string;
  // Lines
  line: string;
  lineStrong: string;
  // Brand
  teal: string;
  tealStrong: string;
  signal: string;
  onTeal: string;
  // The one warm accent — "now" only
  compass: string;
  compassSoft: string;
  onCompass: string;
  // Category (meaning, not brand)
  goal: string;
  focus: string;
  fitness: string;
  wellness: string;
  commit: string;
  // Status
  success: string;
  warning: string;
  danger: string;
  onStatus: string;
}

const light: ThemeColors = {
  paper: "#EEF3F1",
  surface: "#FFFFFF",
  surface2: "#F4F8F6",
  ink: "#0A2E2B",
  inkMuted: "#5C736F",
  line: "#DBE7E2",
  lineStrong: "#C6D8D2",
  teal: "#0B6E63",
  tealStrong: "#084D45",
  signal: "#12B5A5",
  onTeal: "#FFFFFF",
  compass: "#DA6A34",
  compassSoft: "#F6E7DC",
  onCompass: "#FFFFFF",
  goal: "#C2611F",
  focus: "#4C5BD4",
  fitness: "#2F9E44",
  wellness: "#0B6E63",
  commit: "#6B7C86",
  success: "#0E9E74",
  warning: "#B4740B",
  danger: "#C63B23",
  onStatus: "#FFFFFF",
};

const dark: ThemeColors = {
  paper: "#06211F",
  surface: "#0C2B28",
  surface2: "#103631",
  ink: "#E7F1EF",
  inkMuted: "#8DAAA5",
  line: "#1C433D",
  lineStrong: "#26534C",
  teal: "#1FB6A6",
  tealStrong: "#5EEAD4",
  signal: "#2DD4BF",
  onTeal: "#04211D",
  compass: "#F0894C",
  compassSoft: "#2A2018",
  onCompass: "#1B0F07",
  goal: "#E8935A",
  focus: "#8B93F0",
  fitness: "#4ADE80",
  wellness: "#2DD4BF",
  commit: "#8FA6B0",
  success: "#34D399",
  warning: "#F0B24B",
  danger: "#F0725A",
  onStatus: "#04211D",
};

export const palette: Record<ThemeMode, ThemeColors> = { light, dark };

/** Resolve the color set for a mode. */
export function colors(mode: ThemeMode): ThemeColors {
  return palette[mode];
}

/** Category token name for a planned-item color. */
export function categoryColor(colorsForMode: ThemeColors, category: PlanCategory): string {
  return colorsForMode[category];
}

// ---- Typography -------------------------------------------------------------

export const fonts = {
  display: "Space Grotesk",
  body: "Instrument Sans",
  mono: "Space Mono",
} as const;

/**
 * Web font stacks (with graceful fallbacks). Mobile registers the same families
 * via expo-font and references `fonts.*` directly.
 */
export const fontStacks = {
  display: `"Space Grotesk", system-ui, -apple-system, "Segoe UI", sans-serif`,
  body: `"Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif`,
  mono: `"Space Mono", ui-monospace, "Cascadia Code", Menlo, monospace`,
} as const;

export type TypeToken = {
  family: keyof typeof fonts;
  weight: 400 | 500 | 600 | 700;
  size: number;
  /** unitless line-height multiplier */
  lineHeight: number;
  /** em */
  tracking: number;
  transform?: "uppercase";
};

export const type = {
  displayXl: { family: "display", weight: 700, size: 40, lineHeight: 1.0, tracking: -0.02 },
  displayLg: { family: "display", weight: 700, size: 28, lineHeight: 1.05, tracking: -0.02 },
  title: { family: "display", weight: 500, size: 20, lineHeight: 1.1, tracking: -0.01 },
  heading: { family: "display", weight: 600, size: 17, lineHeight: 1.2, tracking: -0.01 },
  bodyLg: { family: "body", weight: 400, size: 17, lineHeight: 1.5, tracking: 0 },
  body: { family: "body", weight: 400, size: 15, lineHeight: 1.5, tracking: 0 },
  label: { family: "body", weight: 600, size: 13, lineHeight: 1.3, tracking: 0.01 },
  monoTime: { family: "mono", weight: 400, size: 12, lineHeight: 1.2, tracking: 0.02 },
  monoLabel: {
    family: "mono",
    weight: 700,
    size: 11,
    lineHeight: 1.2,
    tracking: 0.14,
    transform: "uppercase",
  },
} satisfies Record<string, TypeToken>;

/** Mobile display sizes are one notch smaller for the largest headings. */
export const typeMobileOverrides: Partial<Record<keyof typeof type, number>> = {
  displayXl: 34,
  displayLg: 26,
};

// ---- Space / radius / shadow / motion --------------------------------------

/** 4-based spacing scale. Use `space[n]` — never magic numbers. */
export const space = {
  xs2: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  "2xl": 32,
  "3xl": 40,
  "4xl": 48,
  "5xl": 64,
} as const;

export const radius = {
  node: 5,
  control: 11,
  card: 16,
  pill: 999,
} as const;

export const shadow = {
  light: {
    sm: "0 1px 2px rgba(10,46,43,0.06), 0 1px 1px rgba(10,46,43,0.04)",
    md: "0 2px 4px rgba(10,46,43,0.05), 0 12px 28px rgba(10,46,43,0.08)",
  },
  dark: {
    sm: "0 1px 2px rgba(0,0,0,0.30)",
    md: "0 2px 6px rgba(0,0,0,0.30), 0 16px 36px rgba(0,0,0,0.40)",
  },
} as const;

/** Native shadow props (iOS shadow* + Android elevation) for React Native. */
export const nativeShadow = {
  sm: { shadowColor: "#0A2E2B", shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  md: { shadowColor: "#0A2E2B", shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
} as const;

export const motion = {
  fast: 150,
  base: 250,
  slow: 400,
  easeOut: "cubic-bezier(0.2, 0.7, 0.2, 1)",
  easeBack: "cubic-bezier(0.34, 1.4, 0.64, 1)",
  stagger: 60,
} as const;

// ---- CSS variable bridge (web) ---------------------------------------------

/** camelCase color token -> --color-kebab-case CSS var name. */
export function cssVarName(token: keyof ThemeColors): string {
  return `--color-${token.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
}

/** Emit `--color-*: value;` declarations for a mode, for injecting into :root. */
export function cssVars(mode: ThemeMode): string {
  const c = palette[mode];
  return (Object.keys(c) as Array<keyof ThemeColors>)
    .map((k) => `${cssVarName(k)}: ${c[k]};`)
    .join("\n");
}
