"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { AppearanceProvider } from "@/components/providers/AppearanceProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AppearanceProvider>
      <AuthProvider>{children}</AuthProvider>
    </AppearanceProvider>
  );
}
