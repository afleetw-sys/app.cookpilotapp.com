"use client";

import { ArrowUpRight, LinkSimple, Sparkle, X } from "@phosphor-icons/react";
import { useState } from "react";
import { useAppearance, type AppearanceMode } from "@/components/providers/AppearanceProvider";
import { Button } from "@/components/ui/Button";

export function SettingsPanel({
  onClose,
}: {
  onClose?: () => void;
}) {
  const { appearanceMode, setAppearanceMode } = useAppearance();
  const [settingsStatus, setSettingsStatus] = useState<string | null>(null);

  async function handleShareWithFriend() {
    const shareMessage =
      "Check out CookPilot – save and tweak recipes from any link. https://apps.apple.com/app/cookpilot/id6753838076";

    try {
      if (navigator.share) {
        await navigator.share({
          text: shareMessage,
          url: "https://apps.apple.com/app/cookpilot/id6753838076",
        });
        setSettingsStatus(null);
        return;
      }

      await navigator.clipboard.writeText(shareMessage);
      setSettingsStatus("Share link copied.");
    } catch (error) {
      // User dismissed the native share sheet — not an error.
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error(error);
      setSettingsStatus("We couldn’t share right now.");
    }
  }

  function handleOpenRoadmap() {
    window.open(
      "https://good-problem-studio.userjot.com/?cursor=1&order=top&limit=10",
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <section className="cp-settings-card cp-page-card">
      <div className="cp-settings-card__header">
        <h2>Settings</h2>
        {onClose ? (
          <Button
            aria-label="Close settings"
            className="cp-settings-card__close"
            onClick={onClose}
            size="compact"
            variant="icon"
          >
            <X size={18} />
          </Button>
        ) : null}
      </div>

      <div className="cp-settings-card__section">
        <div className="cp-settings-card__section-title">
          <span>Appearance</span>
        </div>
        <div aria-label="Appearance" className="cp-appearance-toggle" role="tablist">
          {(["system", "light", "dark"] as const).map((mode: AppearanceMode) => (
            <button
              aria-selected={appearanceMode === mode}
              className={`cp-appearance-toggle__item ${
                appearanceMode === mode ? "is-active" : ""
              }`.trim()}
              key={mode}
              onClick={() => setAppearanceMode(mode)}
              role="tab"
              type="button"
            >
              <span>{mode === "system" ? "System" : mode === "light" ? "Light" : "Dark"}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="cp-settings-card__section">
        <button className="cp-settings-row" onClick={() => void handleShareWithFriend()} type="button">
          <div className="cp-settings-row__icon">
            <LinkSimple size={16} />
          </div>
          <span>Share with a friend</span>
        </button>
        <button className="cp-settings-row" onClick={handleOpenRoadmap} type="button">
          <div className="cp-settings-row__icon">
            <Sparkle size={16} />
          </div>
          <span>Feedback &amp; roadmap</span>
          <ArrowUpRight className="cp-settings-row__external" size={15} weight="bold" />
        </button>
        {settingsStatus ? <p className="cp-settings-card__status">{settingsStatus}</p> : null}
      </div>
    </section>
  );
}

export function SettingsPage() {
  return (
    <div className="cp-page-section">
      <div className="cp-section-header">
        <div>
          <p className="cp-eyebrow">Settings</p>
          <h1>Preferences</h1>
        </div>
      </div>

      <SettingsPanel />
    </div>
  );
}
