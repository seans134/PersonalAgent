import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { CalendarEditorPanel } from "./CalendarEditorPanel";
import { CalendarImportPanel } from "./CalendarImportPanel";

type CalendarScreenProps = {
  accessToken: string;
};

export function CalendarScreen({ accessToken }: CalendarScreenProps) {
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Local calendar</Text>
        <Text style={styles.title}>Classes and schedule.</Text>
        <Text style={styles.body}>
          Changes here stay synchronized with the web app and daily planner.
        </Text>
      </View>
      <CalendarImportPanel accessToken={accessToken} reloadKey={reloadKey} />
      <CalendarEditorPanel accessToken={accessToken} onChanged={() => setReloadKey((value) => value + 1)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 18,
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    gap: 8,
  },
  eyebrow: {
    color: "#0f766e",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  title: {
    color: "#111827",
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 34,
  },
  body: {
    color: "#475569",
    fontSize: 16,
    lineHeight: 23,
  },
});
