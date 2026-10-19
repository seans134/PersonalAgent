import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  addSyllabusCategory,
  countNamedSyllabusCategories,
  countSyllabusItemsToApply,
  fromSyllabusReview,
  isSyllabusItemApplied,
  removeSyllabusCategory,
  renameSyllabusCategory,
  summarizeSyllabusWeights,
  syllabusImportSource,
  toSyllabusReview,
  type SyllabusImportSource,
} from "@personal-agent/core";
import { Icon } from "./Icon";
import {
  applySyllabusImport,
  parseSyllabusImport,
  type MobileSyllabusDraft,
  type MobileSyllabusImportFile,
  type MobileSyllabusItemKind,
} from "../lib/api";
import { combineToIso, splitIso } from "../lib/local-datetime";
import { chooseSyllabusDocument, chooseSyllabusPhoto, takeSyllabusPhoto } from "../lib/syllabus-files";

type SyllabusImportScreenProps = {
  accessToken: string;
  onBack: () => void;
  /** Label on the back button; onboarding returns to its course step rather than Courses. */
  backLabel?: string;
  /** Called with the new course's id after a successful apply. */
  onImported: (courseId: string) => void;
};

const KIND_OPTIONS: Array<{ value: MobileSyllabusItemKind; label: string }> = [
  { value: "assignment", label: "Assignment" },
  { value: "quiz", label: "Quiz" },
  { value: "exam", label: "Exam" },
];

// Same minimum the web panel uses before it lets pasted text through.
const MIN_TEXT_LENGTH = 8;

// A date with no time counts as due at the end of that day.
const DEFAULT_DUE_TIME = "23:59";

// Review keeps numbers and dates as text so partial input ("12.", "2026-09-") isn't lost while typing.
// Items link to categories by a stable key (see toSyllabusReview), not by name.
type ReviewCategory = { key: string; name: string; weight: string };
type ReviewItem = {
  kind: MobileSyllabusItemKind;
  title: string;
  categoryKey: string | null;
  dueDate: string;
  dueTime: string;
  score_max: number;
  include: boolean;
};
type ReviewState = {
  name: string;
  code: string;
  term: string;
  targetGrade: string;
  categories: ReviewCategory[];
  items: ReviewItem[];
  warnings: string[];
};

function reviewFromDraft(parsed: MobileSyllabusDraft): ReviewState {
  const draft = toSyllabusReview(parsed);
  return {
    name: draft.course.name,
    code: draft.course.code ?? "",
    term: draft.course.term ?? "",
    targetGrade: draft.course.target_grade !== null ? String(draft.course.target_grade) : "",
    categories: draft.categories.map((category) => ({
      key: category.key,
      name: category.name,
      weight: String(category.weight),
    })),
    items: draft.items.map((item) => {
      const due = splitIso(item.due_at);
      return {
        kind: item.kind,
        title: item.title,
        categoryKey: item.categoryKey,
        dueDate: due.date,
        dueTime: due.time,
        score_max: item.score_max,
        include: item.include,
      };
    }),
    warnings: draft.warnings,
  };
}

function parseNumber(text: string): number | null {
  if (!text.trim()) return null;
  const value = Number(text.trim().replace(/%$/, ""));
  return Number.isFinite(value) ? value : null;
}

function dueAtFromReview(item: ReviewItem): string | null {
  const date = item.dueDate.trim();
  if (!date) return null;
  return combineToIso(date, item.dueTime.trim() || DEFAULT_DUE_TIME);
}

function draftFromReview(review: ReviewState): MobileSyllabusDraft {
  return fromSyllabusReview({
    course: {
      name: review.name.trim(),
      code: review.code.trim() || null,
      term: review.term.trim() || null,
      target_grade: parseNumber(review.targetGrade),
    },
    categories: review.categories.map((category, position) => ({
      key: category.key,
      name: category.name.trim(),
      weight: parseNumber(category.weight) ?? 0,
      position,
    })),
    items: review.items.map((item) => {
      const dueAt = dueAtFromReview(item);
      return {
        kind: item.kind,
        title: item.title.trim(),
        categoryKey: item.categoryKey,
        due_at: dueAt,
        score_max: item.score_max,
        include: isSyllabusItemApplied({ include: item.include, due_at: dueAt }),
      };
    }),
    warnings: review.warnings,
  });
}

