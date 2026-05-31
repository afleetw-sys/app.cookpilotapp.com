import { Purchases } from "@revenuecat/purchases-js";

// Use the sandbox key in development so purchases hit Stripe test mode.
// In RevenueCat dashboard: create a Sandbox project and copy its Web Billing key here.
const REVENUECAT_WEB_API_KEY =
  process.env.NODE_ENV === "development"
    ? (process.env.NEXT_PUBLIC_REVENUECAT_WEB_API_KEY_SANDBOX ?? process.env.NEXT_PUBLIC_REVENUECAT_WEB_API_KEY ?? "")
    : (process.env.NEXT_PUBLIC_REVENUECAT_WEB_API_KEY ?? "");

export const ENTITLEMENT_ID = "pro";

/**
 * Configure (or re-configure) the RevenueCat SDK for the given Firebase UID.
 * Safe to call multiple times — re-configures when the user changes.
 */
export function configureRevenueCat(appUserId: string): Purchases {
  return Purchases.configure(REVENUECAT_WEB_API_KEY, appUserId);
}

export { Purchases };
