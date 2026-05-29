import { initializeAppCheck, ReCaptchaV3Provider, CustomProvider } from "firebase/app-check";
import { app } from "./client";

// ── Debug mode (development) ───────────────────────────────────────────────────
// ReCaptchaV3Provider loads the reCAPTCHA script at init time and rejects
// any non-real site key, so we skip it entirely when no key is configured.
// Instead we use a no-op CustomProvider — Firebase's debug mechanism intercepts
// the token exchange before getToken() is ever called.
//
// Steps to get a stable debug token:
// 1. Start the dev server with both NEXT_PUBLIC_RECAPTCHA_SITE_KEY and
//    NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN left blank.
// 2. Open the browser console and look for:
//      "App Check debug token: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
// 3. Register that UUID at:
//      Firebase Console → App Check → Apps → [CookPilot Web] → Manage debug tokens
// 4. Paste the UUID into NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN in .env.local
//    so the same token is reused across dev-server restarts.
//
// ── Production ────────────────────────────────────────────────────────────────
// Create a reCAPTCHA v3 site key at https://www.google.com/recaptcha/admin
// and set it as NEXT_PUBLIC_RECAPTCHA_SITE_KEY. Leave the debug token blank.

if (typeof self !== "undefined") {
  const debugToken = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN;
  if (debugToken) {
    // Use the pinned debug UUID from the environment.
    // @ts-ignore – Firebase App Check debug token
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  } else if (!process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) {
    // Auto-generate a debug UUID and log it to the browser console.
    // @ts-ignore
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
}

// initializeAppCheck must only run in the browser (App Check uses DOM APIs).
export const appCheck = (() => {
  if (typeof window === "undefined") return null;

  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

  if (siteKey) {
    // Production path: real reCAPTCHA v3 provider.
    return initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }

  // Debug / development path: no-op CustomProvider.
  // Firebase replaces this with its internal debug provider when
  // FIREBASE_APPCHECK_DEBUG_TOKEN is set above, so getToken() is never called.
  return initializeAppCheck(app, {
    provider: new CustomProvider({
      getToken: () =>
        Promise.resolve({
          token: "debug-placeholder",
          expireTimeMillis: Date.now() + 3_600_000,
        }),
    }),
    isTokenAutoRefreshEnabled: true,
  });
})();
