import { initializeAppCheck, ReCaptchaV3Provider, CustomProvider } from "firebase/app-check";
import { app } from "./client";

// Extract at module level so both the debug-token block and initializeAppCheck
// use the exact same value — Next.js replaces this with a literal at build time.
const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? "";
const debugToken = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN ?? "";

// typeof window (not self) — window is always undefined on the server,
// so this block never runs during SSR where process.env substitution
// behaves differently from the compiled client bundle.
if (typeof window !== "undefined") {
  if (debugToken) {
    // @ts-ignore – Firebase App Check debug token
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  } else if (!siteKey) {
    // @ts-ignore
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
}

export const appCheck = (() => {
  if (typeof window === "undefined") return null;

  if (siteKey) {
    return initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }

  // No site key — debug/dev mode. Firebase replaces the provider with its
  // internal debug mechanism when FIREBASE_APPCHECK_DEBUG_TOKEN is set above.
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
