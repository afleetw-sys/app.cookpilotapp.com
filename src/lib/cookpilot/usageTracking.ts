import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/db";

export const MONTHLY_FREE_EDIT_LIMIT = 3;

const LOCAL_USAGE_COUNT_KEY = "cookpilot.anonEditCount";
const LOCAL_USAGE_MONTH_KEY = "cookpilot.anonEditMonthKey";

export interface UsageInfo {
  remaining: number | null; // null = unlimited (subscribed)
  total: number | null;
  resetDate: Date | null;
  isSubscribed: boolean;
}

// ── Month key helpers ────────────────────────────────────────────────────────

// UTC so the key is byte-identical to the editRecipe Cloud Function, which writes the
// signed-in user's monthlyEditMonthKey in UTC. Computing it in local time here would make
// the client read a server-written key as a stale month near a month boundary and wrongly
// reset the count.
function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getNextResetDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

export function formatResetDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Firestore (signed-in users) ──────────────────────────────────────────────

interface FirestoreUsage {
  monthlyEditCount: number;
  monthlyEditMonthKey: string;
}

async function loadUsageFromFirestore(
  userId: string,
): Promise<{ count: number; monthKey: string }> {
  try {
    const userDoc = await getDoc(doc(db, "users", userId));
    if (!userDoc.exists()) return { count: 0, monthKey: getCurrentMonthKey() };
    const data = userDoc.data() as Partial<FirestoreUsage>;
    return {
      count: data.monthlyEditCount ?? 0,
      monthKey: data.monthlyEditMonthKey ?? getCurrentMonthKey(),
    };
  } catch {
    return { count: 0, monthKey: getCurrentMonthKey() };
  }
}

// No client-side Firestore writer: the editRecipe Cloud Function is the single writer of
// monthlyEditCount for signed-in users. This module only reads it.

// ── localStorage (anonymous users) ──────────────────────────────────────────

function loadLocalUsage(): { count: number; monthKey: string } {
  if (typeof window === "undefined") return { count: 0, monthKey: getCurrentMonthKey() };
  try {
    const count = parseInt(localStorage.getItem(LOCAL_USAGE_COUNT_KEY) ?? "0", 10);
    const monthKey = localStorage.getItem(LOCAL_USAGE_MONTH_KEY) ?? getCurrentMonthKey();
    return { count: isNaN(count) ? 0 : count, monthKey };
  } catch {
    return { count: 0, monthKey: getCurrentMonthKey() };
  }
}

function saveLocalUsage(count: number, monthKey: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_USAGE_COUNT_KEY, String(count));
    localStorage.setItem(LOCAL_USAGE_MONTH_KEY, monthKey);
  } catch {
    // Ignore storage failures.
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Load current usage info for a user. Pass null for anonymous users.
 * Shows a fresh quota once the month rolls over. Signed-in counts are owned by the
 * editRecipe Cloud Function — this never writes monthlyEditCount.
 */
export async function loadUsageInfo(
  userId: string | null,
  isSubscribed: boolean,
): Promise<UsageInfo> {
  if (isSubscribed) {
    return { remaining: null, total: null, resetDate: null, isSubscribed: true };
  }

  const currentMonthKey = getCurrentMonthKey();
  let count: number;
  let monthKey: string;

  if (userId) {
    ({ count, monthKey } = await loadUsageFromFirestore(userId));
    // Stale month → show a full quota for display only. The Cloud Function performs the
    // real reset server-side on the user's next edit; the client must not write the count.
    if (monthKey !== currentMonthKey) count = 0;
  } else {
    ({ count, monthKey } = loadLocalUsage());
    // Anonymous counts are client-owned (no server doc), so reset them locally.
    if (monthKey !== currentMonthKey) {
      count = 0;
      saveLocalUsage(0, currentMonthKey);
    }
  }

  const remaining = Math.max(0, MONTHLY_FREE_EDIT_LIMIT - count);
  return {
    remaining,
    total: MONTHLY_FREE_EDIT_LIMIT,
    resetDate: getNextResetDate(),
    isSubscribed: false,
  };
}

/**
 * Subscribe to real-time usage updates from Firestore for a signed-in user.
 * Fires immediately with current data, then again whenever iOS/web/Mac writes a new count.
 * Returns an unsubscribe function.
 */
export function subscribeToUsageInfo(
  userId: string,
  isSubscribed: boolean,
  onUpdate: (info: UsageInfo) => void,
): () => void {
  if (isSubscribed) {
    onUpdate({ remaining: null, total: null, resetDate: null, isSubscribed: true });
    return () => {};
  }

  return onSnapshot(doc(db, "users", userId), (snapshot) => {
    // Recomputed per fire so a listener that outlives a month boundary stays correct.
    const currentMonthKey = getCurrentMonthKey();
    const data = snapshot.exists() ? (snapshot.data() as Partial<FirestoreUsage>) : {};
    let count = data.monthlyEditCount ?? 0;
    const monthKey = data.monthlyEditMonthKey ?? currentMonthKey;

    // Stale month → display a full quota. The editRecipe Cloud Function owns the real
    // reset (it does so on the next edit); the client never writes monthlyEditCount.
    if (monthKey !== currentMonthKey) count = 0;

    onUpdate({
      remaining: Math.max(0, MONTHLY_FREE_EDIT_LIMIT - count),
      total: MONTHLY_FREE_EDIT_LIMIT,
      resetDate: getNextResetDate(),
      isSubscribed: false,
    });
  });
}

/**
 * Record one AI edit for an ANONYMOUS user (local-only counter). Call after a successful edit.
 *
 * Signed-in usage is owned by the editRecipe Cloud Function, which increments the count
 * server-side as part of the edit — for signed-in users re-read via loadUsageInfo /
 * subscribeToUsageInfo instead, never call this (it would be a second, conflicting writer).
 */
export async function recordEditUsage(
  userId: string | null,
  isSubscribed: boolean,
): Promise<UsageInfo> {
  if (isSubscribed) {
    return { remaining: null, total: null, resetDate: null, isSubscribed: true };
  }

  // Defensive: a signed-in caller is a bug — fall back to a read rather than writing.
  if (userId) {
    return loadUsageInfo(userId, isSubscribed);
  }

  const currentMonthKey = getCurrentMonthKey();
  const stored = loadLocalUsage();
  const count = (stored.monthKey === currentMonthKey ? stored.count : 0) + 1;
  saveLocalUsage(count, currentMonthKey);

  const remaining = Math.max(0, MONTHLY_FREE_EDIT_LIMIT - count);
  return {
    remaining,
    total: MONTHLY_FREE_EDIT_LIMIT,
    resetDate: getNextResetDate(),
    isSubscribed: false,
  };
}
