import { createContext, createElement, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useColorScheme } from "react-native";
import type { TextStyle } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  colors as colorsForMode,
  fonts,
  motion,
  nativeShadow,
  radius,
  space,
  type as typeTokens,
  typeMobileOverrides,
  palette,
} from "@personal-agent/core/theme";
import type { ThemeColors, ThemeMode, TypeToken } from "@personal-agent/core/theme";

export type { ThemeColors, ThemeMode, TypeToken };
export { space, radius, motion, nativeShadow, palette };

/**
 * Font family names as registered with expo-font in App.tsx. We register one
 * family name per weight (the @expo-google-fonts packages export these exact
 * PostScript names), because custom fonts on Android do not synthesize weights
 * from a single family + fontWeight.
 */
export const fontFamily = {
  displayMedium: "SpaceGrotesk_500Medium",
  displayBold: "SpaceGrotesk_700Bold",
  bodyRegular: "InstrumentSans_400Regular",
  bodySemiBold: "InstrumentSans_600SemiBold",
  monoRegular: "SpaceMono_400Regular",
  monoBold: "SpaceMono_700Bold",
} as const;

function resolveFamily(family: keyof typeof fonts, weight: number): string {
  if (family === "display") return weight >= 700 ? fontFamily.displayBold : fontFamily.displayMedium;
  if (family === "mono") return weight >= 700 ? fontFamily.monoBold : fontFamily.monoRegular;
  return weight >= 600 ? fontFamily.bodySemiBold : fontFamily.bodyRegular;
}

/**
 * Convert a design type token into a React Native TextStyle. Line-height and
 * letter-spacing are stored as multipliers/ems in the shared tokens; RN needs
 * absolute pixels, so we resolve them against the (optionally overridden) size.
 */
export function textStyle(
  token: keyof typeof typeTokens,
  color?: string,
): TextStyle {
  const t: TypeToken = typeTokens[token];
  const size = typeMobileOverrides[token] ?? t.size;
  const style: TextStyle = {
    fontFamily: resolveFamily(t.family, t.weight),
    fontSize: size,
    lineHeight: Math.round(size * t.lineHeight),
    letterSpacing: Math.round(size * t.tracking * 100) / 100,
  };
  if (t.transform) style.textTransform = t.transform;
  if (color) style.color = color;
  return style;
}

export interface Theme {
  mode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  space: typeof space;
  radius: typeof radius;
  motion: typeof motion;
  shadow: typeof nativeShadow;
  /** textStyle bound to this theme's colors when a token color name is passed. */
  text: (token: keyof typeof typeTokens, color?: keyof ThemeColors) => TextStyle;
}

/** Resolve the full theme for a given mode (usable outside React too). */
export function getTheme(mode: ThemeMode): Theme {
  const c = colorsForMode(mode);
  return {
    mode,
    isDark: mode === "dark",
    colors: c,
    space,
    radius,
    motion,
    shadow: nativeShadow,
    text: (token, color) => textStyle(token, color ? c[color] : undefined),
  };
}

/** User's theme choice: follow the OS, or pin light/dark. */
export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "atlas.theme";

const ThemeContext = createContext<{
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}>({ preference: "system", setPreference: () => {} });

/** Wraps the app so useTheme() can honor a persisted light/dark override. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (value === "system" || value === "light" || value === "dark") {
        setPreferenceState(value);
      }
    });
  }, []);

  function setPreference(next: ThemePreference) {
    setPreferenceState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next);
  }

  return createElement(ThemeContext.Provider, { value: { preference, setPreference } }, children);
}

/** Read/change the theme preference (for a settings toggle). */
export function useThemePreference() {
  return useContext(ThemeContext);
}

/**
 * Primary hook — resolves the active theme from the user's preference, falling
 * back to the OS light/dark setting when the preference is "system".
 */
export function useTheme(): Theme {
  const scheme = useColorScheme();
  const { preference } = useContext(ThemeContext);
  const mode: ThemeMode = preference === "system" ? (scheme === "dark" ? "dark" : "light") : preference;
  return getTheme(mode);
}
