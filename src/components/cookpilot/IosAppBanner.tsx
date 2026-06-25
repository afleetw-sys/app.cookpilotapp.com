"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AuthDialog } from "@/components/cookpilot/AuthDialog";
import { ModalShell } from "@/components/cookpilot/ModalShell";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  shouldShowAnonymousSyncPromptSnapshot,
  subscribeToAnonymousSyncPrompt,
} from "@/lib/cookpilot/anonymousSyncPrompt";
import { commitShareLink } from "@/lib/cookpilot/functions";
import { buildShareLinkPayload, newShareId } from "@/lib/cookpilot/sharedRecipe";
import { loadRecipe, loadRecipePage } from "@/lib/cookpilot/firestore";
import { getRecipesBrowseSessionCache } from "@/lib/cookpilot/recipesBrowseSessionCache";

const APP_STORE_URL = "https://apps.apple.com/app/cookpilot/id6753838076";
const DISMISSAL_KEY = "cookpilot.iosAppBannerDismissed";
const listeners = new Set<() => void>();

function isIPhone() {
  return /iPhone/i.test(window.navigator.userAgent);
}

function shareKeyFromPath(pathname: string) {
  const match = /^\/(?:r|shared)\/([^/?#]+)/.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function recipeIdFromPath(pathname: string) {
  const match = /^\/recipes\/([^/?#]+)/.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function shouldShowBanner() {
  if (typeof window === "undefined" || !isIPhone()) return false;

  try {
    return window.localStorage.getItem(DISMISSAL_KEY) !== "1";
  } catch {
    // If storage is unavailable, still offer the App Store link.
    return true;
  }
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

export function IosAppBanner() {
  const { status, user } = useAuth();
  const pathname = usePathname();
  const visible = useSyncExternalStore(subscribe, shouldShowBanner, () => false);
  const syncPromptVisible = useSyncExternalStore(
    subscribeToAnonymousSyncPrompt,
    shouldShowAnonymousSyncPromptSnapshot,
    () => false,
  );
  const [anonymousSavedRecipeState, setAnonymousSavedRecipeState] = useState<{
    uid: string;
    hasSavedRecipes: boolean;
  } | null>(null);
  const [showSavedRecipesWarning, setShowSavedRecipesWarning] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [handoffWorking, setHandoffWorking] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const shareKey = shareKeyFromPath(pathname);
  const recipeId = recipeIdFromPath(pathname);
  const canPreserveContext = Boolean(shareKey || recipeId);

  useEffect(() => {
    if (!visible || status !== "anonymous" || !user?.isAnonymous) {
      return;
    }

    let cancelled = false;
    const cached = getRecipesBrowseSessionCache(user.uid);
    if ((cached?.totalRecipeCount ?? cached?.recipes.length ?? 0) > 0) {
      queueMicrotask(() => {
        if (!cancelled) {
          setAnonymousSavedRecipeState({ uid: user.uid, hasSavedRecipes: true });
        }
      });
      return () => {
        cancelled = true;
      };
    }

    void loadRecipePage(user.uid, null, 1, true)
      .then((page) => {
        if (!cancelled) {
          setAnonymousSavedRecipeState({
            uid: user.uid,
            hasSavedRecipes: (page.totalCount ?? page.recipes.length) > 0,
          });
        }
      })
      .catch((error) => {
        console.error(error);
      });

    return () => {
      cancelled = true;
    };
  }, [status, user, visible]);
  const savedRecipeState = anonymousSavedRecipeState;
  const anonymousHasSavedRecipes = savedRecipeState
    ? savedRecipeState.uid === user?.uid && savedRecipeState.hasSavedRecipes
    : false;

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISSAL_KEY, "1");
    } catch {
      // The in-memory state below is enough for this visit.
    }
    listeners.forEach((listener) => listener());
  }

  if (!visible || !canPreserveContext || (status === "anonymous" && syncPromptVisible)) {
    return null;
  }

  async function buildHandoffURL() {
    if (shareKey) {
      return `https://app.cookpilotapp.com/r/${encodeURIComponent(shareKey)}`;
    }

    if (!recipeId || !user) return null;

    const recipe = await loadRecipe(user.uid, recipeId);
    if (!recipe) return null;

    const title = recipe.recipe.title?.trim() || "Recipe";
    const shareId = newShareId();
    await commitShareLink({
      shareId,
      recipeTitle: title,
      recipe: buildShareLinkPayload(recipe.recipe, recipe.sourceURL),
      sourceURL: recipe.sourceURL ?? null,
      imageURL: recipe.recipe.imageURL ?? null,
    });

    return `https://app.cookpilotapp.com/r/${shareId}`;
  }

  async function openContextInApp() {
    setHandoffWorking(true);
    setHandoffError(null);

    try {
      const handoffURL = await buildHandoffURL();
      if (!handoffURL) {
        window.location.href = APP_STORE_URL;
        return;
      }

      window.location.href = handoffURL;
    } catch (error) {
      console.error(error);
      setHandoffError("We couldn't open this in the app right now.");
    } finally {
      setHandoffWorking(false);
    }
  }

  function handleOpenApp() {
    if (status === "anonymous" && anonymousHasSavedRecipes) {
      setShowSavedRecipesWarning(true);
      return;
    }

    void openContextInApp();
  }

  return (
    <>
      <aside className="cp-ios-app-banner" aria-label="Get the CookPilot app">
        <Image alt="CookPilot" className="cp-ios-app-banner__icon" height={48} src="/images/cp-logo-lg.png" width={48} />
        <div className="cp-ios-app-banner__copy">
          <strong>CookPilot</strong>
          <span>Open in the app</span>
        </div>
        <button className="cp-ios-app-banner__link" disabled={handoffWorking} onClick={handleOpenApp} type="button">
          {handoffWorking ? "Opening..." : "Open"}
        </button>
        <button
          aria-label="Dismiss app banner"
          className="cp-ios-app-banner__dismiss"
          onClick={dismiss}
          type="button"
        >
          <span aria-hidden="true">×</span>
        </button>
      </aside>
      {showSavedRecipesWarning ? (
        <ModalShell
          aria-labelledby="open-app-warning-title"
          onClose={() => setShowSavedRecipesWarning(false)}
          variant="confirm"
        >
          <section className="cp-open-app-warning">
            <div className="cp-open-app-warning__header">
              <Image alt="CookPilot" className="cp-open-app-warning__icon" height={44} src="/images/cp-logo-lg.png" width={44} />
              <div>
                <h2 id="open-app-warning-title">Sign in before opening the app?</h2>
                <p>
                  Your recipes are saved on this browser right now. Sign in to sync them across web, iPhone, and Mac.
                </p>
              </div>
            </div>
            <div className="cp-open-app-warning__actions">
              <button
                className="cp-button cp-button--primary"
                disabled={handoffWorking}
                onClick={() => {
                  setShowSavedRecipesWarning(false);
                  setIsAuthOpen(true);
                }}
                type="button"
              >
                Sign in first
              </button>
              <button
                className="cp-button cp-button--secondary"
                disabled={handoffWorking}
                onClick={() => void openContextInApp()}
                type="button"
              >
                {handoffWorking ? "Opening..." : "Continue"}
              </button>
            </div>
            {handoffError ? <p className="cp-open-app-warning__error" role="alert">{handoffError}</p> : null}
          </section>
        </ModalShell>
      ) : null}
      {isAuthOpen ? <AuthDialog onClose={() => setIsAuthOpen(false)} /> : null}
    </>
  );
}
