import type { ReactNode } from "react";

export function StateBlock({
  title,
  message,
  tone = "neutral",
}: {
  title: string;
  message: ReactNode;
  tone?: "neutral" | "error";
}) {
  return (
    <div className={`cp-state cp-state--${tone}`}>
      <h4>{title}</h4>
      <p>{message}</p>
    </div>
  );
}
