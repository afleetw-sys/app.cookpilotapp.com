"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

type ModalVariant = "import" | "settings" | "paywall" | "measurements";

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
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="cp-modal-backdrop" onClick={onClose}>
      <div
        aria-labelledby={ariaLabelledBy}
        aria-modal="true"
        className={cardClass(variant)}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
