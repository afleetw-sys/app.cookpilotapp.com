"use client";

import {
  EmailAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  linkWithCredential,
  linkWithPopup,
  onAuthStateChanged,
  reauthenticateWithPopup,
  reauthenticateWithCredential,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { auth } from "@/lib/firebase/client";
// Side-effect import: initialises Firebase App Check before any Storage operation.
// App Check is enforced on this project's Storage bucket; without it uploads return 401.
import "@/lib/firebase/appCheck";
import { clearRecipesBrowseSessionCache } from "@/lib/cookpilot/recipesBrowseSessionCache";
import type { AuthStatus } from "@/lib/cookpilot/types";

type AuthContextValue = {
  user: User | null;
  status: AuthStatus;
  isWorking: boolean;
  ensureAnonymousUser: () => Promise<User>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  continueWithEmail: (email: string) => Promise<EmailAuthStepResult>;
  submitEmailAuth: (params: EmailAuthSubmitParams) => Promise<void>;
  signOutCurrentUser: () => Promise<void>;
  deleteCurrentUser: (password?: string) => Promise<void>;
};

export type EmailAuthStepResult =
  | { kind: "passwordSignIn" }
  | { kind: "passwordSignUp" }
  | { kind: "redirectToGoogle" }
  | { kind: "showAppleMessage"; message: string };

export type EmailAuthSubmitParams = {
  email: string;
  password: string;
  fullName?: string;
  mode: "signIn" | "signUp";
};

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTHENTICATED_SESSION_MARKER_KEY = "cookpilot.lastAuthenticatedSession";
const ANONYMOUS_UID_KEY = "cookpilot.anonymousUid";
const AUTH_RESTORE_GRACE_MS = 2500;

// Deduplicates concurrent signInAnonymously() calls.
let pendingAnonSignIn: Promise<User> | null = null;

const googleProvider = new GoogleAuthProvider();
const appleProvider = new OAuthProvider("apple.com");
appleProvider.addScope("email");
appleProvider.addScope("name");

function isCredentialAlreadyInUseError(error: unknown) {
  const errorCode = (error as { code?: string }).code;
  return (
    errorCode === "auth/credential-already-in-use" ||
    errorCode === "auth/email-already-in-use"
  );
}

function rememberAuthenticatedSession(user: User) {
  if (typeof window === "undefined" || user.isAnonymous) return;

  try {
    window.localStorage.setItem(
      AUTHENTICATED_SESSION_MARKER_KEY,
      JSON.stringify({ uid: user.uid, at: Date.now() }),
    );
  } catch {
    // Best-effort guard only; Firebase Auth persistence remains the source of truth.
  }
}

function forgetAuthenticatedSession() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(AUTHENTICATED_SESSION_MARKER_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function hasAuthenticatedSessionMarker() {
  if (typeof window === "undefined") return false;

  try {
    return Boolean(window.localStorage.getItem(AUTHENTICATED_SESSION_MARKER_KEY));
  } catch {
    return false;
  }
}

function rememberAnonymousUid(uid: string) {
  try { window.localStorage.setItem(ANONYMOUS_UID_KEY, uid); } catch { /* ignore */ }
}

function forgetAnonymousUid() {
  try { window.localStorage.removeItem(ANONYMOUS_UID_KEY); } catch { /* ignore */ }
}

function getStoredAnonymousUid(): string | null {
  try { return window.localStorage.getItem(ANONYMOUS_UID_KEY); } catch { return null; }
}

function rememberUserDocEnsured(uid: string) {
  try { window.localStorage.setItem(`cookpilot.userDocEnsured.${uid}`, "1"); } catch { /* ignore */ }
}

function isUserDocEnsured(uid: string): boolean {
  try { return Boolean(window.localStorage.getItem(`cookpilot.userDocEnsured.${uid}`)); } catch { return false; }
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function maybeReauthenticateBeforeDeletion(user: User, password?: string) {
  const tokenResult = await user.getIdTokenResult(true);
  const authTime = tokenResult.authTime ? new Date(tokenResult.authTime).getTime() : null;
  const now = Date.now();
  const recentlyAuthenticated =
    authTime !== null && Number.isFinite(authTime) && now - authTime < 5 * 60 * 1000;

  if (recentlyAuthenticated) return;

  const providerIds = user.providerData.map((provider) => provider.providerId);

  if (providerIds.includes("password")) {
    if (!password || !user.email) {
      const error = new Error("Password required for account deletion.") as Error & {
        code?: string;
      };
      error.code = "cp/password-reauth-required";
      throw error;
    }

    await reauthenticateWithCredential(
      user,
      EmailAuthProvider.credential(user.email, password),
    );
    return;
  }

  if (providerIds.includes("apple.com")) {
    await reauthenticateWithPopup(user, appleProvider);
    return;
  }

  await reauthenticateWithPopup(user, googleProvider);
}

async function ensureUserDocument(user: User, provider: string) {
  const { createUserDocument } = await import("@/lib/cookpilot/firestore");
  await createUserDocument({
    userId: user.uid,
    email: user.email,
    displayName: user.displayName,
    provider,
    isAnonymous: user.isAnonymous,
  });
  rememberUserDocEnsured(user.uid);
}

async function updateUserSessionMetadata(user: User) {
  try {
    const { updateUserSessionMetadataIfNeeded } = await import("@/lib/cookpilot/firestore");
    await updateUserSessionMetadataIfNeeded(user.uid);
  } catch (error) {
    console.error("user session metadata update failed", error);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [isWorking, setIsWorking] = useState(false);
  const mergeAnonymousPromiseRef = useRef<Promise<void> | null>(null);

  const finalizeAuthenticatedUser = useCallback(async (userToFinalize: User, provider: string) => {
    await ensureUserDocument(userToFinalize, provider);
    rememberAuthenticatedSession(userToFinalize);
    setUser(userToFinalize);
    setStatus(userToFinalize.isAnonymous ? "anonymous" : "authenticated");
    void updateUserSessionMetadata(userToFinalize);
  }, []);

  const mergeAnonymousIfNeeded = useCallback(async (anonymousUid: string | null, nextUserId: string) => {
    if (!anonymousUid) return;
    if (anonymousUid === nextUserId) {
      throw new Error("Cannot merge anonymous account into itself.");
    }

    if (mergeAnonymousPromiseRef.current) {
      await mergeAnonymousPromiseRef.current;
      return;
    }

    const mergePromise = (async () => {
      // No need to wait for anonymous user document — we intentionally don't
      // create Firestore documents for anonymous users. The merge Cloud Function
      // copies their recipes subcollection directly without needing a user doc.
      const { mergeAnonymousAccount } = await import("@/lib/cookpilot/functions");
      await mergeAnonymousAccount(anonymousUid);
      await auth.currentUser?.reload();

      const refreshedUser = auth.currentUser;
      if (refreshedUser) {
        if (!refreshedUser.isAnonymous) {
          rememberAuthenticatedSession(refreshedUser);
        }
        setUser(refreshedUser);
        setStatus(refreshedUser.isAnonymous ? "anonymous" : "authenticated");
        void updateUserSessionMetadata(refreshedUser);
      }
    })();

    mergeAnonymousPromiseRef.current = mergePromise;
    try {
      await mergePromise;
    } finally {
      if (mergeAnonymousPromiseRef.current === mergePromise) {
        mergeAnonymousPromiseRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Prevents overlapping async handler executions — Firebase fires
    // onAuthStateChanged on token refresh (every hour), page focus, etc.
    // Without this, two concurrent handlers can both enter the null branch.
    let handlerRunning = false;

    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (cancelled) return;
      if (handlerRunning) return;
      handlerRunning = true;

      if (!nextUser) {
        // Immediately signal "loading" so the UI stops showing stale authenticated
        // content while we determine whether to restore a persisted user or create
        // a new anonymous one. Without this, RecipesPage keeps the old user in state
        // and fires Firestore fetches against a cleared session cache, causing the
        // jarring flash/error state visible during sign-out.
        setUser(null);
        setStatus("loading");

        // Wait for Firebase to finish loading the stored user from localStorage.
        await auth.authStateReady();
        if (cancelled) return;

        const restoredUser = auth.currentUser;
        if (restoredUser) {
          setUser(restoredUser);
          setStatus(restoredUser.isAnonymous ? "anonymous" : "authenticated");
          if (restoredUser.isAnonymous) {
            rememberAnonymousUid(restoredUser.uid);
          } else {
            rememberAuthenticatedSession(restoredUser);
          }
          handlerRunning = false;
          return;
        }

        if (hasAuthenticatedSessionMarker()) {
          await wait(AUTH_RESTORE_GRACE_MS);
          if (cancelled) return;

          const delayedRestoredUser = auth.currentUser;
          if (delayedRestoredUser) {
            setUser(delayedRestoredUser);
            setStatus(delayedRestoredUser.isAnonymous ? "anonymous" : "authenticated");
            if (!delayedRestoredUser.isAnonymous) {
              rememberAuthenticatedSession(delayedRestoredUser);
            }
            return;
          }

          forgetAuthenticatedSession();
        }

        // If we have a stored anonymous UID but Firebase says no user, wait a
        // bit before giving up — this can happen transiently during token
        // validation on a slow network. Avoids silently creating a new anon
        // user and losing all the previous session's imported recipes.
        const storedAnonUid = getStoredAnonymousUid();
        if (storedAnonUid) {
          await wait(1500);
          if (cancelled) return;
          const recovered = auth.currentUser;
          if (recovered) {
            setUser(recovered);
            setStatus(recovered.isAnonymous ? "anonymous" : "authenticated");
            if (recovered.isAnonymous) {
              rememberAnonymousUid(recovered.uid);
            } else {
              rememberAuthenticatedSession(recovered);
            }
            handlerRunning = false;
            return;
          }
          // Still no user — the anonymous account is truly gone.
          forgetAnonymousUid();
        }

        setUser(null);
        setStatus("signedOut");
        handlerRunning = false;
        return;
      }

      setUser(nextUser);
      setStatus(nextUser.isAnonymous ? "anonymous" : "authenticated");
      if (nextUser.isAnonymous) {
        rememberAnonymousUid(nextUser.uid);
      } else {
        rememberAuthenticatedSession(nextUser);
        forgetAnonymousUid();
        // Only track lastActive for real authenticated users — anonymous users
        // have no persistent identity worth session-frequency tracking, and
        // calling this on anon users caused spurious Firestore writes before
        // their user document was guaranteed to exist.
        void updateUserSessionMetadata(nextUser);
        // Self-healing: if the Firestore write failed during a previous sign-in
        // (auth record exists, user doc does not), recreate it. The localStorage
        // flag ensures this only runs once per UID, not on every token refresh.
        if (!isUserDocEnsured(nextUser.uid)) {
          void ensureUserDocument(nextUser, nextUser.providerData[0]?.providerId ?? "password").catch(
            (error) => console.error("ensureUserDocument recovery failed", error),
          );
        }
      }
      handlerRunning = false;
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const ensureAnonymousUserAction = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      setUser(currentUser);
      setStatus(currentUser.isAnonymous ? "anonymous" : "authenticated");
      if (currentUser.isAnonymous) {
        rememberAnonymousUid(currentUser.uid);
      } else {
        rememberAuthenticatedSession(currentUser);
      }
      return currentUser;
    }

    if (!pendingAnonSignIn) {
      pendingAnonSignIn = (async () => {
        const { user: anonUser } = await signInAnonymously(auth);
        rememberAnonymousUid(anonUser.uid);
        setUser(anonUser);
        setStatus("anonymous");
        return anonUser;
      })().finally(() => {
        pendingAnonSignIn = null;
      });
    }

    return pendingAnonSignIn;
  }, []);

  const signInWithGoogleAction = useCallback(async () => {
    setIsWorking(true);
    try {
      const currentUser = auth.currentUser;
      const anonymousUid = currentUser?.isAnonymous ? currentUser.uid : null;

      if (currentUser?.isAnonymous) {
        try {
          const linkResult = await linkWithPopup(currentUser, googleProvider);
          await finalizeAuthenticatedUser(linkResult.user, "google.com");
          return;
        } catch (error) {
          if (!isCredentialAlreadyInUseError(error)) {
            throw error;
          }
        }
      }

      const result = await signInWithPopup(auth, googleProvider);
      try {
        await finalizeAuthenticatedUser(result.user, "google.com");
      } finally {
        await mergeAnonymousIfNeeded(anonymousUid, result.user.uid);
      }
    } finally {
      setIsWorking(false);
    }
  }, [finalizeAuthenticatedUser, mergeAnonymousIfNeeded]);

  const signInWithAppleAction = useCallback(async () => {
    setIsWorking(true);
    try {
      const currentUser = auth.currentUser;
      const anonymousUid = currentUser?.isAnonymous ? currentUser.uid : null;

      if (currentUser?.isAnonymous) {
        try {
          const linkResult = await linkWithPopup(currentUser, appleProvider);
          await finalizeAuthenticatedUser(linkResult.user, "apple.com");
          return;
        } catch (error) {
          if (!isCredentialAlreadyInUseError(error)) {
            throw error;
          }
        }
      }

      const result = await signInWithPopup(auth, appleProvider);
      try {
        await finalizeAuthenticatedUser(result.user, "apple.com");
      } finally {
        await mergeAnonymousIfNeeded(anonymousUid, result.user.uid);
      }
    } finally {
      setIsWorking(false);
    }
  }, [finalizeAuthenticatedUser, mergeAnonymousIfNeeded]);

  const continueWithEmailAction = useCallback(async (email: string): Promise<EmailAuthStepResult> => {
    if (!auth.currentUser) {
      await ensureAnonymousUserAction();
    }

    const { checkUserProviders } = await import("@/lib/cookpilot/functions");
    const methods = (await checkUserProviders(email.trim().toLowerCase())) ?? [];

    if (!methods.length) {
      return { kind: "passwordSignUp" };
    }
    if (methods.includes("password")) {
      return { kind: "passwordSignIn" };
    }
    if (methods.includes("google.com")) {
      return { kind: "redirectToGoogle" };
    }
    if (methods.includes("apple.com")) {
      return {
        kind: "showAppleMessage",
        message: "This email is registered with Apple. Please use Sign in with Apple.",
      };
    }

    return { kind: "passwordSignUp" };
  }, [ensureAnonymousUserAction]);

  const submitEmailAuthAction = useCallback(async ({
    email,
    password,
    fullName,
    mode,
  }: EmailAuthSubmitParams) => {
    setIsWorking(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const currentUser = auth.currentUser;
      const anonymousUid = currentUser?.isAnonymous ? currentUser.uid : null;
      const credential = EmailAuthProvider.credential(normalizedEmail, password);

      if (currentUser?.isAnonymous) {
        if (mode === "signUp") {
          const linkResult = await linkWithCredential(currentUser, credential);
          if (fullName?.trim()) {
            await updateProfile(linkResult.user, { displayName: fullName.trim() });
          }
          await finalizeAuthenticatedUser(linkResult.user, "password");
          return;
        }

        try {
          const linkResult = await linkWithCredential(currentUser, credential);
          await finalizeAuthenticatedUser(linkResult.user, "password");
          return;
        } catch (error) {
          if (!isCredentialAlreadyInUseError(error)) {
            throw error;
          }
        }
      }

      const result =
        mode === "signUp"
          ? await createUserWithEmailAndPassword(auth, normalizedEmail, password)
          : await signInWithEmailAndPassword(auth, normalizedEmail, password);

      if (mode === "signUp" && fullName?.trim()) {
        await updateProfile(result.user, { displayName: fullName.trim() });
      }

      try {
        await finalizeAuthenticatedUser(result.user, "password");
      } finally {
        await mergeAnonymousIfNeeded(anonymousUid, result.user.uid);
      }
    } finally {
      setIsWorking(false);
    }
  }, [finalizeAuthenticatedUser, mergeAnonymousIfNeeded]);

  const signOutCurrentUser = useCallback(async () => {
    setIsWorking(true);
    try {
      clearRecipesBrowseSessionCache();
      forgetAuthenticatedSession();
      forgetAnonymousUid();
      await signOut(auth);
    } finally {
      setIsWorking(false);
    }
  }, []);

  const deleteCurrentUser = useCallback(async (password?: string) => {
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.isAnonymous) return;

    setIsWorking(true);
    try {
      await maybeReauthenticateBeforeDeletion(currentUser, password);
      const { deleteAllUserData } = await import("@/lib/cookpilot/firestore");
      await deleteAllUserData(currentUser.uid);
      forgetAuthenticatedSession();
      await deleteUser(currentUser);
    } finally {
      setIsWorking(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      isWorking,
      ensureAnonymousUser: ensureAnonymousUserAction,
      signInWithGoogle: signInWithGoogleAction,
      signInWithApple: signInWithAppleAction,
      continueWithEmail: continueWithEmailAction,
      submitEmailAuth: submitEmailAuthAction,
      signOutCurrentUser,
      deleteCurrentUser,
    }),
    [
      user,
      status,
      isWorking,
      ensureAnonymousUserAction,
      signInWithGoogleAction,
      signInWithAppleAction,
      continueWithEmailAction,
      submitEmailAuthAction,
      signOutCurrentUser,
      deleteCurrentUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return value;
}