export function SyllabusImportScreen({
  accessToken,
  onBack,
  backLabel = "Courses",
  onImported,
}: SyllabusImportScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [text, setText] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [parsingLabel, setParsingLabel] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewState | null>(null);
  // Where the draft under review came from, reported when it's applied.
  const [source, setSource] = useState<SyllabusImportSource>("text");
  const [error, setError] = useState("");
  const [applying, setApplying] = useState(false);
  const [picking, setPicking] = useState(false);
  // Refs guard against double taps landing before the busy state re-renders,
  // and against a slow apply navigating after the student has left this screen.
  const busyRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const isParsing = parsingLabel !== null;
  const draft = useMemo(() => (review ? draftFromReview(review) : null), [review]);
  const weights = summarizeSyllabusWeights(draft?.categories ?? []);
  const itemsToApply = draft ? countSyllabusItemsToApply(draft.items) : 0;
  const categoryCount = review ? countNamedSyllabusCategories(review.categories) : 0;

  async function parse(label: string, file: MobileSyllabusImportFile | null, pastedText?: string) {
    setParsingLabel(label);

    try {
      const result = await parseSyllabusImport(accessToken, file, pastedText);
      if (mountedRef.current) {
        setSource(syllabusImportSource(file));
        setReview(reviewFromDraft(result.draft));
      }
    } catch (parseError) {
      if (mountedRef.current) setError(parseError instanceof Error ? parseError.message : "Unable to parse syllabus.");
    }

    if (mountedRef.current) setParsingLabel(null);
  }

  async function parseText() {
    if (busyRef.current) return;
    busyRef.current = true;
    setError("");
    await parse("Pasted text", null, text);
    busyRef.current = false;
  }

  async function pickAndParse(pick: () => Promise<MobileSyllabusImportFile | null>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setPicking(true);
    setError("");

    try {
      const file = await pick();
      if (file && mountedRef.current) {
        setPicking(false);
        await parse(file.name, file);
      }
    } catch (pickError) {
      if (mountedRef.current) setError(pickError instanceof Error ? pickError.message : "Unable to open that file.");
    }

    busyRef.current = false;
    if (mountedRef.current) setPicking(false);
  }

  function updateReview(patch: Partial<ReviewState>) {
    setReview((current) => (current ? { ...current, ...patch } : current));
  }

  function updateCategoryWeight(key: string, weight: string) {
    setReview((current) =>
      current
        ? { ...current, categories: current.categories.map((c) => (c.key === key ? { ...c, weight } : c)) }
        : current,
    );
  }

  function updateItem(index: number, patch: Partial<ReviewItem>) {
    setReview((current) =>
      current ? { ...current, items: current.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) } : current,
    );
  }

  function removeItem(index: number) {
    setReview((current) => (current ? { ...current, items: current.items.filter((_, i) => i !== index) } : current));
  }

  function startOver() {
    setReview(null);
    setError("");
  }

  async function handleApply() {
    if (!draft) return;
    if (!draft.course.name) {
      setError("Give the course a name before creating it.");
      return;
    }

    setError("");
    setApplying(true);

    try {
      const result = await applySyllabusImport(accessToken, draft, source);
      if (mountedRef.current) onImported(result.courseId);
      return;
    } catch (applyError) {
      if (mountedRef.current) setError(applyError instanceof Error ? applyError.message : "Unable to create course.");
    }

    if (mountedRef.current) setApplying(false);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={`Back to ${backLabel.toLowerCase()}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: applying }}
          disabled={applying}
          hitSlop={8}
          onPress={onBack}
          style={[styles.backButton, applying && styles.buttonPressed]}
        >
          <Icon color={theme.colors.teal} name="back" size={20} strokeWidth={2.2} />
          <Text style={styles.backText}>{backLabel}</Text>
        </Pressable>
        <Text numberOfLines={1} style={styles.headerTitle}>
          Import syllabus
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? <Text style={[styles.message, styles.messageError]}>{error}</Text> : null}

        {isParsing ? (
          <View style={styles.panel}>
            <View style={styles.loadingRow}>
              <ActivityIndicator color={theme.colors.teal} />
              <Text style={styles.panelLabel}>Reading your syllabus...</Text>
            </View>
            <Text style={styles.panelBody}>
              {parsingLabel ? `${parsingLabel}. ` : ""}This can take up to a minute for long files.
            </Text>
          </View>
        ) : review && draft ? (
          <>
            <View style={styles.panel}>
              <Text style={styles.panelLabel}>Course</Text>
              <View style={styles.form}>
                <Field label="Name" onChangeText={(name) => updateReview({ name })} value={review.name} />
                <Field label="Code" onChangeText={(code) => updateReview({ code })} placeholder="CHEM 201" value={review.code} />
                <Field label="Term" onChangeText={(term) => updateReview({ term })} placeholder="Fall 2026" value={review.term} />
                <Field
                  keyboardType="decimal-pad"
                  label="Target grade"
                  onChangeText={(targetGrade) => updateReview({ targetGrade })}
                  placeholder="90"
                  value={review.targetGrade}
                />
              </View>
            </View>

            <View style={styles.panel}>
              <View style={styles.rowBetween}>
                <Text style={styles.panelLabel}>Weighted categories</Text>
                <View style={[styles.totalChip, weights.isOff && styles.totalChipOff]}>
                  <Text style={[styles.totalChipText, weights.isOff && styles.totalChipTextOff]}>
                    {Math.round(weights.total)}% total
                  </Text>
                </View>
              </View>
              {weights.isOff ? <Text style={styles.warningText}>Weights should add up to 100%.</Text> : null}
              <View style={styles.form}>
                {review.categories.map((category) => (
                  <View key={category.key} style={styles.categoryRow}>
                    <TextInput
                      onChangeText={(name) =>
                        setReview((current) => (current ? renameSyllabusCategory(current, category.key, name) : current))
                      }
                      placeholder="Category name"
                      placeholderTextColor={theme.colors.inkMuted}
                      style={[styles.input, styles.categoryName]}
                      value={category.name}
                    />
                    <TextInput
                      accessibilityLabel={`${category.name || "Category"} weight percent`}
                      keyboardType="decimal-pad"
                      onChangeText={(weight) => updateCategoryWeight(category.key, weight)}
                      placeholder="%"
                      placeholderTextColor={theme.colors.inkMuted}
                      style={[styles.input, styles.categoryWeight]}
                      value={category.weight}
                    />
                    <Pressable
                      accessibilityLabel={`Remove ${category.name || "category"}`}
                      hitSlop={6}
                      onPress={() => setReview((current) => (current ? removeSyllabusCategory(current, category.key) : current))}
                      style={styles.removeButton}
                    >
                      <Text style={styles.removeText}>Remove</Text>
                    </Pressable>
                  </View>
                ))}
                <Pressable
                  onPress={() =>
                    setReview((current) => (current ? addSyllabusCategory(current, { name: "", weight: "0" }) : current))
                  }
                  style={styles.smallButton}
                >
                  <Text style={styles.smallButtonText}>Add category</Text>
                </Pressable>
              </View>
            </View>

            {review.items.length > 0 ? (
              <View style={styles.panel}>
                <Text style={styles.panelLabel}>Assignments, quizzes & exams</Text>
                <Text style={styles.panelBody}>
                  {itemsToApply} of {review.items.length} will be added. Items need a due date to be included.
                </Text>
                <View style={styles.form}>
                  {review.items.map((item, index) => (
                    <ItemEditor
                      categories={review.categories}
                      dueAt={draft.items[index]?.due_at ?? null}
                      item={item}
                      key={index}
                      onChange={(patch) => updateItem(index, patch)}
                      onRemove={() => removeItem(index)}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {review.warnings.length ? (
              <View style={styles.warningPanel}>
                <Text style={styles.warningTitle}>Review notes</Text>
                {review.warnings.map((warning) => (
                  <Text key={warning} style={styles.warningText}>
                    {"•"} {warning}
                  </Text>
                ))}
              </View>
            ) : null}

            <Text style={styles.panelBody}>
              Creates the course with {categoryCount} categor{categoryCount === 1 ? "y" : "ies"} and{" "}
              {itemsToApply} item{itemsToApply === 1 ? "" : "s"}.
            </Text>
            <View style={styles.actionRow}>
              <Pressable
                disabled={applying}
                onPress={handleApply}
                style={({ pressed }) => [styles.primaryButton, (pressed || applying) && styles.buttonPressed]}
              >
                {applying ? (
                  <ActivityIndicator color={theme.colors.surface} />
                ) : (
                  <Text style={styles.primaryText}>Create course</Text>
                )}
              </Pressable>
              <Pressable disabled={applying} onPress={startOver} style={styles.secondaryButton}>
                <Text style={styles.secondaryText}>Start over</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <View style={styles.panel}>
            <Text style={styles.panelLabel}>Add a course from its syllabus</Text>
            <Text style={styles.panelBody}>
              Snap or upload your syllabus (photo, PDF, or Word .docx). AI fills in the course, weighted categories,
              and dated assignments for you to review before saving. One file per import.
            </Text>
            <View style={styles.form}>
              <SourceButton disabled={picking} label="Take photo" onPress={() => void pickAndParse(takeSyllabusPhoto)} />
              <SourceButton disabled={picking} label="Choose photo" onPress={() => void pickAndParse(chooseSyllabusPhoto)} />
              <SourceButton
                disabled={picking}
                label="Choose PDF or Word doc"
                onPress={() => void pickAndParse(chooseSyllabusDocument)}
              />
              {picking ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={theme.colors.teal} />
                  <Text style={styles.panelBody}>Preparing your file...</Text>
                </View>
              ) : null}
              {!showPaste ? (
                <Pressable hitSlop={8} onPress={() => setShowPaste(true)} style={styles.linkButton}>
                  <Text style={styles.secondaryText}>Paste text instead</Text>
                </Pressable>
              ) : (
                <View style={styles.field}>
                  <Text style={styles.label}>Syllabus text</Text>
                  <TextInput
                    multiline
                    onChangeText={setText}
                    placeholder="Paste the grading breakdown and schedule..."
                    placeholderTextColor={theme.colors.inkMuted}
                    style={[styles.input, styles.textArea]}
                    textAlignVertical="top"
                    value={text}
                  />
                  <Pressable
                    disabled={picking || text.trim().length < MIN_TEXT_LENGTH}
                    onPress={() => void parseText()}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      (pressed || picking || text.trim().length < MIN_TEXT_LENGTH) && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.primaryText}>Parse text</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function SourceButton({ disabled, label, onPress }: { disabled: boolean; label: string; onPress: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.sourceButton, (pressed || disabled) && styles.buttonPressed]}
    >
      <Text style={styles.sourceText}>{label}</Text>
    </Pressable>
  );
}

function ItemEditor({
  categories,
  dueAt,
  item,
  onChange,
  onRemove,
}: {
  categories: ReviewCategory[];
  dueAt: string | null;
  item: ReviewItem;
  onChange: (patch: Partial<ReviewItem>) => void;
  onRemove: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const included = isSyllabusItemApplied({ include: item.include, due_at: dueAt });

  return (
    <View style={[styles.itemCard, !included && styles.itemCardExcluded]}>
      <View style={styles.rowBetween}>
        <View style={styles.includeRow}>
          <Switch
            accessibilityLabel={dueAt ? "Include this item" : "Add a due date to include"}
            disabled={!dueAt}
            onValueChange={(include) => onChange({ include })}
            thumbColor={included ? theme.colors.teal : theme.colors.paper}
            trackColor={{ false: theme.colors.line, true: theme.colors.signal }}
            value={included}
          />
          <Text style={styles.subLabel}>{dueAt ? (included ? "Included" : "Skipped") : "Needs a due date"}</Text>
        </View>
        <Pressable hitSlop={6} onPress={onRemove} style={styles.removeButton}>
          <Text style={styles.removeText}>Remove</Text>
        </Pressable>
      </View>

      <TextInput
        onChangeText={(title) => onChange({ title })}
        placeholder="Title"
        placeholderTextColor={theme.colors.inkMuted}
        style={styles.input}
        value={item.title}
      />

      <View style={styles.wrapRow}>
        {KIND_OPTIONS.map((option) => (
          <Choice
            active={item.kind === option.value}
            key={option.value}
            label={option.label}
            onPress={() => onChange({ kind: option.value })}
          />
        ))}
      </View>

      <View style={styles.timeRow}>
        <View style={styles.timeField}>
          <Text style={styles.subLabel}>Due date</Text>
          <TextInput
            autoCapitalize="none"
            onChangeText={(dueDate) => onChange({ dueDate })}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.colors.inkMuted}
            style={styles.input}
            value={item.dueDate}
          />
        </View>
        <View style={styles.timeField}>
          <Text style={styles.subLabel}>Time</Text>
          <TextInput
            autoCapitalize="none"
            onChangeText={(dueTime) => onChange({ dueTime })}
            placeholder={DEFAULT_DUE_TIME}
            placeholderTextColor={theme.colors.inkMuted}
            style={styles.input}
            value={item.dueTime}
          />
        </View>
      </View>

      <Text style={styles.subLabel}>Category</Text>
      <View style={styles.wrapRow}>
        <Choice active={!item.categoryKey} label="None" onPress={() => onChange({ categoryKey: null })} />
        {categories.map((category) =>
          category.name.trim() ? (
            <Choice
              active={item.categoryKey === category.key}
              key={category.key}
              label={category.name}
              onPress={() => onChange({ categoryKey: category.key })}
            />
          ) : null,
        )}
      </View>
    </View>
  );
}

function Choice({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <Pressable hitSlop={4} onPress={onPress} style={[styles.choiceButton, active && styles.choiceButtonActive]}>
      <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Field({
  keyboardType,
  label,
  onChangeText,
  placeholder,
  value,
}: {
  keyboardType?: "default" | "decimal-pad";
  label: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.inkMuted}
        style={styles.input}
        value={value}
      />
    </View>
  );
}

function makeStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
    screen: {
      flex: 1,
    },
    header: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderBottomColor: colors.line,
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 12,
      minHeight: 52,
      paddingHorizontal: 16,
    },
    backButton: {
      alignItems: "center",
      flexDirection: "row",
      gap: 2,
      paddingRight: 8,
      paddingVertical: 8,
    },
    backText: {
      ...theme.text("heading", "teal"),
    },
    headerTitle: {
      ...theme.text("title", "ink"),
      flexShrink: 1,
    },
    content: {
      gap: 16,
      padding: 24,
      paddingBottom: 40,
    },
    message: {
      ...theme.text("label", "teal"),
      backgroundColor: colors.surface2,
      borderColor: colors.line,
      borderRadius: 8,
      borderWidth: 1,
      padding: 10,
    },
    messageError: {
      color: colors.danger,
    },
    panel: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: 8,
      borderWidth: 1,
      gap: 8,
      padding: 16,
    },
    panelLabel: {
      ...theme.text("title", "ink"),
    },
    panelBody: {
      ...theme.text("body", "inkMuted"),
    },
    loadingRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
    },
    form: {
      gap: 12,
      marginTop: 8,
    },
    field: {
      gap: 6,
    },
    label: {
      ...theme.text("label", "ink"),
    },
    subLabel: {
      ...theme.text("label", "inkMuted"),
    },
    input: {
      ...theme.text("body", "ink"),
      backgroundColor: colors.paper,
      borderColor: colors.line,
      borderRadius: 8,
      borderWidth: 1,
      minHeight: 46,
      paddingHorizontal: 12,
    },
    textArea: {
      minHeight: 140,
      paddingVertical: 10,
    },
    rowBetween: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      justifyContent: "space-between",
    },
    totalChip: {
      backgroundColor: colors.teal,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    totalChipOff: {
      backgroundColor: colors.surface2,
    },
    totalChipText: {
      ...theme.text("label", "surface"),
    },
    totalChipTextOff: {
      color: colors.warning,
    },
    categoryRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
    },
    categoryName: {
      flex: 1,
    },
    categoryWeight: {
      width: 72,
    },
    removeButton: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 40,
      paddingHorizontal: 6,
    },
    removeText: {
      ...theme.text("label", "danger"),
    },
    itemCard: {
      borderColor: colors.line,
      borderRadius: 8,
      borderWidth: 1,
      gap: 10,
      padding: 12,
    },
    itemCardExcluded: {
      opacity: 0.72,
    },
    includeRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
    },
    timeRow: {
      flexDirection: "row",
      gap: 10,
    },
    timeField: {
      flex: 1,
      gap: 6,
    },
    wrapRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    choiceButton: {
      alignItems: "center",
      borderColor: colors.line,
      borderRadius: 8,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 40,
      paddingHorizontal: 12,
    },
    choiceButtonActive: {
      backgroundColor: colors.surface2,
      borderColor: colors.teal,
    },
    choiceText: {
      ...theme.text("label", "ink"),
    },
    choiceTextActive: {
      color: colors.teal,
    },
    warningPanel: {
      backgroundColor: colors.surface,
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
    sourceButton: {
      alignItems: "center",
      borderColor: colors.teal,
      borderRadius: 8,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 52,
      paddingHorizontal: 14,
    },
    sourceText: {
      ...theme.text("heading", "teal"),
    },
    linkButton: {
      alignSelf: "flex-start",
      minHeight: 40,
      justifyContent: "center",
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
      justifyContent: "center",
      minHeight: 52,
      minWidth: 128,
      paddingHorizontal: 14,
    },
    primaryText: {
      ...theme.text("heading", "surface"),
    },
    secondaryButton: {
      alignItems: "center",
      borderColor: colors.teal,
      borderRadius: 8,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 42,
      paddingHorizontal: 12,
    },
    secondaryText: {
      ...theme.text("label", "teal"),
    },
    smallButton: {
      alignItems: "center",
      alignSelf: "flex-start",
      borderColor: colors.teal,
      borderRadius: 8,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 40,
      paddingHorizontal: 12,
    },
    smallButtonText: {
      ...theme.text("label", "teal"),
    },
    buttonPressed: {
      opacity: 0.78,
    },
  });
}
