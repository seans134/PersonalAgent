import { useState, useMemo } from "react";
import { useTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  applyMobileOnboarding,
  parseMobileOnboarding,
  type MobileOnboardingDraft,
  type MobileOnboardingMode,
} from "../lib/api";
import { errorHaptic, successHaptic } from "../lib/haptics";
import { weekdayLabels } from "../lib/calendar-view";

type NaturalLanguageOnboardingPanelProps = {
  accessToken: string;
  mode: MobileOnboardingMode;
  onApplied: () => void;
};

const minimumTextLength = 12;

const modeCopy: Record<
  MobileOnboardingMode,
  { title: string; description: string; placeholder: string; parseLabel: string }
> = {
  school_work: {
    title: "Add school and work from text",
    description: "Paste fixed classes, labs, shifts, or work hours.",
    placeholder:
      "Example: I work Monday to Friday 9-5 and have chemistry lab Tuesday and Thursday 6-8 PM.",
    parseLabel: "Parse school and work",
  },
  weekly_rhythm: {
    title: "Add weekly rhythm from text",
    description: "Paste recurring habits, study blocks, personal plans, and unavailable time.",
    placeholder:
      "Example: I study Spanish Monday and Wednesday 7-8, go to the gym Saturday morning, and keep Sunday night blocked.",
    parseLabel: "Parse weekly rhythm",
  },
  goals: {
    title: "Add goals from text",
    description: "Paste the outcomes Atlas should plan around.",
    placeholder:
      "Example: I want to learn Spanish by December, run a half marathon this fall, and save for a car.",
    parseLabel: "Parse goals",
  },
};

function formatDays(days: number[]) {
  return days.map((day) => weekdayLabels[day] ?? String(day)).join(", ");
}

function profileEntries(draft: MobileOnboardingDraft) {
  return [
    draft.profile.workStartTime && draft.profile.workEndTime
      ? `Work ${draft.profile.workStartTime} - ${draft.profile.workEndTime}`
      : null,
    draft.profile.noMeetingStartTime && draft.profile.noMeetingEndTime
      ? `No meetings ${draft.profile.noMeetingStartTime} - ${draft.profile.noMeetingEndTime}`
      : null,
    draft.profile.focusBlockMinutes ? `${draft.profile.focusBlockMinutes} min focus blocks` : null,
    draft.profile.workoutPreference ? `${draft.profile.workoutPreference} workouts` : null,
  ].filter((entry): entry is string => Boolean(entry));
}

function localTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto";
}

