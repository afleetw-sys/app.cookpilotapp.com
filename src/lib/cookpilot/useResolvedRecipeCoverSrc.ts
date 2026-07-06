"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { auth, authReady } from "@/lib/firebase/client";
import { isInstagramCDNURLExpired } from "@/lib/cookpilot/coverUpstreamRequest";
import { logRecipeImageLoad } from "@/lib/cookpilot/recipeImageDiagnostics";
import {
  isFirebaseStorageURL,
  proxiedExternalCoverUrl,
  refreshRecipeCoverSrc,
  resolveRecipeCoverSrc,
} from "@/lib/cookpilot/resolveRecipeCoverUrl";

type CoverLoadMode = "firebase" | "direct" | "proxy";
type CoverLoadState = {
  failed: boolean;
  key: string;
  resolvedSrc: string | null;
};

const MAX_RESOLVED_COVER_CACHE_ENTRIES = 300;
const resolvedCoverSrcCache = new Map<string, string>();

function cachedResolvedCoverSrc(key: string): string | null {
  return resolvedCoverSrcCache.get(key) ?? null;
}

function cacheResolvedCoverSrc(key: string, src: string) {
  if (resolvedCoverSrcCache.has(key)) {
    resolvedCoverSrcCache.delete(key);
  }
  resolvedCoverSrcCache.set(key, src);

  while (resolvedCoverSrcCache.size > MAX_RESOLVED_COVER_CACHE_ENTRIES) {
    const oldest = resolvedCoverSrcCache.keys().next().value;
    if (!oldest) break;
    resolvedCoverSrcCache.delete(oldest);
  }
}

function initialCoverLoadState(key: string): CoverLoadState {
  return { failed: false, key, resolvedSrc: cachedResolvedCoverSrc(key) };
}

/**
 * Resolves Firestore `imageURL` for `<img src>`.
 *
 * - Firebase: refresh signed URL via Storage SDK (tokens in Firestore expire).
 * - External: browser direct first (same idea as iOS URLSession on device), proxy only as fallback.
 *   Do not set crossOrigin for display — many CDNs load in <img> but fail CORS checks.
 */
export function useResolvedRecipeCoverSrc(
  storedImageURL: string | null | undefined,
  recipeId: string,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? true;
  const stored = typeof storedImageURL === "string" ? storedImageURL.trim() : "";
  const loadKey = `${enabled ? "enabled" : "disabled"}:${recipeId}:${stored}`;
  const expired = Boolean(stored && enabled && isInstagramCDNURLExpired(stored));

  const [loadState, setLoadState] = useState<CoverLoadState>(() => initialCoverLoadState(loadKey));
  const activeLoadState =
    loadState.key === loadKey ? loadState : initialCoverLoadState(loadKey);
  const src = stored && enabled && !expired ? activeLoadState.resolvedSrc ?? stored : null;
  const failed = expired || activeLoadState.failed;
  const loadModeRef = useRef<CoverLoadMode>("direct");
  const firebaseRefreshUsed = useRef(false);
  const recoveryInFlightRef = useRef(false);

  useEffect(() => {
    loadModeRef.current = "direct";
    firebaseRefreshUsed.current = false;
    recoveryInFlightRef.current = false;

    if (!stored || !enabled) {
      return;
    }

    if (isInstagramCDNURLExpired(stored)) {
      logRecipeImageLoad(recipeId, "cover.instagramExpired");
      return;
    }

    if (!isFirebaseStorageURL(stored)) {
      logRecipeImageLoad(recipeId, "cover.directFirst");
      return;
    }

    if (cachedResolvedCoverSrc(loadKey)) {
      // Already resolved this exact recipe/image in this session — no need to
      // hit Firebase Storage again for a signed URL we already have.
      loadModeRef.current = "firebase";
      return;
    }

    let cancelled = false;

    void (async () => {
      await authReady;
      await auth.authStateReady();
      if (cancelled) return;

      if (!auth.currentUser) {
        logRecipeImageLoad(recipeId, "cover.error.notAuthenticated");
        return;
      }

      const fresh = await resolveRecipeCoverSrc(auth.currentUser.uid, recipeId, stored);
      if (cancelled) return;
      if (!fresh) {
        logRecipeImageLoad(recipeId, "cover.resolveFailed");
        return;
      }

      loadModeRef.current = "firebase";
      logRecipeImageLoad(recipeId, "cover.firebaseResolvedURL");
      cacheResolvedCoverSrc(loadKey, fresh);
      setLoadState((current) =>
        current.key === loadKey && current.resolvedSrc === fresh && !current.failed
          ? current
          : { failed: false, key: loadKey, resolvedSrc: fresh },
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [stored, recipeId, enabled, loadKey]);

  const handleImageError = useCallback(() => {
    function updateActiveLoadState(update: Partial<Omit<CoverLoadState, "key">>) {
      setLoadState((current) => ({
        ...(current.key === loadKey ? current : initialCoverLoadState(loadKey)),
        ...update,
      }));
    }

    if (expired) {
      return;
    }

    if (!stored) {
      updateActiveLoadState({ failed: true });
      return;
    }

    if (recoveryInFlightRef.current) {
      return;
    }

    if (isFirebaseStorageURL(stored) && !firebaseRefreshUsed.current) {
      firebaseRefreshUsed.current = true;
      recoveryInFlightRef.current = true;
      logRecipeImageLoad(recipeId, "cover.error.firebaseRefresh");
      void (async () => {
        await authReady;
        await auth.authStateReady();
        if (!auth.currentUser) {
          recoveryInFlightRef.current = false;
          updateActiveLoadState({ failed: true });
          return;
        }
        const refreshed = await refreshRecipeCoverSrc(auth.currentUser.uid, recipeId, stored);
        recoveryInFlightRef.current = false;
        if (refreshed) {
          loadModeRef.current = "firebase";
          cacheResolvedCoverSrc(loadKey, refreshed);
          updateActiveLoadState({ failed: false, resolvedSrc: refreshed });
          return;
        }
        updateActiveLoadState({ failed: true });
      })();
      return;
    }

    if (!isFirebaseStorageURL(stored) && loadModeRef.current === "direct") {
      recoveryInFlightRef.current = true;
      loadModeRef.current = "proxy";
      logRecipeImageLoad(recipeId, "cover.error.proxyFallback");
      const proxied = proxiedExternalCoverUrl(stored);
      cacheResolvedCoverSrc(loadKey, proxied);
      updateActiveLoadState({ failed: false, resolvedSrc: proxied });
      recoveryInFlightRef.current = false;
      return;
    }

    logRecipeImageLoad(recipeId, "cover.error.final", { mode: loadModeRef.current });
    // Keep last src visible (broken icon) — grid must not use `failed` to clear coverSrc.
    updateActiveLoadState({ failed: true });
  }, [stored, recipeId, expired, loadKey]);

  const isLoading = Boolean(stored) && enabled && !src && !failed && !expired;

  return { src, failed, expired, isLoading, handleImageError };
}
