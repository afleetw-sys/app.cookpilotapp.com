"use client";

import type { User } from "firebase/auth";

const PROMPT_REQUESTED_KEY = "cookpilot.anonymousSyncPromptRequested";
const PROMPT_SEEN_KEY = "cookpilot.anonymousSyncPromptSeen";
const PROMPT_SESSION_DISMISSED_KEY = "cookpilot.anonymousSyncPromptDismissedThisSession";
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Best-effort UX prompt only.
  }
}

function removeStorage(key: string) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Best-effort UX prompt only.
  }
}

function readSessionStorage(key: string): string | null {
  if (typeof window === "undefined") return null;

  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionStorage(key: string, value: string) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Best-effort UX prompt only.
  }
}

export function subscribeToAnonymousSyncPrompt(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);

  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

export function shouldShowAnonymousSyncPromptSnapshot() {
  return (
    readStorage(PROMPT_REQUESTED_KEY) === "1" &&
    readSessionStorage(PROMPT_SESSION_DISMISSED_KEY) !== "1"
  );
}

export function requestAnonymousSyncPrompt(user: User | null | undefined) {
  if (!user?.isAnonymous) return;
  if (readStorage(PROMPT_SEEN_KEY) === "1") return;
  if (readSessionStorage(PROMPT_SESSION_DISMISSED_KEY) === "1") return;

  writeStorage(PROMPT_REQUESTED_KEY, "1");
  writeStorage(PROMPT_SEEN_KEY, "1");
  emitChange();
}

export function dismissAnonymousSyncPrompt() {
  writeSessionStorage(PROMPT_SESSION_DISMISSED_KEY, "1");
  emitChange();
}

export function clearAnonymousSyncPrompt() {
  removeStorage(PROMPT_REQUESTED_KEY);
  emitChange();
}