export function NaturalLanguageOnboardingPanel({
  accessToken,
  mode,
  onApplied,
}: NaturalLanguageOnboardingPanelProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<MobileOnboardingDraft | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [parsing, setParsing] = useState(false);
  const [applying, setApplying] = useState(false);

  const copy = modeCopy[mode];
  const showProfile = mode !== "goals";
  const showSchedule = mode !== "goals";
  const showGoals = mode === "goals";
  const entries = draft ? profileEntries(draft) : [];
  const hasDraftContent = Boolean(
    draft &&
      ((showProfile && entries.length > 0) ||
        (showSchedule && draft.scheduleBlocks.length > 0) ||
        (showGoals && draft.goals.length > 0)),
  );

  async function handleParse() {
    setError("");
    setMessage("");
    setDraft(null);
    setParsing(true);

    try {
      const response = await parseMobileOnboarding(accessToken, mode, text, localTimezone());
      setDraft(response.draft);
    } catch (parseError) {
      errorHaptic();
      setError(parseError instanceof Error ? parseError.message : "Unable to parse onboarding note.");
    } finally {
      setParsing(false);
    }
  }

  async function handleApply() {
    if (!draft) return;

    setError("");
    setMessage("");
    setApplying(true);

    try {
      const response = await applyMobileOnboarding(accessToken, mode, draft, localTimezone());
      successHaptic();
      setMessage(
        `Saved ${response.applied.scheduleBlocksCreated} schedule blocks and ${response.applied.goalsCreated} goals.`,
      );
      setDraft(null);
      setText("");
      onApplied();
    } catch (applyError) {
      errorHaptic();
      setError(applyError instanceof Error ? applyError.message : "Unable to apply onboarding drafts.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <View style={styles.panel}>
      <View style={styles.headerText}>
        <Text style={styles.panelTitle}>{copy.title}</Text>
        <Text style={styles.panelBody}>{copy.description}</Text>
      </View>

      <TextInput
        multiline
        onChangeText={setText}
        placeholder={copy.placeholder}
        placeholderTextColor={theme.colors.inkMuted}
        style={styles.textArea}
        textAlignVertical="top"
        value={text}
      />

      <View style={styles.actionRow}>
        <Pressable
          disabled={parsing || text.trim().length < minimumTextLength}
          onPress={handleParse}
          style={[
            styles.primaryButton,
            (parsing || text.trim().length < minimumTextLength) && styles.disabled,
          ]}
        >
          {parsing ? (
            <ActivityIndicator color={theme.colors.surface} />
          ) : (
            <Text style={styles.primaryText}>{copy.parseLabel}</Text>
          )}
        </Pressable>

        {draft ? (
          <Pressable
            disabled={applying || !hasDraftContent}
            onPress={handleApply}
            style={[styles.secondaryButton, (applying || !hasDraftContent) && styles.disabled]}
          >
            <Text style={styles.secondaryText}>{applying ? "Saving..." : "Apply drafts"}</Text>
          </Pressable>
        ) : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {message ? <Text style={styles.success}>{message}</Text> : null}

      {draft ? (
        <View style={styles.draftGroup}>
          {showProfile ? (
            <View style={styles.draftCard}>
              <Text style={styles.draftLabel}>Profile</Text>
              {entries.length > 0 ? (
                entries.map((entry) => (
                  <Text key={entry} style={styles.draftLine}>
                    {entry}
                  </Text>
                ))
              ) : (
                <Text style={styles.draftEmpty}>No profile fields found.</Text>
              )}
            </View>
          ) : null}

          {showSchedule ? (
            <View style={styles.draftCard}>
              <Text style={styles.draftLabel}>Schedule</Text>
              {draft.scheduleBlocks.length > 0 ? (
                draft.scheduleBlocks.map((block, index) => (
                  <View key={`${block.title}-${index}`} style={styles.draftItem}>
                    <Text style={styles.draftItemTitle}>{block.title}</Text>
                    <Text style={styles.draftLine}>
                      {formatDays(block.daysOfWeek)} {block.startTime} - {block.endTime}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.draftEmpty}>No schedule blocks found.</Text>
              )}
            </View>
          ) : null}

          {showGoals ? (
            <View style={styles.draftCard}>
              <Text style={styles.draftLabel}>Goals</Text>
              {draft.goals.length > 0 ? (
                draft.goals.map((goal, index) => (
                  <View key={`${goal.title}-${index}`} style={styles.draftItem}>
                    <Text style={styles.draftItemTitle}>{goal.title}</Text>
                    <Text style={styles.draftLine}>
                      Priority {goal.priority} - {goal.taskType} - {goal.minimumDailyMinutes} min/day
                      minimum{goal.endDate ? `, by ${goal.endDate}` : ""}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.draftEmpty}>No goals found.</Text>
              )}
            </View>
          ) : null}
        </View>
      ) : null}

      {draft?.warnings.length ? (
        <View style={styles.warningCard}>
          <Text style={styles.warningTitle}>Review notes</Text>
          {draft.warnings.map((warning) => (
            <Text key={warning} style={styles.warningText}>
              - {warning}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  headerText: {
    gap: 5,
  },
  panelTitle: {
    ...theme.text("heading", "ink"),
  },
  panelBody: {
    ...theme.text("body", "inkMuted"),
  },
  textArea: {
    ...theme.text("body", "ink"),
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 112,
    padding: 12,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.teal,
    borderRadius: 8,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 150,
    paddingHorizontal: 14,
  },
  primaryText: {
    ...theme.text("label", "surface"),
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 16,
  },
  secondaryText: {
    ...theme.text("label", "ink"),
  },
  draftGroup: {
    gap: 10,
  },
  draftCard: {
    backgroundColor: colors.paper,
    borderRadius: 8,
    gap: 6,
    padding: 12,
  },
  draftLabel: {
    ...theme.text("monoLabel", "inkMuted"),
  },
  draftItem: {
    gap: 2,
  },
  draftItemTitle: {
    ...theme.text("label", "ink"),
  },
  draftLine: {
    ...theme.text("body", "ink"),
  },
  draftEmpty: {
    ...theme.text("body", "inkMuted"),
  },
  warningCard: {
    backgroundColor: colors.surface2,
    borderColor: colors.warning,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  warningTitle: {
    ...theme.text("label", "warning"),
  },
  warningText: {
    ...theme.text("body", "warning"),
  },
  disabled: {
    opacity: 0.58,
  },
  error: {
    ...theme.text("body", "danger"),
  },
  success: {
    ...theme.text("label", "success"),
  },
});
}
