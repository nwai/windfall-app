import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type HigButtonVariant = "primary" | "secondary" | "quiet" | "danger";
type HigButtonSize = "normal" | "compact";

export interface HigButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: HigButtonVariant;
  size?: HigButtonSize;
}

export const HigButton = React.forwardRef<HTMLButtonElement, HigButtonProps>(
  ({ variant = "secondary", size = "normal", className, type = "button", ...props }, ref) => {
    const classes = [
      "windfall-hig-button",
      `windfall-hig-button--${variant}`,
      size === "compact" ? "windfall-hig-button--compact" : "",
      className ?? "",
    ].filter(Boolean).join(" ");

    return <button ref={ref} type={type} className={classes} {...props} />;
  },
);

HigButton.displayName = "HigButton";

interface HigFieldProps {
  id?: string;
  label: React.ReactNode;
  help?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const HigField: React.FC<HigFieldProps> = ({ id, label, help, error, children, className }) => {
  const fallbackId = useId();
  const fieldId = id ?? fallbackId;
  const helpId = help ? `${fieldId}-help` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;
  let control = children;

  if (React.isValidElement(children)) {
    type FieldChildProps = React.HTMLAttributes<HTMLElement> & {
      id?: string;
      "aria-describedby"?: string;
      "aria-invalid"?: boolean | "true" | "false";
    };
    const child = children as React.ReactElement<FieldChildProps>;
    control = React.cloneElement(child, {
      id: child.props.id ?? fieldId,
      "aria-describedby": [child.props["aria-describedby"], describedBy].filter(Boolean).join(" ") || undefined,
      "aria-invalid": error ? true : child.props["aria-invalid"],
    });
  }

  return (
    <div className={["windfall-hig-field", className ?? ""].filter(Boolean).join(" ")}>
      <label className="windfall-hig-field__label" htmlFor={fieldId}>
        {label}
      </label>
      <div className="windfall-hig-field__control">
        {control}
      </div>
      {help ? <div id={helpId} className="windfall-hig-field__help">{help}</div> : null}
      {error ? <div id={errorId} className="windfall-hig-field__error" role="alert">{error}</div> : null}
    </div>
  );
};

export interface HigSliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange"> {
  value: number;
  onCommit: (value: number) => void;
  onPreview?: (value: number) => void;
}

const numberFromSliderEvent = (
  event: React.ChangeEvent<HTMLInputElement> | React.SyntheticEvent<HTMLInputElement>,
): number => {
  const value = Number(event.currentTarget.value);
  return Number.isFinite(value) ? value : 0;
};

export const HigSlider = React.forwardRef<HTMLInputElement, HigSliderProps>(
  ({ value, onCommit, onPreview, className, disabled, ...props }, ref) => {
    const [draftValue, setDraftValue] = useState<number>(value);
    const lastCommittedValueRef = useRef<number>(value);

    useEffect(() => {
      lastCommittedValueRef.current = value;
      setDraftValue(value);
    }, [value]);

    const commitValue = useCallback((nextValue: number) => {
      if (disabled || !Number.isFinite(nextValue)) return;
      if (Object.is(nextValue, lastCommittedValueRef.current)) return;
      lastCommittedValueRef.current = nextValue;
      onCommit(nextValue);
    }, [disabled, onCommit]);

    const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
      const nextValue = numberFromSliderEvent(event);
      setDraftValue(nextValue);
      onPreview?.(nextValue);
    }, [onPreview]);

    const handleCommit = useCallback((event: React.SyntheticEvent<HTMLInputElement>) => {
      commitValue(numberFromSliderEvent(event));
    }, [commitValue]);

    return (
      <input
        {...props}
        ref={ref}
        type="range"
        className={["windfall-hig-slider", className ?? ""].filter(Boolean).join(" ")}
        value={draftValue}
        disabled={disabled}
        onChange={handleChange}
        onPointerUp={handleCommit}
        onMouseUp={handleCommit}
        onTouchEnd={handleCommit}
        onKeyUp={handleCommit}
        onBlur={handleCommit}
      />
    );
  },
);

