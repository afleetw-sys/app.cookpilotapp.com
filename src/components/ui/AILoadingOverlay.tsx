"use client";

import { Sparkle } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

function AnimatedDot({ delay }: { delay: number }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setActive(true), delay * 1000);
    return () => clearTimeout(timeout);
  }, [delay]);

  return (
    <span
      className="cp-ai-overlay__dot"
      style={{ animationDelay: `${delay}s`, animationPlayState: active ? "running" : "paused" }}
    />
  );
}

export function AILoadingOverlay({
  title = "Updating your recipe",
  subtitle = "This will take a few moments.",
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="cp-ai-overlay" role="status" aria-label={title}>
      <div className="cp-ai-overlay__content">
        <div className="cp-ai-overlay__spinner-wrap">
          <span className="cp-ai-overlay__ring" />
          <Sparkle className="cp-ai-overlay__sparkle" size={24} weight="fill" />
        </div>

        <div className="cp-ai-overlay__text">
          <p className="cp-ai-overlay__title">{title}</p>
          <p className="cp-ai-overlay__subtitle">{subtitle}</p>
        </div>

        <div className="cp-ai-overlay__dots" aria-hidden="true">
          <AnimatedDot delay={0} />
          <AnimatedDot delay={0.2} />
          <AnimatedDot delay={0.4} />
        </div>
      </div>
    </div>
  );
}
