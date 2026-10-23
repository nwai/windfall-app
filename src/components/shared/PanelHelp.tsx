import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getEvidenceFamily, getPanelOwnership } from "../../lib/evidenceFamilyRegistry";
import { getPanelHelp } from "../../lib/panelHelp";
import { HigButton } from "./HigControls";

interface Props {
  panelId?: string;
  title: string;
  summary?: string;
  onReveal?: () => void;
}

export function PanelHelp({ panelId, title, summary, onReveal }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const help = getPanelHelp(panelId, title, summary);
  const owner = panelId ? getPanelOwnership(panelId) : undefined;
  const family = owner ? getEvidenceFamily(owner.primaryFamily) : undefined;

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const trigger = triggerRef.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open]);

  return <>
    <HigButton ref={triggerRef} size="compact" variant="quiet" className="windfall-panel-help__trigger"
      aria-label={`About ${title}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={event => { event.preventDefault(); event.stopPropagation(); setOpen(true); }}>
      <span aria-hidden="true">?</span>
    </HigButton>
    {open && typeof document !== "undefined" ? createPortal(
      <dialog ref={dialogRef} id={id} className="windfall-panel-help" aria-labelledby={`${id}-title`}
        onCancel={event => { event.preventDefault(); setOpen(false); }}
        onClose={() => setOpen(false)}
        onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) setOpen(false); }}
        onKeyDown={event => {
          event.stopPropagation();
          if (event.key !== "Tab") return;
          const controls = event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]");
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (!first || !last) return;
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }}>
        <div className="windfall-panel-help__header">
          <h2 id={`${id}-title`}>{title}</h2>
          <HigButton size="compact" onClick={() => setOpen(false)} autoFocus>Close</HigButton>
        </div>
        <p className="windfall-panel-help__purpose">{help.purpose}</p>
        <dl className="windfall-panel-help__facts">
          <div><dt>What it is</dt><dd>{help.role}</dd></div>
          <div><dt>Startup state</dt><dd>Closed. Opening or closing a panel does not enable, disable or reset its rules. Saved settings may still be active; check the panel's controls and Active Setup Summary.</dd></div>
          <div><dt>Selections & generation</dt><dd>{help.interaction}</dd></div>
          <div><dt>Data & scope</dt><dd>{help.scope}</dd></div>
          <div><dt>Reliability & tests</dt><dd>{help.reliability}</dd></div>
          {family ? <div><dt>Shared evidence</dt><dd>{family.title}{owner?.dependencies.length ? `; also reads ${owner.dependencies.map(dependency => getEvidenceFamily(dependency)?.title ?? dependency).join(", ")}` : ""}. Repeated views of one source do not create independent evidence.</dd></div> : null}
        </dl>
        <div className="windfall-panel-help__footer">
          <a href={`/user-manual.html#${help.manualAnchor}`} target="_blank" rel="noreferrer">User manual</a>
          {onReveal ? <HigButton onClick={() => { setOpen(false); onReveal(); }}>Open panel</HigButton> : null}
        </div>
      </dialog>, document.body,
    ) : null}
  </>;
}
