"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  captureAttributionFromUrl,
  stripUtmParamsFromUrl,
} from "@/lib/cookpilot/attribution";
import { persistStoredAttributionToUserDocument } from "@/lib/cookpilot/firestore";
import { auth } from "@/lib/firebase/client";

// Delay (ms) after page load before stripping UTM params, giving analytics
// (e.g. GA's automatic page_view, which fires on load) time to read the
// original URL with its campaign params before we clean them away.
const UTM_CLEANUP_DELAY_MS = 1200;

// Captures first-touch UTM attribution on the visitor's first landing, then
// cleans the UTM params out of the visible URL once the pageview has been
// recorded. Mounted once at the app root so it runs regardless of landing page.
export function AttributionTracker() {
  useEffect(() => {
    // Capture immediately so attribution is persisted before any later
    // navigation can drop the query string.
    captureAttributionFromUrl();

    let timer: number | undefined;
    let cancelled = false;

    const persistAttribution = (userId: string | undefined) => {
      if (!userId) return;
      void persistStoredAttributionToUserDocument(userId).catch((error) => {
        if (!cancelled) {
          console.error("[Attribution] Failed to persist first-touch attribution", error);
        }
      });
    };

    persistAttribution(auth.currentUser?.uid);

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      persistAttribution(user?.uid);
    });

    const scheduleCleanup = () => {
      timer = window.setTimeout(stripUtmParamsFromUrl, UTM_CLEANUP_DELAY_MS);
    };

    // Wait until the page has fully loaded so the analytics pageview fires
    // first, then delay slightly before stripping the params.
    if (document.readyState === "complete") {
      scheduleCleanup();
    } else {
      window.addEventListener("load", scheduleCleanup, { once: true });
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("load", scheduleCleanup);
      unsubscribeAuth();
    };
  }, []);

  return null;
}
