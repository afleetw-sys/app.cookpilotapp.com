"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

type ModalVariant = "confirm" | "import" | "settings" | "paywall" | "measurements";

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
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocusedElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const preferredFocusElement = cardRef.current?.querySelector<HTMLElement>(
      "[autofocus], [data-autofocus='true']",
    );
    const focusableElements = getFocusableElements(cardRef.current);
    const firstFocusableElement = preferredFocusElement ?? focusableElements[0];

    if (firstFocusableElement) {
      firstFocusableElement.focus();
    } else {
      cardRef.current?.focus();
    }

    return () => {
      if (previouslyFocusedElement?.isConnected) {
        previouslyFocusedElement.focus();
      }
    };
  }, []);

  if (typeof document === "undefined") return null;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab") return;

    const focusableElements = getFocusableElements(cardRef.current);
    if (focusableElements.length === 0) {
      event.preventDefault();
      cardRef.current?.focus();
      return;
    }

    const firstFocusableElement = focusableElements[0];
    const lastFocusableElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

    if (event.shiftKey && activeElement === firstFocusableElement) {
      event.preventDefault();
      lastFocusableElement.focus();
    } else if (!event.shiftKey && activeElement === lastFocusableElement) {
      event.preventDefault();
      firstFocusableElement.focus();
    }
  }

  return createPortal(
    <div className="cp-modal-backdrop" onClick={onClose}>
      <div
        aria-labelledby={ariaLabelledBy}
        aria-modal="true"
        className={cardClass(variant)}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        ref={cardRef}
        role="dialog"
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];

  return Array.from(
    container.querySelectorAll<HTMLElement>(
      [
        "a[href]",
        "button:not([disabled])",
        "input:not([disabled])",
        "select:not([disabled])",
        "textarea:not([disabled])",
        "[tabindex]:not([tabindex='-1'])",
      ].join(","),
    ),
  ).filter((element) => {
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  });
}
