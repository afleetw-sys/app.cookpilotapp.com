"use client";

import { useState } from "react";
import { AppTopBar } from "@/components/cookpilot/AppTopBar";
import { SettingsPanel } from "@/components/cookpilot/SettingsPage";
import { useAuth } from "@/components/providers/AuthProvider";
import { AppShell } from "@/components/ui/AppShell";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ModalShell } from "@/components/cookpilot/ModalShell";

export function AuthenticatedAppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useAuth();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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
          />
        }
      />
      {isSettingsOpen ? (
        <ModalShell aria-labelledby="settings-title" onClose={() => setIsSettingsOpen(false)} variant="settings">
          <SettingsPanel onClose={() => setIsSettingsOpen(false)} titleId="settings-title" />
        </ModalShell>
      ) : null}
    </>
  );
}
