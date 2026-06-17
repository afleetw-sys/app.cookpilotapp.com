"use client";

import { CheckCircle, Sparkle } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { PackageType } from "@revenuecat/purchases-js";
import type { Package } from "@revenuecat/purchases-js";
import { useAuth } from "@/components/providers/AuthProvider";
import { useSubscription } from "@/components/providers/SubscriptionProvider";
import { Button } from "@/components/ui/Button";
import { ModalShell } from "@/components/cookpilot/ModalShell";
import {
  configureRevenueCat,
  ENTITLEMENT_ID,
  hasWebPurchaseMarker,
  OFFERINGS_PREVIEW_APP_USER_ID,
  rememberWebPurchase,
} from "@/lib/revenuecat/client";

const BENEFITS = [
  {
    title: "Unlimited AI edits",
    description: "Make as many recipe tweaks as you want",
  },
  {
    title: "Priority processing",
    description: "Get faster AI responses",
  },
  {
    title: "Advanced features",
    description: "Access to new features as they launch",
  },
];

export function PaywallDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { refreshSubscriptionStatus } = useSubscription();
  const [rcPackage, setRcPackage] = useState<Package | null>(null);
  const [loadingOfferings, setLoadingOfferings] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Fetch the current offering from RevenueCat. Anonymous visitors who have
  // never purchased browse offerings under a shared preview ID so that merely
  // opening the paywall doesn't register their throwaway UID as a customer.
  useEffect(() => {
    if (!user) return;
    const offeringsAppUserId =
      user.isAnonymous && !hasWebPurchaseMarker(user.uid)
        ? OFFERINGS_PREVIEW_APP_USER_ID
        : user.uid;
    void (async () => {
      try {
        const purchases = configureRevenueCat(offeringsAppUserId);
        const offerings = await purchases.getOfferings();
        const pkg = offerings.current?.availablePackages[0] ?? null;
        setRcPackage(pkg);
      } catch (err) {
        console.error("[PaywallDialog] failed to load offerings", err);
      } finally {
        setLoadingOfferings(false);
      }
    })();
  }, [user]);

  async function handlePurchase() {
    if (!user || !rcPackage) return;
    setPurchasing(true);
    setPurchaseError(null);
    try {
      // The displayed package may have been fetched under the shared preview
      // ID; re-configure with the real UID and re-resolve the package from
      // that instance so the purchase is attributed to this user.
      const purchases = configureRevenueCat(user.uid);
      const offerings = await purchases.getOfferings();
      const purchasablePackage =
        offerings.current?.availablePackages.find(
          (candidate) => candidate.identifier === rcPackage.identifier
        ) ?? rcPackage;
      const { customerInfo } = await purchases.purchase({ rcPackage: purchasablePackage });
      // Mark this UID as a purchaser so future sessions fetch real
      // subscription status even while the user is anonymous.
      rememberWebPurchase(user.uid);
      if (customerInfo.entitlements.active[ENTITLEMENT_ID]) {
        await refreshSubscriptionStatus();
        onClose();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // User-cancelled checkout — don't show an error
      if (msg.toLowerCase().includes("cancel")) {
        setPurchasing(false);
        return;
      }
      setPurchaseError("Something went wrong. Please try again.");
      console.error("[PaywallDialog] purchase failed", err);
    } finally {
      setPurchasing(false);
    }
  }

  const priceLabel = rcPackage?.webBillingProduct?.currentPrice
    ? `${rcPackage.webBillingProduct.currentPrice.formattedPrice} / ${rcPackage.packageType === PackageType.Annual ? "year" : "month"}`
    : null;

  return (
    <ModalShell aria-labelledby="paywall-title" onClose={onClose} variant="paywall">
      <div className="cp-paywall-card__header">
        <Sparkle className="cp-paywall-card__icon" size={28} weight="fill" />
        <h2 className="cp-paywall-card__title" id="paywall-title">
          Get more smart edits
        </h2>
        <p className="cp-paywall-card__subtitle">
          Unlimited AI-powered recipe editing and more.
        </p>
      </div>

      <ul className="cp-paywall-benefits">
        {BENEFITS.map((benefit) => (
          <li className="cp-paywall-benefit" key={benefit.title}>
            <CheckCircle className="cp-paywall-benefit__icon" size={20} weight="fill" />
            <div>
              <p className="cp-paywall-benefit__title">{benefit.title}</p>
              <p className="cp-paywall-benefit__desc">{benefit.description}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="cp-paywall-card__cta">
        {purchaseError ? (
          <p className="cp-paywall-card__error">{purchaseError}</p>
        ) : null}
        {rcPackage ? (
          <Button
            disabled={purchasing}
            onClick={() => void handlePurchase()}
          >
            <Sparkle size={16} weight="fill" />
            {purchasing ? "Opening checkout…" : `Subscribe${priceLabel ? ` — ${priceLabel}` : ""}`}
          </Button>
        ) : loadingOfferings ? (
          <Button disabled>Loading…</Button>
        ) : (
          <p className="cp-paywall-card__platform-note">
            Subscribe through the CookPilot iOS or Mac app to unlock premium.
          </p>
        )}
        <Button onClick={onClose} variant="secondary" size="default">
          Maybe later
        </Button>
      </div>
    </ModalShell>
  );
}
