"use client";

import { useEffect } from "react";
import { captureAttributionFromUrl } from "@/lib/cookpilot/attribution";

// Captures first-touch UTM attribution on the visitor's first landing. Mounted
// once at the app root so it runs regardless of which page the visitor arrives
// on, and persists the values before client-side navigation drops the query.
export function AttributionTracker() {
  useEffect(() => {
    captureAttributionFromUrl();
  }, []);

  return null;
}
