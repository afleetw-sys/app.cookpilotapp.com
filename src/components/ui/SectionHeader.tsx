import type { ReactNode } from "react";

export function SectionHeader({
  eyebrow,
  title,
  titleAddon,
  titleBelow,
  children,
}: {
  eyebrow?: string;
  title: string;
  titleAddon?: ReactNode;
  titleBelow?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="cp-section-header">
      <div>
        {eyebrow ? <p className="cp-eyebrow">{eyebrow}</p> : null}
        <div className="cp-section-header__title-row">
          <h3>{title}</h3>
          {titleAddon}
        </div>
        {titleBelow ? <div className="cp-section-header__title-below">{titleBelow}</div> : null}
      </div>
      {children}
    </div>
  );
}
