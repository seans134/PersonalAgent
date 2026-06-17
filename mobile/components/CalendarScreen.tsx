import { ScrollView, StyleSheet, Text, View } from "react-native";
import { CalendarImportPanel } from "./CalendarImportPanel";

type CalendarScreenProps = {
  accessToken: string;
};

export function CalendarScreen({ accessToken }: CalendarScreenProps) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Local calendar</Text>
        <Text style={styles.title}>Classes and schedule from web.</Text>
        <Text style={styles.body}>
          This mirrors the local calendar data already saved in the web app.
        </Text>
      </View>
      <CalendarImportPanel accessToken={accessToken} />
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
