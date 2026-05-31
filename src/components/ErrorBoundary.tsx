"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div
            style={{
              alignItems: "center",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              height: "100dvh",
              justifyContent: "center",
              padding: "24px",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: "1rem", opacity: 0.7 }}>
              Something went wrong. Please reload the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: "transparent",
                border: "1px solid currentColor",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "0.875rem",
                opacity: 0.7,
                padding: "8px 16px",
              }}
              type="button"
            >
              Reload
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
