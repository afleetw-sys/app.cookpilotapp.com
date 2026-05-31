"use client";

import type { ReactNode } from "react";

type ModalVariant = "import" | "settings" | "paywall";

function cardClass(variant: ModalVariant): string {
  if (variant === "paywall") return "cp-modal-card cp-paywall-card";
  return `cp-modal-card cp-modal-card--${variant}`;
}

export function ModalShell({
  onClose,
  variant,
  children,
  "aria-labelledby": ariaLabelledBy,
}: {
  onClose: () => void;
  variant: ModalVariant;
  children: ReactNode;
  "aria-labelledby"?: string;
}) {
  return (
    <div aria-hidden="true" className="cp-modal-backdrop" onClick={onClose}>
      <div
        aria-labelledby={ariaLabelledBy}
        aria-modal="true"
        className={cardClass(variant)}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        {children}
      </div>
    </div>
  );
}
