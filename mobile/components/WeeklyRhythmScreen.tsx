import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { features } from "@personal-agent/core";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";
import { NaturalLanguageOnboardingPanel } from "./NaturalLanguageOnboardingPanel";
import { WeeklyScheduleGrid } from "./WeeklyScheduleGrid";
import {
  fetchMobileCalendar,
  fetchMobilePlannerProfile,
  saveMobileOnboarding,
  type MobileOnboardingInput,
  type MobileScheduleBlock,
} from "../lib/api";

type WeeklyRhythmScreenProps = {
  accessToken: string;
  onImport?: () => void;
};

const workoutOptions: NonNullable<MobileOnboardingInput["workoutPreference"]>[] = [
  "none",
  "light",
  "moderate",
  "intense",
];

/**
 * Optional weekly rhythm (study, personal and protected time) plus planner
 * preferences. These used to be onboarding steps 2 and 3; onboarding is now
 * courses -> class times -> done, so they live here, reachable from More.
 */
export function WeeklyRhythmScreen({ accessToken, onImport }: WeeklyRhythmScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [blocks, setBlocks] = useState<MobileScheduleBlock[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [blocksError, setBlocksError] = useState("");

  const [workStartTime, setWorkStartTime] = useState("09:00");
  const [workEndTime, setWorkEndTime] = useState("17:00");
  const [focusBlockMinutes, setFocusBlockMinutes] = useState("60");
  const [workoutPreference, setWorkoutPreference] =
    useState<NonNullable<MobileOnboardingInput["workoutPreference"]>>("none");
  const [message, setMessage] = useState<{ text: string; tone: "info" | "error" } | null>(null);
  const [saving, setSaving] = useState(false);
  // Saving is held until the saved profile loads, so defaults never overwrite it.
  const [profileLoaded, setProfileLoaded] = useState(false);
  // Load the profile once; a token refresh must not wipe in-progress edits.
  const profileRequestedRef = useRef(false);

  const loadBlocks = useCallback(async () => {
    try {
      setBlocksError("");
      const calendar = await fetchMobileCalendar(accessToken);
      setBlocks(calendar.scheduleBlocks);
    } catch (error) {
      setBlocksError(error instanceof Error ? error.message : "Unable to load schedule blocks.");
    } finally {
      setLoadingBlocks(false);
    }
  }, [accessToken]);

  const loadProfile = useCallback(async () => {
    try {
      const { profile } = await fetchMobilePlannerProfile(accessToken);
      if (profile) {
        setWorkStartTime(profile.workStartTime);
        setWorkEndTime(profile.workEndTime);
        setFocusBlockMinutes(String(profile.focusBlockMinutes));
        setWorkoutPreference(profile.workoutPreference);
      }
      setProfileLoaded(true);
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "Unable to load planner preferences.",
        tone: "error",
      });
    }
  }, [accessToken]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadBlocks();
    }, 0);

    return () => clearTimeout(timeout);
  }, [loadBlocks]);

  useEffect(() => {
    if (profileRequestedRef.current) return;
    const timeout = setTimeout(() => {
      profileRequestedRef.current = true;
      void loadProfile();
    }, 0);

    return () => clearTimeout(timeout);
  }, [loadProfile]);

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([loadBlocks(), profileLoaded ? Promise.resolve() : loadProfile()]);
    setRefreshing(false);
  }

  async function savePreferences() {
    setMessage(null);
    setSaving(true);

    try {
      await saveMobileOnboarding(accessToken, {
        workStartTime,
        workEndTime,
        focusBlockMinutes: Number(focusBlockMinutes),
        // Only send it when the field is shown; otherwise keep what's saved.
        ...(features.wellnessTracking ? { workoutPreference } : {}),
        goalTitle: "",
        goalPriority: 1,
        goalTaskType: "focus",
        minimumDailyMinutes: 0,
      });
      setMessage({ text: "Planner preferences saved.", tone: "info" });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Unable to save preferences.", tone: "error" });
    }

    setSaving(false);
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          colors={[theme.colors.teal]}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          tintColor={theme.colors.teal}
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>Weekly rhythm</Text>
        <Text style={styles.body}>
          Add recurring study blocks and protected time that shape your week outside class and work.
        </Text>
      </View>

      {blocksError ? <Text style={styles.error}>{blocksError}</Text> : null}

      {onImport && <Pressable onPress={onImport}><Text style={theme.text("label", "teal")}>Import schedule</Text></Pressable>}
      <NaturalLanguageOnboardingPanel accessToken={accessToken} mode="weekly_rhythm" onApplied={loadBlocks} />
      {loadingBlocks ? (
        <ActivityIndicator color={theme.colors.teal} />
      ) : (
        <WeeklyScheduleGrid
          accessToken={accessToken}
          blocks={blocks}
          categories={["study", "personal", "unavailable"]}
          defaultCategory="study"
          onChanged={loadBlocks}
          visibleCategories={["school", "work", "study", "personal", "unavailable"]}
        />
      )}

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Planner preferences</Text>
        <Text style={styles.panelBody}>The working hours and focus block length Atlas plans with.</Text>

        <Text style={styles.label}>Work start</Text>
        <TextInput
          onChangeText={setWorkStartTime}
          placeholder="09:00"
          placeholderTextColor={theme.colors.inkMuted}
          style={styles.input}
          value={workStartTime}
        />
        <Text style={styles.label}>Work end</Text>
        <TextInput
          onChangeText={setWorkEndTime}
          placeholder="17:00"
          placeholderTextColor={theme.colors.inkMuted}
          style={styles.input}
          value={workEndTime}
        />
        <Text style={styles.label}>Focus block minutes</Text>
        <TextInput
          keyboardType="number-pad"
          onChangeText={setFocusBlockMinutes}
          placeholder="60"
          placeholderTextColor={theme.colors.inkMuted}
          style={styles.input}
          value={focusBlockMinutes}
        />

        {features.wellnessTracking ? (
          <>
            <Text style={styles.label}>Workout preference</Text>
            <View style={styles.optionRow}>
              {workoutOptions.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setWorkoutPreference(option)}
                  style={[styles.option, workoutPreference === option && styles.optionSelected]}
                >
                  <Text style={[styles.optionText, workoutPreference === option && styles.optionTextSelected]}>
                    {option}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {message ? (
          <Text style={message.tone === "error" ? styles.error : styles.info}>{message.text}</Text>
        ) : null}

        <Pressable
          disabled={saving || !profileLoaded}
          onPress={savePreferences}
          style={({ pressed }) => [
            styles.primaryButton,
            (pressed || saving || !profileLoaded) && styles.buttonPressed,
          ]}
        >
          {saving ? (
            <ActivityIndicator color={theme.colors.surface} />
          ) : (
            <Text style={styles.primaryText}>Save preferences</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
    content: {
      gap: 16,
      padding: 18,
      paddingBottom: 40,
    },
    header: {
      gap: 8,
    },
    title: {
      ...theme.text("displayLg", "ink"),
    },
    body: {
      ...theme.text("bodyLg", "inkMuted"),
    },
    panel: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: 8,
      borderWidth: 1,
      gap: 8,
      padding: 16,
    },
    panelTitle: {
      ...theme.text("heading", "ink"),
    },
    panelBody: {
      ...theme.text("body", "inkMuted"),
    },
    label: {
      ...theme.text("label", "ink"),
      marginTop: 8,
    },
    input: {
      ...theme.text("bodyLg", "ink"),
      backgroundColor: colors.paper,
      borderColor: colors.line,
      borderRadius: 8,
      borderWidth: 1,
      minHeight: 50,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    optionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    option: {
      borderColor: colors.line,
      borderRadius: 8,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    optionSelected: {
      backgroundColor: colors.teal,
      borderColor: colors.teal,
    },
    optionText: {
      ...theme.text("label", "ink"),
    },
    optionTextSelected: {
      color: colors.surface,
    },
    error: {
      ...theme.text("body", "danger"),
    },
    info: {
      ...theme.text("body", "teal"),
    },
    primaryButton: {
      alignItems: "center",
      backgroundColor: colors.teal,
      borderRadius: 8,
      justifyContent: "center",
      marginTop: 8,
      minHeight: 52,
      paddingHorizontal: 14,
    },
    buttonPressed: {
      opacity: 0.78,
    },
    primaryText: {
      ...theme.text("heading", "surface"),
    },
  });
}
