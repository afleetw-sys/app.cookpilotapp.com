import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
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

function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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

async function saveUsageToFirestore(
  userId: string,
  count: number,
  monthKey: string,
): Promise<void> {
  try {
    await setDoc(
      doc(db, "users", userId),
      { monthlyEditCount: count, monthlyEditMonthKey: monthKey },
      { merge: true },
    );
  } catch (error) {
    console.error("[usageTracking] failed to save usage to Firestore", error);
  }
}

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
 * Always resets count if we've moved into a new month.
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
  } else {
    ({ count, monthKey } = loadLocalUsage());
  }

  // Reset if we've moved into a new month.
  if (monthKey !== currentMonthKey) {
    count = 0;
    monthKey = currentMonthKey;
    if (userId) {
      void saveUsageToFirestore(userId, 0, monthKey);
    } else {
      saveLocalUsage(0, monthKey);
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

  const currentMonthKey = getCurrentMonthKey();

  return onSnapshot(doc(db, "users", userId), (snapshot) => {
    const data = snapshot.exists() ? (snapshot.data() as Partial<FirestoreUsage>) : {};
    let count = data.monthlyEditCount ?? 0;
    const monthKey = data.monthlyEditMonthKey ?? currentMonthKey;

    // If the stored month is stale, treat count as 0 and reset in Firestore.
    if (monthKey !== currentMonthKey) {
      count = 0;
      void saveUsageToFirestore(userId, 0, currentMonthKey);
    }

    onUpdate({
      remaining: Math.max(0, MONTHLY_FREE_EDIT_LIMIT - count),
      total: MONTHLY_FREE_EDIT_LIMIT,
      resetDate: getNextResetDate(),
      isSubscribed: false,
    });
  });
}

/**
 * Record one AI edit use. Call after a successful edit.
 * Returns the updated UsageInfo.
 */
export async function recordEditUsage(
  userId: string | null,
  isSubscribed: boolean,
): Promise<UsageInfo> {
  if (isSubscribed) {
    return { remaining: null, total: null, resetDate: null, isSubscribed: true };
  }

  const currentMonthKey = getCurrentMonthKey();
  let count: number;

  if (userId) {
    const stored = await loadUsageFromFirestore(userId);
    count = stored.monthKey === currentMonthKey ? stored.count : 0;
    count += 1;
    void saveUsageToFirestore(userId, count, currentMonthKey);
  } else {
    const stored = loadLocalUsage();
    count = stored.monthKey === currentMonthKey ? stored.count : 0;
    count += 1;
    saveLocalUsage(count, currentMonthKey);
  }

  const remaining = Math.max(0, MONTHLY_FREE_EDIT_LIMIT - count);
  return {
    remaining,
    total: MONTHLY_FREE_EDIT_LIMIT,
    resetDate: getNextResetDate(),
    isSubscribed: false,
  };
}
