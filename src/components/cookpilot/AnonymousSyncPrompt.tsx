"use client";

import Image from "next/image";
import { X } from "@phosphor-icons/react";
import { useEffect, useSyncExternalStore, useState } from "react";
import { AuthDialog } from "@/components/cookpilot/AuthDialog";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  dismissAnonymousSyncPrompt,
  clearAnonymousSyncPrompt,
  shouldShowAnonymousSyncPromptSnapshot,
  subscribeToAnonymousSyncPrompt,
} from "@/lib/cookpilot/anonymousSyncPrompt";

export function AnonymousSyncPrompt() {
  const { status, user } = useAuth();
  const requested = useSyncExternalStore(
    subscribeToAnonymousSyncPrompt,
    shouldShowAnonymousSyncPromptSnapshot,
    () => false,
  );
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const visible = requested && status === "anonymous" && Boolean(user?.isAnonymous);

  useEffect(() => {
    if (status === "authenticated") {
      clearAnonymousSyncPrompt();
    }
  }, [status]);

  if (!visible) {
    return isAuthOpen && status !== "authenticated"
      ? <AuthDialog onClose={() => setIsAuthOpen(false)} />
      : null;
  }

  return (
    <>
      <aside className="cp-anon-sync-prompt" aria-label="Sync recipes">
        <Image alt="CookPilot" className="cp-anon-sync-prompt__icon" height={40} src="/images/cp-logo-lg.png" width={40} />
        <div className="cp-anon-sync-prompt__copy">
          <strong>Save recipes across devices</strong>
          <span>Your recipes are saved on this browser. Sign in to sync them across web, iPhone, and Mac.</span>
        </div>
        <button
          className="cp-anon-sync-prompt__action"
          onClick={() => setIsAuthOpen(true)}
          type="button"
        >
          Sign in
        </button>
        <button
          aria-label="Dismiss sync prompt"
          className="cp-anon-sync-prompt__dismiss"
          onClick={dismissAnonymousSyncPrompt}
          type="button"
        >
          <X size={15} weight="bold" />
        </button>
      </aside>
      {isAuthOpen ? <AuthDialog onClose={() => setIsAuthOpen(false)} /> : null}
    </>
  );
}
