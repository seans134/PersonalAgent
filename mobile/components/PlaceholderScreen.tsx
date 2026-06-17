import { ScrollView, StyleSheet, Text, View } from "react-native";

type PlaceholderScreenProps = {
  label: string;
};

export function PlaceholderScreen({ label }: PlaceholderScreenProps) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.panel}>
        <Text style={styles.eyebrow}>{label}</Text>
        <Text style={styles.title}>This section is ready for the next port.</Text>
        <Text style={styles.body}>
          The menu route exists now, so we can bring this web workflow over without changing navigation again.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 24,
  },
  panel: {
    backgroundColor: "#ffffff",
    borderColor: "#d8e1ea",
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
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
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 30,
    marginTop: 8,
  },
  body: {
    color: "#475569",
    fontSize: 16,
    lineHeight: 23,
    marginTop: 10,
  },
});
