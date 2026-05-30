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
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  continueWithEmail: (email: string) => Promise<EmailAuthStepResult>;
  submitEmailAuth: (params: EmailAuthSubmitParams) => Promise<void>;
  signOutCurrentUser: () => Promise<void>;
  deleteCurrentUser: (password?: string) => Promise<void>;
};

type UserDocumentSync = {
  uid: string;
  promise: Promise<void>;
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
const AUTH_RESTORE_GRACE_MS = 2500;

// Module-level guard: deduplicates concurrent signInAnonymously() calls that arise
// when React Strict Mode mounts the provider twice and both subscriptions see null
// before the first sign-in resolves.
let pendingAnonSignIn: Promise<void> | null = null;

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
  const anonymousUserDocumentSyncRef = useRef<UserDocumentSync | null>(null);
  const mergeAnonymousPromiseRef = useRef<Promise<void> | null>(null);

  const syncAnonymousUserDocument = useCallback((userToSync: User) => {
    const promise = ensureUserDocument(userToSync, "anonymous");
    anonymousUserDocumentSyncRef.current = { uid: userToSync.uid, promise };
    return promise;
  }, []);

  const waitForAnonymousUserDocument = useCallback(async (anonymousUid: string) => {
    const sync = anonymousUserDocumentSyncRef.current;
    if (sync?.uid === anonymousUid) {
      await sync.promise;
    }
  }, []);

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
      await waitForAnonymousUserDocument(anonymousUid);
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
  }, [waitForAnonymousUserDocument]);

  useEffect(() => {
    let cancelled = false;

    // Register onAuthStateChanged immediately — do NOT await authReady first.
    //
    // The previous approach awaited authReady (= auth.authStateReady() called
    // at module-init time) before registering the listener. The problem: Firebase
    // may begin loading the persisted user from localStorage *after* the module
    // initialises, so authStateReady() resolved before the stored user was
    // available, causing the listener to fire with null and create a fresh
    // anonymous user on every page load.
    //
    // By registering immediately and awaiting auth.authStateReady() *inside*
    // the null branch, we wait for persistence to actually finish loading
    // before giving up and creating a new anonymous user.
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (cancelled) return;

      if (!nextUser) {
        // Wait for Firebase to finish loading the stored user from localStorage.
        await auth.authStateReady();
        if (cancelled) return;

        const restoredUser = auth.currentUser;
        if (restoredUser) {
          setUser(restoredUser);
          setStatus(restoredUser.isAnonymous ? "anonymous" : "authenticated");
          if (!restoredUser.isAnonymous) {
            rememberAuthenticatedSession(restoredUser);
          }
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

        if (!pendingAnonSignIn) {
          pendingAnonSignIn = (async () => {
            const { user: anonUser } = await signInAnonymously(auth);
            if (cancelled) return;
            setUser(anonUser);
            setStatus("anonymous");
            // Firestore sync is best-effort — never delete the auth user on
            // failure or it causes an infinite new-user-on-every-refresh cycle.
            try {
              await syncAnonymousUserDocument(anonUser);
              await updateUserSessionMetadata(anonUser);
            } catch (docError) {
              console.warn("anonymous user document sync failed (non-fatal):", docError);
            }
          })().finally(() => {
            pendingAnonSignIn = null;
          });
        }

        try {
          await pendingAnonSignIn;
        } catch (error) {
          console.error("anonymous bootstrap failed", error);
          if (!cancelled) {
            setUser(null);
            setStatus("loading");
          }
        }
        return;
      }

      setUser(nextUser);
      setStatus(nextUser.isAnonymous ? "anonymous" : "authenticated");
      if (!nextUser.isAnonymous) {
        rememberAuthenticatedSession(nextUser);
      }
      void updateUserSessionMetadata(nextUser);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [syncAnonymousUserDocument]);

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
      await finalizeAuthenticatedUser(result.user, "google.com");
      await mergeAnonymousIfNeeded(anonymousUid, result.user.uid);
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
      await finalizeAuthenticatedUser(result.user, "apple.com");
      await mergeAnonymousIfNeeded(anonymousUid, result.user.uid);
    } finally {
      setIsWorking(false);
    }
  }, [finalizeAuthenticatedUser, mergeAnonymousIfNeeded]);

  const continueWithEmailAction = useCallback(async (email: string): Promise<EmailAuthStepResult> => {
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
  }, []);

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

      await finalizeAuthenticatedUser(result.user, "password");
      await mergeAnonymousIfNeeded(anonymousUid, result.user.uid);
    } finally {
      setIsWorking(false);
    }
  }, [finalizeAuthenticatedUser, mergeAnonymousIfNeeded]);

  const signOutCurrentUser = useCallback(async () => {
    setIsWorking(true);
    try {
      clearRecipesBrowseSessionCache();
      forgetAuthenticatedSession();
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
