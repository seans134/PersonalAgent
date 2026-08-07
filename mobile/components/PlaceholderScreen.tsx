import { useMemo } from "react";
import { useTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";
import { ScrollView, StyleSheet, Text, View } from "react-native";

type PlaceholderScreenProps = {
  label: string;
};

export function PlaceholderScreen({ label }: PlaceholderScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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

function makeStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
  content: {
    padding: 24,
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  eyebrow: {
    ...theme.text("monoLabel", "teal"),
  },
  title: {
    ...theme.text("displayLg", "ink"),
    marginTop: 8,
  },
  body: {
    ...theme.text("bodyLg", "inkMuted"),
    marginTop: 10,
  },
});
}
