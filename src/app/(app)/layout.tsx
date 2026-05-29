import { AuthenticatedAppShell } from "@/components/cookpilot/AuthenticatedAppShell";

export default function ProductAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthenticatedAppShell>{children}</AuthenticatedAppShell>;
}
