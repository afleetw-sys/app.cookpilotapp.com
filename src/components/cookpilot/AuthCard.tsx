"use client";

import Image from "next/image";
import { ArrowLeft, EnvelopeSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { StateBlock } from "@/components/ui/StateBlock";
import { TextField } from "@/components/ui/TextField";

type AuthStep = "emailEntry" | "passwordEntry";
type AuthMode = "signIn" | "signUp";

function AppleAuthLogo() {
  return (
    <svg
      aria-hidden="true"
      className="cp-auth-provider-logo"
      viewBox="0 0 24 24"
    >
      <path
        d="M16.365 12.683c.03 3.24 2.85 4.32 2.88 4.335-.024.078-.45 1.545-1.485 3.06-.894 1.305-1.821 2.61-3.282 2.637-1.434.027-1.893-.852-3.531-.852-1.638 0-2.148.825-3.504.879-1.41.054-2.484-1.413-3.387-2.712-1.845-2.664-3.255-7.53-1.359-10.824.939-1.638 2.619-2.673 4.443-2.7 1.386-.027 2.691.933 3.531.933.84 0 2.415-1.155 4.068-.984.69.03 2.625.279 3.867 2.097-.099.063-2.31 1.347-2.241 4.131Zm-2.73-8.478c.75-.906 1.257-2.169 1.119-3.42-1.08.042-2.388.72-3.162 1.623-.696.804-1.305 2.094-1.143 3.33 1.203.093 2.433-.612 3.186-1.533Z"
        fill="currentColor"
      />
    </svg>
  );
}

function GoogleAuthLogo() {
  return (
    <svg
      aria-hidden="true"
      className="cp-auth-provider-logo"
      viewBox="0 0 24 24"
    >
      <path
        d="M23.52 12.272c0-.82-.073-1.607-.209-2.363H12v4.47h6.48a5.54 5.54 0 0 1-2.4 3.636v3.018h3.89c2.278-2.097 3.55-5.19 3.55-8.76Z"
        fill="#4285F4"
      />
      <path
        d="M12 24c3.24 0 5.955-1.074 7.94-2.907l-3.89-3.018c-1.074.72-2.45 1.147-4.05 1.147-3.111 0-5.744-2.1-6.686-4.925H1.293v3.114A11.997 11.997 0 0 0 12 24Z"
        fill="#34A853"
      />
      <path
        d="M5.314 14.297A7.214 7.214 0 0 1 4.94 12c0-.798.136-1.573.374-2.297V6.589H1.293A11.997 11.997 0 0 0 0 12c0 1.935.464 3.767 1.293 5.411l4.021-3.114Z"
        fill="#FBBC04"
      />
      <path
        d="M12 4.778c1.764 0 3.348.606 4.596 1.794l3.447-3.447C17.949 1.19 15.234 0 12 0A11.997 11.997 0 0 0 1.293 6.589l4.021 3.114C6.256 6.878 8.889 4.778 12 4.778Z"
        fill="#EA4335"
      />
    </svg>
  );
}

export type AuthCardProps = {
  isWorking: boolean;
  authStep: AuthStep;
  authMode: AuthMode;
  authEmail: string;
  authPassword: string;
  authFullName: string;
  authError: string | null;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onFullNameChange: (value: string) => void;
  onContinueWithEmail: () => Promise<void>;
  onBack: () => void;
  onSubmitPassword: () => Promise<void>;
  onGoogle: () => Promise<void>;
  onApple: () => Promise<void>;
};

export function AuthCard({
  isWorking,
  authStep,
  authMode,
  authEmail,
  authPassword,
  authFullName,
  authError,
  onEmailChange,
  onPasswordChange,
  onFullNameChange,
  onContinueWithEmail,
  onBack,
  onSubmitPassword,
  onGoogle,
  onApple,
}: AuthCardProps) {
  return (
    <section className="cp-auth-card">
      <div className="cp-auth-card__logo">
        <Image alt="CookPilot" height={80} src="/images/cp-logo-lg.png" width={80} />
      </div>
      <div className="cp-auth-card__copy">
        <p className="cp-eyebrow">CookPilot</p>
        <h2>Welcome to CookPilot</h2>
        <p>Sign in to save, edit, and revisit your recipes.</p>
      </div>
      {authStep === "emailEntry" ? (
        <div className="cp-auth-card__flow">
          <TextField
            autoComplete="email"
            label="Email"
            onChange={(event) => onEmailChange(event.target.value)}
            placeholder="email@email.com"
            type="email"
            value={authEmail}
          />
          {authError ? <StateBlock message={authError} title="Sign-in issue" tone="error" /> : null}
          <Button disabled={isWorking} onClick={() => void onContinueWithEmail()}>
            <EnvelopeSimple size={18} />
            Continue with email
          </Button>
          <div className="cp-auth-card__divider">
            <span />
            <p>or</p>
            <span />
          </div>
          <Button disabled={isWorking} onClick={() => void onGoogle()} variant="secondary">
            <GoogleAuthLogo />
            Continue with Google
          </Button>
          <Button disabled={isWorking} onClick={() => void onApple()} variant="secondary">
            <AppleAuthLogo />
            Continue with Apple
          </Button>
        </div>
      ) : (
        <div className="cp-auth-card__flow">
          <button className="cp-auth-card__back" onClick={onBack} type="button">
            <ArrowLeft size={16} />
            <span>{authEmail}</span>
          </button>
          {authMode === "signUp" ? (
            <TextField
              autoComplete="name"
              label="Full Name"
              onChange={(event) => onFullNameChange(event.target.value)}
              placeholder="Jane Smith"
              value={authFullName}
            />
          ) : null}
          <TextField
            autoComplete={authMode === "signUp" ? "new-password" : "current-password"}
            label="Password"
            onChange={(event) => onPasswordChange(event.target.value)}
            placeholder={
              authMode === "signUp"
                ? "Create a password (6+ characters)"
                : "Enter your password"
            }
            type="password"
            value={authPassword}
          />
          {authError ? <StateBlock message={authError} title="Sign-in issue" tone="error" /> : null}
          <Button disabled={isWorking} onClick={() => void onSubmitPassword()}>
            {authMode === "signUp" ? "Create account" : "Sign in"}
          </Button>
        </div>
      )}
      <p className="cp-auth-card__legal">
        By continuing, you agree to CookPilot&apos;s{" "}
        <a
          href="https://www.pageturnerapp.com/cookpilot-privacy-policy"
          rel="noreferrer"
          target="_blank"
        >
          Privacy Policy
        </a>{" "}
        and{" "}
        <a
          href="https://www.pageturnerapp.com/cookpilot-terms-of-service"
          rel="noreferrer"
          target="_blank"
        >
          Terms of Service
        </a>
        .
      </p>
    </section>
  );
}
