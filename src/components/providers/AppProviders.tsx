"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { AppearanceProvider } from "@/components/providers/AppearanceProvider";
import { SubscriptionProvider } from "@/components/providers/SubscriptionProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AppearanceProvider>
      <AuthProvider>
        {/* SubscriptionProvider must be inside AuthProvider — it reads useAuth() */}
        <SubscriptionProvider>{children}</SubscriptionProvider>
      </AuthProvider>
    </AppearanceProvider>
  );
}
