"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/cookpilot/AuthCard";
import { useAuth } from "@/components/providers/AuthProvider";

type AuthStep = "emailEntry" | "passwordEntry";
type AuthMode = "signIn" | "signUp";

export function LoginPage() {
  const router = useRouter();
  const {
    status,
    isWorking,
    signInWithGoogle,
    signInWithApple,
    continueWithEmail,
    submitEmailAuth,
  } = useAuth();
  const [authStep, setAuthStep] = useState<AuthStep>("emailEntry");
  const [authMode, setAuthMode] = useState<AuthMode>("signIn");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authFullName, setAuthFullName] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/recipes");
    }
  }, [router, status]);

  function resetPasswordStep() {
    setAuthStep("emailEntry");
    setAuthPassword("");
    setAuthFullName("");
    setAuthError(null);
  }

  async function handleContinueWithEmail() {
    const normalizedEmail = authEmail.trim().toLowerCase();
    setAuthError(null);

    if (!normalizedEmail) {
      setAuthError("Please enter your email address.");
      return;
    }

    if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(normalizedEmail)) {
      setAuthError("Please enter a valid email address.");
      return;
    }

    try {
      const result = await continueWithEmail(normalizedEmail);
      setAuthEmail(normalizedEmail);

      switch (result.kind) {
        case "passwordSignIn":
          setAuthMode("signIn");
          setAuthStep("passwordEntry");
          return;
        case "passwordSignUp":
          setAuthMode("signUp");
          setAuthStep("passwordEntry");
          return;
        case "redirectToGoogle":
          await signInWithGoogle();
          return;
        case "showAppleMessage":
          setAuthError(result.message);
          return;
        default: {
          const exhaustiveResult: never = result;
          return exhaustiveResult;
        }
      }
    } catch (error) {
      console.error(error);
      setAuthError("Couldn't verify your account. Please try again.");
    }
  }

  async function handleSubmitPassword() {
    setAuthError(null);

    if (authMode === "signUp" && !authFullName.trim()) {
      setAuthError("Please enter your full name.");
      return;
    }

    if (!authPassword) {
      setAuthError(
        authMode === "signUp"
          ? "Please enter a password."
          : "Please enter your password.",
      );
      return;
    }

    if (authMode === "signUp" && authPassword.length < 6) {
      setAuthError("Password must be at least 6 characters long.");
      return;
    }

    try {
      await submitEmailAuth({
        email: authEmail,
        password: authPassword,
        fullName: authMode === "signUp" ? authFullName.trim() : undefined,
        mode: authMode,
      });
    } catch (error) {
      console.error(error);
      const errorCode = (error as { code?: string }).code;

      if (errorCode === "auth/user-not-found") {
        setAuthMode("signUp");
        setAuthError("No account found. Please create an account.");
        return;
      }

      if (errorCode === "auth/email-already-in-use" && authMode === "signUp") {
        setAuthMode("signIn");
        setAuthFullName("");
        setAuthError("This email already has an account. Please sign in.");
        return;
      }

      if (errorCode === "auth/account-exists-with-different-credential") {
        setAuthStep("emailEntry");
        setAuthError(
          "This email is registered with Google or Apple. Please use the sign-in buttons below.",
        );
        return;
      }

      if (
        errorCode === "auth/wrong-password" ||
        errorCode === "auth/invalid-credential"
      ) {
        setAuthError("Incorrect password. Please try again.");
        return;
      }

      setAuthError(
        authMode === "signUp"
          ? "Couldn't create account. Please check your connection and try again."
          : "Couldn't sign you in. Please try again.",
      );
    }
  }

  async function handleGoogleAuth() {
    setAuthError(null);
    await signInWithGoogle();
  }

  async function handleAppleAuth() {
    setAuthError(null);
    await signInWithApple();
  }

  return (
    <div className="cp-page cp-page--centered">
      <AuthCard
        authEmail={authEmail}
        authError={authError}
        authFullName={authFullName}
        authMode={authMode}
        authPassword={authPassword}
        authStep={authStep}
        isWorking={isWorking || status === "loading"}
        onApple={handleAppleAuth}
        onBack={resetPasswordStep}
        onContinueWithEmail={handleContinueWithEmail}
        onEmailChange={setAuthEmail}
        onFullNameChange={setAuthFullName}
        onGoogle={handleGoogleAuth}
        onPasswordChange={setAuthPassword}
        onSubmitPassword={handleSubmitPassword}
      />
    </div>
  );
}
