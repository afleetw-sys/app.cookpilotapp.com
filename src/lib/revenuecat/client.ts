import { Purchases } from "@revenuecat/purchases-js";

const REVENUECAT_WEB_API_KEY = process.env.NEXT_PUBLIC_REVENUECAT_WEB_API_KEY ?? "";
export const ENTITLEMENT_ID = "pro";

/**
 * Configure (or re-configure) the RevenueCat SDK for the given Firebase UID.
 * Safe to call multiple times — re-configures when the user changes.
 */
export function configureRevenueCat(appUserId: string): Purchases {
  return Purchases.configure(REVENUECAT_WEB_API_KEY, appUserId);
}

export { Purchases };
