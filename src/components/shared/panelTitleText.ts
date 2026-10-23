import React from "react";

export function panelTitleText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(panelTitleText).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return panelTitleText(node.props.children);
  return "Panel";
}
