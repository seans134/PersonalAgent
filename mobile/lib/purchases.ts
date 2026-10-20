import { Platform } from "react-native";
import type { CustomerInfo, PurchasesPackage } from "react-native-purchases";
import type { ProPlan } from "@personal-agent/core";
import { captureException } from "./analytics";
import { getMobileEnv } from "./env";

// Atlas Pro in-app purchases through RevenueCat (react-native-purchases). The RevenueCat app user id
// is the Supabase user id, so the server's RevenueCat webhook can grant Pro to the right account.
// The app shows Pro from GET /api/mobile/subscription; the SDK is only used to buy and restore.
//
// react-native-purchases is a native module: builds made before it was added don't contain it, so it
// is loaded lazily and every call fails soft. With no API key for this platform nothing is loaded.

type PurchasesModule = typeof import("react-native-purchases").default;

let modulePromise: Promise<PurchasesModule | null> | null = null;
let configuredUserId: string | null = null;

function apiKey(): string | null {
  const env = getMobileEnv();
  const key = Platform.OS === "ios" ? env.revenueCatIosApiKey : Platform.OS === "android" ? env.revenueCatAndroidApiKey : undefined;
  return key?.trim() ? key.trim() : null;
}

/** Whether in-app purchase is set up for this build and platform. */
export function isPurchasesAvailable(): boolean {
  return apiKey() !== null;
}

async function loadPurchases(): Promise<PurchasesModule | null> {
  if (!isPurchasesAvailable()) return null;
  modulePromise ??= import("react-native-purchases")
    .then((mod) => mod.default)
    .catch((error: unknown) => {
      captureException(error, { area: "purchases_load" });
      return null;
    });
  return modulePromise;
}

/** Configures RevenueCat for the signed-in student (or switches to them). Safe to call repeatedly. */
async function purchasesFor(userId: string): Promise<PurchasesModule | null> {
  const Purchases = await loadPurchases();
  const key = apiKey();
  if (!Purchases || !key) return null;
  try {
    if (!(await Purchases.isConfigured())) {
      Purchases.configure({ apiKey: key, appUserID: userId });
      configuredUserId = userId;
    } else if (configuredUserId !== userId) {
      await Purchases.logIn(userId);
      configuredUserId = userId;
    }
    return Purchases;
  } catch (error) {
    captureException(error, { area: "purchases_configure" });
    return null;
  }
}

/** On sign-out, so the next student on this device doesn't inherit the purchase identity. */
export async function resetPurchasesUser() {
  if (!configuredUserId) return;
  const Purchases = await loadPurchases();
  configuredUserId = null;
  try {
    await Purchases?.logOut();
  } catch {
    // logOut throws for anonymous users; nothing to undo.
  }
}

export type ProPackages = Partial<Record<ProPlan, PurchasesPackage>>;

/** The current offering's monthly and annual packages (localized prices in package.product.priceString). */
export async function loadProPackages(userId: string): Promise<ProPackages> {
  const Purchases = await purchasesFor(userId);
  if (!Purchases) return {};
  const offerings = await Purchases.getOfferings();
  const current = offerings.current;
  return { monthly: current?.monthly ?? undefined, yearly: current?.annual ?? undefined };
}

export type PurchaseOutcome = "purchased" | "cancelled";

export async function purchaseProPackage(userId: string, pkg: PurchasesPackage): Promise<PurchaseOutcome> {
  const Purchases = await purchasesFor(userId);
  if (!Purchases) throw new Error("Purchases aren't available in this version of the app.");
  try {
    await Purchases.purchasePackage(pkg);
    return "purchased";
  } catch (error) {
    if ((error as { userCancelled?: boolean | null })?.userCancelled) return "cancelled";
    throw new Error("The purchase didn't go through. You weren't charged.");
  }
}

/** The store purchase is already tied to a different RevenueCat (Atlas) user. */
export class PurchaseOwnedByOtherAccountError extends Error {
  constructor() {
    super("This purchase belongs to another Atlas account.");
  }
}

// RevenueCat PURCHASES_ERROR_CODE values: RECEIPT_ALREADY_IN_USE_ERROR, RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER_ERROR.
const RECEIPT_IN_USE_CODES = new Set(["7", "13"]);

/** Restores App Store / Play purchases to this account. Returns the store's view of active entitlements. */
export async function restoreProPurchases(userId: string): Promise<CustomerInfo> {
  const Purchases = await purchasesFor(userId);
  if (!Purchases) throw new Error("Purchases aren't available in this version of the app.");
  try {
    return await Purchases.restorePurchases();
  } catch (error) {
    if (RECEIPT_IN_USE_CODES.has(String((error as { code?: unknown })?.code))) throw new PurchaseOwnedByOtherAccountError();
    throw new Error("Unable to restore purchases. Please try again.");
  }
}

/** The store's subscription management page (App Store / Play), when the student bought in the app. */
export async function purchasesManagementUrl(userId: string): Promise<string | null> {
  const Purchases = await purchasesFor(userId);
  if (!Purchases) return null;
  try {
    return (await Purchases.getCustomerInfo()).managementURL ?? null;
  } catch {
    return null;
  }
}
