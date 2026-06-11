"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  configureRevenueCat,
  ENTITLEMENT_ID,
  hasWebPurchaseMarker,
} from "@/lib/revenuecat/client";

type SubscriptionContextValue = {
  isSubscribed: boolean;
  isLoading: boolean;
  /** Re-fetch customer info from RevenueCat (e.g. after a purchase). */
  refreshSubscriptionStatus: () => Promise<void>;
};

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // Track the last UID we configured RC for to avoid redundant fetches.
  const lastConfiguredUidRef = useRef<string | null>(null);

  const fetchStatus = useCallback(async (uid: string) => {
    try {
      const purchases = configureRevenueCat(uid);
      const customerInfo = await purchases.getCustomerInfo();
      setIsSubscribed(
        customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined
      );
    } catch (error) {
      console.error("[SubscriptionProvider] failed to fetch customer info", error);
      setIsSubscribed(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Re-configure RC and re-fetch whenever the Firebase UID changes.
  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    if (user.uid === lastConfiguredUidRef.current) return;

    lastConfiguredUidRef.current = user.uid;

    // Contacting RevenueCat registers the UID as a customer, and anonymous
    // visitors mint a fresh UID per browser session — so only fetch for
    // anonymous users when this browser has evidence of a past purchase.
    // Everyone else can't have an entitlement yet.
    if (user.isAnonymous && !hasWebPurchaseMarker(user.uid)) {
      setIsSubscribed(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    void fetchStatus(user.uid);
  }, [user, fetchStatus]);

  const refreshSubscriptionStatus = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    await fetchStatus(user.uid);
  }, [user, fetchStatus]);

  return (
    <SubscriptionContext.Provider
      value={{ isSubscribed, isLoading, refreshSubscriptionStatus }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const value = useContext(SubscriptionContext);
  if (!value) {
    throw new Error("useSubscription must be used inside SubscriptionProvider");
  }
  return value;
}
