"use client";

import { useState } from "react";
import { AuthDialog } from "@/components/cookpilot/AuthDialog";
import { AppTopBar } from "@/components/cookpilot/AppTopBar";
import { SettingsPanel } from "@/components/cookpilot/SettingsPage";
import { useAuth } from "@/components/providers/AuthProvider";
import { AppShell } from "@/components/ui/AppShell";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export function AuthenticatedAppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useAuth();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  if (status === "loading") {
    return (
      <div className="cp-page cp-page--centered">
        <LoadingSpinner label="Checking your session" />
      </div>
    );
  }

  return (
    <>
      <AppShell
        main={children}
        topbar={
          <AppTopBar
            onSettingsClick={() => setIsSettingsOpen(true)}
            onSignInClick={() => setIsAuthOpen(true)}
          />
        }
      />
      {isAuthOpen ? <AuthDialog onClose={() => setIsAuthOpen(false)} /> : null}
      {isSettingsOpen ? (
        <div aria-hidden="true" className="cp-modal-backdrop" onClick={() => setIsSettingsOpen(false)}>
          <div
            aria-modal="true"
            className="cp-modal-card cp-modal-card--settings"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <SettingsPanel onClose={() => setIsSettingsOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
