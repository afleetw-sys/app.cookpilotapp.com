import type { ReactNode } from "react";

export function SectionHeader({
  eyebrow,
  title,
  titleAccessory,
  children,
}: {
  eyebrow?: string;
  title: string;
  titleAccessory?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="cp-section-header">
      <div>
        {eyebrow ? <p className="cp-eyebrow">{eyebrow}</p> : null}
        <div className="cp-section-header__title-row">
          <h3>{title}</h3>
          {titleAccessory}
        </div>
      </div>
      {children}
    </div>
  );
}
