import React, { useId, useState } from "react";

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

interface InfoHelpProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

export const InfoHelp: React.FC<InfoHelpProps> = ({ label, children, className }) => {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggleOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setOpen((value) => !value);
  };

  return (
    <span className={["windfall-info-help", className ?? ""].filter(Boolean).join(" ")}>
      <button
        type="button"
        className="windfall-info-help__button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggleOpen}
      >
        ?
      </button>
      <span id={panelId} className="windfall-info-help__panel" hidden={!open}>
        {children}
      </span>
    </span>
  );
};
