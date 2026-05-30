"use client";

import { CheckCircle, Sparkle, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";

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
  return (
    <div className="cp-modal-backdrop" onClick={onClose}>
      <div
        className="cp-modal-card cp-paywall-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="paywall-title"
      >
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
            Premium gives you unlimited access to AI-powered recipe editing and more.
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
          <p className="cp-paywall-card__platform-note">
            Subscribe through the CookPilot iOS or Mac app to unlock premium on all your devices.
          </p>
          <Button onClick={onClose} variant="secondary" size="default">
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}