HigSlider.displayName = "HigSlider";

interface InfoHelpProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

interface InfoHelpPanelPosition {
  left: number;
  top: number;
  width: number;
}

const INFO_HELP_VIEWPORT_MARGIN = 12;
const INFO_HELP_BUTTON_GAP = 8;
const INFO_HELP_MAX_WIDTH = 280;
const INFO_HELP_MIN_WIDTH = 180;
const INFO_HELP_FALLBACK_HEIGHT = 132;

const clampNumber = (value: number, min: number, max: number): number => (
  Math.min(Math.max(value, min), max)
);

export const InfoHelp: React.FC<InfoHelpProps> = ({ label, children, className }) => {
  const [open, setOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<InfoHelpPanelPosition | null>(null);
  const panelId = useId();
  const fallbackId = `${panelId}-closed-description`;
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLSpanElement | null>(null);

  const toggleOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setPanelPosition(null);
    setOpen((value) => !value);
  };

  const updatePanelPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button || typeof window === "undefined") return;

    const buttonRect = button.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || INFO_HELP_MAX_WIDTH;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 600;
    const availableWidth = Math.max(
      INFO_HELP_MIN_WIDTH,
      viewportWidth - (INFO_HELP_VIEWPORT_MARGIN * 2),
    );
    const width = Math.min(INFO_HELP_MAX_WIDTH, availableWidth);
    const panelHeight = panelRef.current?.getBoundingClientRect().height || INFO_HELP_FALLBACK_HEIGHT;
    const minLeft = INFO_HELP_VIEWPORT_MARGIN;
    const maxLeft = Math.max(minLeft, viewportWidth - width - INFO_HELP_VIEWPORT_MARGIN);
    const preferredLeft = buttonRect.left + (buttonRect.width / 2) - (width / 2);
    const left = clampNumber(preferredLeft, minLeft, maxLeft);
    const belowTop = buttonRect.bottom + INFO_HELP_BUTTON_GAP;
    const aboveTop = buttonRect.top - panelHeight - INFO_HELP_BUTTON_GAP;
    const top = belowTop + panelHeight + INFO_HELP_VIEWPORT_MARGIN <= viewportHeight
      ? belowTop
      : Math.max(INFO_HELP_VIEWPORT_MARGIN, aboveTop);
    const nextPosition = { left: Math.round(left), top: Math.round(top), width: Math.round(width) };

    setPanelPosition((current) => (
      current
      && current.left === nextPosition.left
      && current.top === nextPosition.top
      && current.width === nextPosition.width
        ? current
        : nextPosition
    ));
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    updatePanelPosition();
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);

    return () => {
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [open, updatePanelPosition]);

  const panel = open && typeof document !== "undefined" ? createPortal(
    <span
      ref={panelRef}
      id={panelId}
      className="windfall-info-help__panel"
      role="tooltip"
      style={{
        left: panelPosition ? `${panelPosition.left}px` : `${INFO_HELP_VIEWPORT_MARGIN}px`,
        top: panelPosition ? `${panelPosition.top}px` : `${INFO_HELP_VIEWPORT_MARGIN}px`,
        width: panelPosition ? `${panelPosition.width}px` : `min(${INFO_HELP_MAX_WIDTH}px, calc(100vw - ${INFO_HELP_VIEWPORT_MARGIN * 2}px))`,
        visibility: panelPosition ? "visible" : "hidden",
      }}
    >
      {children}
    </span>,
    document.body,
  ) : null;

  return (
    <span className={["windfall-info-help", className ?? ""].filter(Boolean).join(" ")}>
      <button
        ref={buttonRef}
        type="button"
        className="windfall-info-help__button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        aria-describedby={open ? panelId : fallbackId}
        onClick={toggleOpen}
      >
        ?
      </button>
      <span id={fallbackId} className="windfall-visually-hidden">
        {children}
      </span>
      {panel}
    </span>
  );
};
