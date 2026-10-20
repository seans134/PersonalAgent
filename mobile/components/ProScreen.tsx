import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  FREE_SYLLABUS_IMPORTS_PER_TERM,
  PRO_PLANS,
  PRO_PRICE_LABELS,
  analyticsEvents,
  describeEntitlement,
  type PaywallTrigger,
  type ProPlan,
  type SubscriptionStatusResponse,
} from "@personal-agent/core";
import { captureEvent } from "../lib/analytics";
import { fetchSubscriptionStatus } from "../lib/api";
import { getMobileEnv } from "../lib/env";
import {
  PurchaseOwnedByOtherAccountError,
  isPurchasesAvailable,
  loadProPackages,
  purchaseProPackage,
  purchasesManagementUrl,
  restoreProPurchases,
  type ProPackages,
} from "../lib/purchases";
import { useTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";

type ProScreenProps = {
  accessToken: string;
  userId: string;
  trigger: PaywallTrigger;
};

const FREE_FEATURES = ["Today plan", "Calendar", "Courses & grades", "Study timer", "GPA", "LMS deadline feed"];

// After a purchase the store's webhook reaches Atlas within seconds; re-check the server a few times.
const CONFIRM_ATTEMPTS = 5;
const CONFIRM_DELAY_MS = 2000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Shown when the server still doesn't have Pro after polling; honest about what happened and what to do.
const PENDING_COPY = {
  purchase:
    "Your purchase went through, but Atlas hasn't confirmed it yet. Tap Check again in a few minutes. If Pro still isn't on, contact support and include the email you sign in with.",
  otherAccount:
    "This App Store or Google Play purchase belongs to a different Atlas account, so Pro can't be turned on here. Sign in to that account to use Pro, or contact support to move it to this one.",
} as const;

function supportUrl(): string | null {
  const env = getMobileEnv();
  const base = (env.websiteUrl ?? env.apiBaseUrl ?? "").replace(/\/$/, "");
  return base ? `${base}/support` : null;
}

export function ProScreen({ accessToken, userId, trigger }: ProScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [status, setStatus] = useState<SubscriptionStatusResponse | null>(null);
  const [packages, setPackages] = useState<ProPackages>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<ProPlan | "restore" | "manage" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Pro hasn't reached the server: after a purchase (webhook slow or failed) or a restore of a
  // purchase owned by another Atlas account.
  const [pending, setPending] = useState<keyof typeof PENDING_COPY | null>(null);
  const [checking, setChecking] = useState(false);
  const trackedRef = useRef(false);
  const mountedRef = useRef(true);
  const storeAvailable = isPurchasesAvailable();
  const canBuy = storeAvailable && Boolean(packages.monthly || packages.yearly);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const next = await fetchSubscriptionStatus(accessToken);
    if (mountedRef.current) setStatus(next);
    return next;
  }, [accessToken]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [next, offered] = await Promise.all([
          fetchSubscriptionStatus(accessToken),
          loadProPackages(userId).catch(() => ({}) as ProPackages),
        ]);
        if (!active) return;
        setStatus(next);
        setPackages(offered);
        if (!trackedRef.current && !next.isPro) {
          trackedRef.current = true;
          captureEvent(analyticsEvents.paywallViewed, {
            trigger,
            surface: "mobile",
            available: storeAvailable && Boolean(offered.monthly || offered.yearly),
          });
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load Atlas Pro.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [accessToken, userId, trigger, storeAvailable]);

  /** Polls the server until it shows Pro (the webhook has landed). */
  async function confirmWithServer(): Promise<boolean> {
    for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt += 1) {
      const next = await refresh().catch(() => null);
      if (next?.isPro) return true;
      if (!mountedRef.current) return false;
      await wait(CONFIRM_DELAY_MS);
    }
    return false;
  }

  async function buy(plan: ProPlan) {
    const pkg = packages[plan];
    if (!pkg || busy) return;
    setBusy(plan);
    setError("");
    setNotice("");
    setPending(null);
    try {
      const outcome = await purchaseProPackage(userId, pkg);
      if (outcome === "purchased") {
        captureEvent(analyticsEvents.subscriptionStarted, { plan });
        const confirmed = await confirmWithServer();
        if (mountedRef.current) {
          if (confirmed) setNotice("Thanks for supporting Atlas! Pro is active.");
          else setPending("purchase");
        }
      }
    } catch (buyError) {
      if (mountedRef.current) setError(buyError instanceof Error ? buyError.message : "The purchase didn't go through.");
    }
    if (mountedRef.current) setBusy(null);
  }

  async function restore() {
    if (busy) return;
    setBusy("restore");
    setError("");
    setNotice("");
    setPending(null);
    try {
      const info = await restoreProPurchases(userId);
      const storeHasPro = Object.keys(info.entitlements.active).length > 0;
      const confirmed = storeHasPro ? await confirmWithServer() : false;
      if (mountedRef.current) {
        if (confirmed) setNotice("Purchases restored. Pro is active.");
        // The store has Pro but Atlas never got it: RevenueCat moved (transferred) a purchase made on
        // another Atlas account, which Atlas doesn't apply automatically.
        else if (storeHasPro) setPending("otherAccount");
        else setNotice("No Atlas Pro purchase was found for this App Store or Google Play account.");
      }
    } catch (restoreError) {
      if (!mountedRef.current) return;
      if (restoreError instanceof PurchaseOwnedByOtherAccountError) setPending("otherAccount");
      else setError(restoreError instanceof Error ? restoreError.message : "Unable to restore purchases.");
    }
    if (mountedRef.current) setBusy(null);
  }

  async function checkAgain() {
    if (checking) return;
    setChecking(true);
    try {
      const next = await refresh();
      if (next.isPro && mountedRef.current) {
        setPending(null);
        setNotice("Thanks for supporting Atlas! Pro is active.");
      }
    } catch (checkError) {
      if (mountedRef.current) setError(checkError instanceof Error ? checkError.message : "Unable to load Atlas Pro.");
    }
    if (mountedRef.current) setChecking(false);
  }

  async function manage() {
    if (busy || !status?.entitlement) return;
    setBusy("manage");
    setError("");
    try {
      let url: string | null = null;
      if (status.entitlement.source === "revenuecat") {
        url = await purchasesManagementUrl(userId);
      } else {
        // Bought on the web: billing is managed on the Atlas website.
        const base = (getMobileEnv().websiteUrl ?? getMobileEnv().apiBaseUrl ?? "").replace(/\/$/, "");
        url = base ? `${base}/pro` : null;
      }
      if (!url) throw new Error("Manage your subscription in your App Store or Google Play settings.");
      await Linking.openURL(url);
    } catch (manageError) {
      if (mountedRef.current) setError(manageError instanceof Error ? manageError.message : "Unable to open billing.");
    }
    if (mountedRef.current) setBusy(null);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.teal} />
      </View>
    );
  }

  const usage = status?.usage.syllabusImports;
  const description = status?.entitlement ? describeEntitlement(status.entitlement) : null;

  return (
    <ScrollView style={{ backgroundColor: theme.colors.paper }} contentContainerStyle={styles.content}>
      {notice ? <Text style={[theme.text("body", "teal"), styles.message]}>{notice}</Text> : null}
      {error ? <Text style={[theme.text("body", "danger"), styles.message]}>{error}</Text> : null}
      {pending && !status?.isPro ? (
        <View style={styles.card}>
          <Text style={theme.text("body", "ink")}>{PENDING_COPY[pending]}</Text>
          <View style={styles.pendingActions}>
            {pending === "purchase" ? (
              <Pressable accessibilityRole="button" disabled={busy !== null} onPress={() => void checkAgain()} style={styles.link}>
                <Text style={theme.text("label", "teal")}>{checking ? "Checking…" : "Check again"}</Text>
              </Pressable>
            ) : null}
            {supportUrl() ? (
              <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(supportUrl()!)} style={styles.link}>
                <Text style={theme.text("label", "teal")}>Contact support</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {status?.isPro ? (
        <View style={styles.card}>
          <View style={styles.badge}>
            <Text style={theme.text("monoLabel", "onTeal")}>Pro · Supporting Atlas</Text>
          </View>
          {description ? <Text style={theme.text("body", "ink")}>{description}</Text> : null}
          <Text style={theme.text("body", "inkMuted")}>
            Unlimited syllabus imports are on. Thank you for helping keep Atlas running.
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={busy !== null}
            onPress={() => void manage()}
            style={({ pressed }) => [styles.secondaryButton, (pressed || busy === "manage") && styles.pressed]}
          >
            <Text style={theme.text("label", "ink")}>Manage subscription</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={theme.text("heading", "ink")}>Unlimited syllabus imports</Text>
          <Text style={theme.text("body", "inkMuted")}>
            Free accounts can import {FREE_SYLLABUS_IMPORTS_PER_TERM} syllabi a term. Pro removes the limit and shows a
            Supporting Atlas badge on your profile.
          </Text>
          {status?.limitsEnforced && usage && usage.limit !== null ? (
            <Text style={theme.text("body", "ink")}>
              {usage.used} of {usage.limit} free imports used for {usage.term}.
            </Text>
          ) : null}

          {canBuy ? (
            <View style={styles.plans}>
              {PRO_PLANS.map((plan) => {
                const pkg = packages[plan];
                if (!pkg) return null;
                return (
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy !== null}
                    key={plan}
                    onPress={() => void buy(plan)}
                    style={({ pressed }) => [styles.plan, (pressed || busy === plan) && styles.pressed]}
                  >
                    <Text style={theme.text("monoLabel", "inkMuted")}>{plan === "yearly" ? "Yearly" : "Monthly"}</Text>
                    <Text style={theme.text("title", "ink")}>
                      {pkg.product.priceString || PRO_PRICE_LABELS[plan].price} / {PRO_PRICE_LABELS[plan].period}
                    </Text>
                    <Text style={theme.text("label", "teal")}>{busy === plan ? "Opening…" : "Upgrade"}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={[theme.text("body", "inkMuted"), styles.soon]}>Pro is coming soon.</Text>
          )}
        </View>
      )}

      {storeAvailable ? (
        <Pressable accessibilityRole="button" disabled={busy !== null} onPress={() => void restore()} style={styles.link}>
          <Text style={theme.text("label", "teal")}>{busy === "restore" ? "Restoring…" : "Restore purchases"}</Text>
        </Pressable>
      ) : null}

      <View style={styles.freeCard}>
        <Text style={theme.text("label", "ink")}>Always free</Text>
        {FREE_FEATURES.map((feature) => (
          <Text key={feature} style={theme.text("body", "inkMuted")}>
            {feature}
          </Text>
        ))}
      </View>

      {canBuy ? (
        <Text style={theme.text("body", "inkMuted")}>
          Subscriptions renew automatically until canceled in your App Store or Google Play settings.
        </Text>
      ) : null}
    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  const { colors, space, radius } = theme;
  return StyleSheet.create({
    center: { alignItems: "center", flex: 1, justifyContent: "center", padding: space.lg },
    content: { gap: space.base, padding: space.lg, paddingBottom: space["3xl"] },
    message: { paddingHorizontal: space.xs },
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: radius.card,
      borderWidth: 1,
      gap: space.sm,
      padding: space.base,
    },
    badge: {
      alignSelf: "flex-start",
      backgroundColor: colors.teal,
      borderRadius: 999,
      paddingHorizontal: space.md,
      paddingVertical: space.xs,
    },
    plans: { gap: space.sm, marginTop: space.xs },
    plan: {
      backgroundColor: colors.surface2,
      borderColor: colors.line,
      borderRadius: radius.control,
      borderWidth: 1,
      gap: space.xs,
      padding: space.base,
    },
    soon: {
      backgroundColor: colors.surface2,
      borderRadius: radius.control,
      padding: space.md,
    },
    secondaryButton: {
      alignItems: "center",
      borderColor: colors.line,
      borderRadius: radius.control,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 44,
    },
    pressed: { opacity: 0.65 },
    link: { alignItems: "center", paddingVertical: space.sm },
    pendingActions: { flexDirection: "row", gap: space.base },
    freeCard: {
      borderColor: colors.line,
      borderRadius: radius.card,
      borderWidth: 1,
      gap: space.xs,
      padding: space.base,
    },
  });
}
