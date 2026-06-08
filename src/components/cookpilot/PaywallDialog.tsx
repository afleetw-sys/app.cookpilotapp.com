"use client";

import { CheckCircle, Sparkle, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PackageType } from "@revenuecat/purchases-js";
import type { Package } from "@revenuecat/purchases-js";
import { useAuth } from "@/components/providers/AuthProvider";
import { useSubscription } from "@/components/providers/SubscriptionProvider";
import { Button } from "@/components/ui/Button";
import { ModalShell } from "@/components/cookpilot/ModalShell";
import { configureRevenueCat, ENTITLEMENT_ID } from "@/lib/revenuecat/client";

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

  // Fetch the current offering from RevenueCat
  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const purchases = configureRevenueCat(user.uid);
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
      const purchases = configureRevenueCat(user.uid);
      const { customerInfo } = await purchases.purchase({ rcPackage });
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

  return createPortal(
    <ModalShell aria-labelledby="paywall-title" onClose={onClose} variant="paywall">
      <button
        aria-label="Close"
        className="cp-paywall-card__close"
        onClick={onClose}
        type="button"
      >
        <X size={18} />
      </button>

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
    </ModalShell>,
    document.body,
  );
}
