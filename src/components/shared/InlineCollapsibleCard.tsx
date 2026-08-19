import React, { useState } from "react";

interface InlineCollapsibleCardProps {
  id?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  collapsedSummary?: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  expanded?: boolean;
  keepMounted?: boolean;
  collapsedLabel?: React.ReactNode;
  expandedLabel?: React.ReactNode;
  onExpandedChange?: (value: boolean) => void;
}

export const InlineCollapsibleCard: React.FC<InlineCollapsibleCardProps> = ({
  id,
  title,
  subtitle,
  collapsedSummary,
  children,
  defaultExpanded = false,
  expanded,
  keepMounted = false,
  collapsedLabel = "Show",
  expandedLabel = "Hide",
  onExpandedChange,
}) => {
  const [internalExpanded, setInternalExpanded] = useState<boolean>(defaultExpanded);

  const isControlled = typeof expanded === "boolean";
  const isExpanded = isControlled ? expanded : internalExpanded;

  const handleToggle = (): void => {
    const next = !isExpanded;
    if (!isControlled) {
      setInternalExpanded(next);
    }
    onExpandedChange?.(next);
  };

  return (
    <div id={id} className="windfall-inline-card" tabIndex={id ? -1 : undefined}>
      <button
        type="button"
        onClick={handleToggle}
        className="windfall-inline-card__button"
        aria-expanded={isExpanded}
      >
        <span className="windfall-inline-card__heading">
          <span className="windfall-inline-card__title">{title}</span>
          {subtitle ? (
            <span className="windfall-inline-card__subtitle">{subtitle}</span>
          ) : null}
        </span>
        <span className="windfall-inline-card__toggle">
          {isExpanded ? expandedLabel : collapsedLabel}
        </span>
      </button>

      {!isExpanded && collapsedSummary ? (
        <div className="windfall-inline-card__summary">
          {collapsedSummary}
        </div>
      ) : null}

      {(isExpanded || keepMounted) ? (
        <div className="windfall-inline-card__body" hidden={!isExpanded} aria-hidden={!isExpanded}>
          {children}
        </div>
      ) : null}
    </div>
  );
};

export default InlineCollapsibleCard;
