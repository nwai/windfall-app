import React from "react";

const WORKFLOW_LINKS = [
  { id: "workflow-history", label: "History" },
  { id: "workflow-signals", label: "Signals" },
  { id: "workflow-validation", label: "Validation" },
  { id: "workflow-generation", label: "Generation" },
  { id: "workflow-dga", label: "DGA" },
  { id: "workflow-patterns", label: "Patterns" },
] as const;

export const AppWorkflowNav: React.FC = () => (
  <nav className="windfall-workflow-nav" aria-label="Workflow sections">
    {WORKFLOW_LINKS.map((link) => (
      <a key={link.id} className="windfall-workflow-nav__link" href={`#${link.id}`}>
        {link.label}
      </a>
    ))}
  </nav>
);

interface WorkflowAnchorProps {
  id: string;
  title: string;
  summary: string;
}

export const WorkflowAnchor: React.FC<WorkflowAnchorProps> = ({ id, title, summary }) => (
  <div id={id} className="windfall-workflow-anchor" tabIndex={-1}>
    <div className="windfall-workflow-anchor__eyebrow">Workflow</div>
    <h2 className="windfall-workflow-anchor__title">{title}</h2>
    <p className="windfall-workflow-anchor__summary">{summary}</p>
  </div>
);
