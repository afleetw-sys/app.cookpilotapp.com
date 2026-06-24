"use client";

import Image from "next/image";
import { useSyncExternalStore } from "react";

const APP_STORE_URL = "https://apps.apple.com/app/cookpilot/id6753838076";
const DISMISSAL_KEY = "cookpilot.iosAppBannerDismissed";
const listeners = new Set<() => void>();

function isIPhone() {
  return /iPhone/i.test(window.navigator.userAgent);
}

function shouldShowBanner() {
  if (typeof window === "undefined" || !isIPhone() || isSafari()) return false;

  try {
    return window.localStorage.getItem(DISMISSAL_KEY) !== "1";
  } catch {
    // If storage is unavailable, still offer the App Store link.
    return true;
  }
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function isSafari() {
  const { userAgent, vendor } = window.navigator;

  return (
    vendor === "Apple Computer, Inc." &&
    /Safari/i.test(userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|DuckDuckGo|GSA|FBAN|FBAV|Instagram|LinkedInApp/i.test(userAgent)
  );
}

export function IosAppBanner() {
  const visible = useSyncExternalStore(subscribe, shouldShowBanner, () => false);

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISSAL_KEY, "1");
    } catch {
      // The in-memory state below is enough for this visit.
    }
    listeners.forEach((listener) => listener());
  }

  if (!visible) return null;

  return (
    <aside className="cp-ios-app-banner" aria-label="Get the CookPilot app">
      <Image alt="CookPilot" className="cp-ios-app-banner__icon" height={48} src="/images/cp-logo-lg.png" width={48} />
      <div className="cp-ios-app-banner__copy">
        <strong>CookPilot</strong>
        <span>Get the app</span>
      </div>
      <a className="cp-ios-app-banner__link" href={APP_STORE_URL}>
        View
      </a>
      <button
        aria-label="Dismiss app banner"
        className="cp-ios-app-banner__dismiss"
        onClick={dismiss}
        type="button"
      >
        <span aria-hidden="true">×</span>
      </button>
    </aside>
  );
}
