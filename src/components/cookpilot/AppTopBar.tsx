"use client";

import Image from "next/image";
import { GearSix, User, X } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useClickOutside } from "@/lib/useClickOutside";
import { TextField } from "@/components/ui/TextField";

function initialsForUser(email: string | null | undefined, displayName: string | null | undefined) {
  const source = displayName?.trim() || email?.trim() || "";
  if (!source) return "";

  const words = source
    .replace(/@.*$/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

export function AppTopBar({
  onSettingsClick,
  onSignInClick,
}: {
  onSettingsClick?: () => void;
  onSignInClick?: () => void;
}) {
  const router = useRouter();
  const { user, isWorking, signOutCurrentUser, deleteCurrentUser } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [accountError, setAccountError] = useState<string | null>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  useClickOutside(accountMenuRef, useCallback(() => setIsMenuOpen(false), []));

  const initials = initialsForUser(user?.email, user?.displayName);
  const isAnonymous = user?.isAnonymous ?? true;
  const accountName = user?.displayName?.trim() || "Signed in";
  const accountEmail = user?.email?.trim() || "No email on this account";

  async function handleSignOut() {
    setAccountError(null);

    try {
      await signOutCurrentUser();
      router.replace("/login");
    } catch (error) {
      console.error(error);
      setAccountError("We couldn’t sign you out. Please try again.");
    }
  }

  async function handleDeleteCurrentAccount() {
    setAccountError(null);

    try {
      await deleteCurrentUser(deletePassword || undefined);
      router.replace("/login");
    } catch (error) {
      console.error(error);

      if ((error as { code?: string }).code === "cp/password-reauth-required") {
        setAccountError("Enter your password to delete this account.");
        return;
      }

      setAccountError("We couldn’t delete your account. Please try again.");
    }
  }

  function handleDeleteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isWorking) {
      void handleDeleteCurrentAccount();
    }
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setIsMenuOpen(false);
    }
  }

  return (
    <div className="cp-topbar">
      <button className="cp-topbar__brand" onClick={() => router.push("/recipes")} type="button">
        <Image alt="CookPilot" height={30} src="/images/cp-logo-lg.png" width={30} />
        <span>CookPilot</span>
      </button>

      <div className="cp-topbar__actions">
        <button
          aria-label="Settings"
          className="cp-topbar__action cp-topbar__action--icon"
          onClick={() => {
            if (onSettingsClick) {
              onSettingsClick();
              return;
            }

            router.push("/settings");
          }}
          type="button"
        >
          <GearSix size={18} weight="regular" />
        </button>
        {isAnonymous ? (
          <button
            className="cp-topbar__signin"
            onClick={() => {
              if (onSignInClick) {
                onSignInClick();
                return;
              }

              router.push("/login");
            }}
            type="button"
          >
            Sign in
          </button>
        ) : (
          <div className="cp-topbar__account" ref={accountMenuRef}>
            {isMenuOpen ? (
              <div
                aria-label="Account actions"
                className="cp-rail__menu"
                onKeyDown={handleMenuKeyDown}
                role="menu"
              >
                <button
                  aria-label="Close account menu"
                  className="cp-rail__menu-close"
                  onClick={() => setIsMenuOpen(false)}
                  type="button"
                >
                  <X size={16} />
                </button>
                <div className="cp-rail__account-summary">
                  <div className="cp-rail__account-avatar" aria-hidden="true">
                    {initials ? <span>{initials}</span> : <User size={17} weight="regular" />}
                  </div>
                  <div className="cp-rail__account-text">
                    <p className="cp-rail__account-name">{accountName}</p>
                    <p className="cp-rail__account-email">{accountEmail}</p>
                  </div>
                </div>
                {showDeleteConfirm ? (
                  <form className="cp-rail__menu-form" onSubmit={handleDeleteSubmit}>
                    <div className="cp-rail__menu-header">
                      <div>
                        <p className="cp-rail__menu-title">Delete account?</p>
                        <p className="cp-rail__menu-copy">
                          This permanently removes your CookPilot account and saved recipes.
                        </p>
                      </div>
                    </div>
                    <TextField
                      label="Password if needed"
                      onChange={(event) => setDeletePassword(event.target.value)}
                      placeholder="Enter password for email accounts"
                      type="password"
                      value={deletePassword}
                    />
                    <button
                      className="cp-rail__menu-action cp-rail__menu-action--danger"
                      disabled={isWorking}
                      type="submit"
                    >
                      Delete account
                    </button>
                    <button
                      className="cp-rail__menu-action"
                      disabled={isWorking}
                      onClick={() => {
                        setShowDeleteConfirm(false);
                        setDeletePassword("");
                        setAccountError(null);
                      }}
                      type="button"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="cp-rail__menu-header">
                      <p className="cp-rail__menu-title">Account</p>
                    </div>
                    <button
                      className="cp-rail__menu-action cp-rail__menu-action--danger"
                      disabled={isWorking}
                      onClick={() => {
                        setAccountError(null);
                        setShowDeleteConfirm(true);
                      }}
                      type="button"
                    >
                      Delete account
                    </button>
                    <button
                      className="cp-rail__menu-action"
                      disabled={isWorking}
                      onClick={() => void handleSignOut()}
                      type="button"
                    >
                      Sign out
                    </button>
                  </>
                )}
                {accountError ? <p className="cp-rail__menu-error">{accountError}</p> : null}
              </div>
            ) : null}
            <button
              aria-label="Account"
              className="cp-topbar__action cp-topbar__action--account is-signed-in"
              onClick={() => {
                setAccountError(null);
                setShowDeleteConfirm(false);
                setDeletePassword("");
                setIsMenuOpen((current) => !current);
              }}
              type="button"
            >
              {initials ? <span>{initials}</span> : <User size={18} weight="regular" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
