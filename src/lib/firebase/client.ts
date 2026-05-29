import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function resolveEnv(value: string | undefined, key: string): string {
  if (value) return value;
  if (typeof window === "undefined") {
    return `missing-${key.toLowerCase()}`;
  }
  throw new Error(`Missing Firebase env var: ${key}`);
}

/** gs:// URL for getStorage — required when using a non-default or legacy bucket. */
export function storageBucketGsUrl(bucket: string): string {
  const trimmed = bucket.trim();
  if (trimmed.startsWith("gs://")) return trimmed;
  return `gs://${trimmed}`;
}

export const app =
  getApps().length > 0
    ? getApp()
    : initializeApp({
        apiKey: resolveEnv(firebaseConfig.apiKey, "NEXT_PUBLIC_FIREBASE_API_KEY"),
        authDomain: resolveEnv(
          firebaseConfig.authDomain,
          "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
        ),
        projectId: resolveEnv(
          firebaseConfig.projectId,
          "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
        ),
        storageBucket: resolveEnv(
          firebaseConfig.storageBucket,
          "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
        ),
        messagingSenderId: resolveEnv(
          firebaseConfig.messagingSenderId,
          "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
        ),
        appId: resolveEnv(firebaseConfig.appId, "NEXT_PUBLIC_FIREBASE_APP_ID"),
      });

export const auth = getAuth(app);
// authReady resolves once Firebase has finished loading the persisted user from
// storage. Using auth.authStateReady() (instead of the redundant setPersistence call
// that was here before) avoids a race where setPersistence resets the persistence
// layer mid-startup, causing onAuthStateChanged to fire null before the stored
// anonymous user can be rehydrated — which was creating a new anonymous user on
// every page refresh.
export const authReady: Promise<void> = auth.authStateReady();
