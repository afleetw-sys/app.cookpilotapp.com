import { Purchases } from "@revenuecat/purchases-js";

// Use the sandbox key in development so purchases hit Stripe test mode.
// In RevenueCat dashboard: create a Sandbox project and copy its Web Billing key here.
const REVENUECAT_WEB_API_KEY =
  process.env.NODE_ENV === "development"
    ? (process.env.NEXT_PUBLIC_REVENUECAT_WEB_API_KEY_SANDBOX ?? process.env.NEXT_PUBLIC_REVENUECAT_WEB_API_KEY ?? "")
    : (process.env.NEXT_PUBLIC_REVENUECAT_WEB_API_KEY ?? "");

export const ENTITLEMENT_ID = "pro";

/**
 * Shared app user ID for fetching offerings on behalf of anonymous visitors.
 * RevenueCat creates a customer record for every app user ID it sees, so
 * routing all anonymous paywall views through one fixed ID keeps drive-by
 * visitors out of the customer count. Purchases never happen under this ID —
 * the paywall re-configures with the real Firebase UID before checkout.
 */
export const OFFERINGS_PREVIEW_APP_USER_ID = "cookpilot-web-offerings-preview";

const purchaseMarkerKey = (uid: string) => `cookpilot.rcPurchased.${uid}`;

/**
 * Records that this Firebase UID completed a web purchase, so future page
 * loads know to fetch real subscription status for it even while anonymous.
 */
export function rememberWebPurchase(uid: string): void {
  try { window.localStorage.setItem(purchaseMarkerKey(uid), "1"); } catch { /* ignore */ }
}

export function hasWebPurchaseMarker(uid: string): boolean {
  try { return Boolean(window.localStorage.getItem(purchaseMarkerKey(uid))); } catch { return false; }
}

/**
 * Configure (or re-configure) the RevenueCat SDK for the given Firebase UID.
 * Safe to call multiple times — re-configures when the user changes.
 */
export function configureRevenueCat(appUserId: string): Purchases {
  return Purchases.configure(REVENUECAT_WEB_API_KEY, appUserId);
}

export { Purchases };
