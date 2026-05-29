import type { ReactNode } from "react";

export function AppShell({
  topbar,
  main,
}: {
  topbar?: ReactNode;
  main: ReactNode;
}) {
  return (
    <div className="cp-app-shell">
      {topbar ? <header className="cp-app-shell__topbar">{topbar}</header> : null}
      <main className="cp-shell cp-shell--board-only">
        <section className="cp-shell__main">{main}</section>
      </main>
    </div>
  );
}
