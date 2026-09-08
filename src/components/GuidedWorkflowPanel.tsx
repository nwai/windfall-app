import React from "react";

export type GuidedWorkflowTone = "ready" | "review" | "optional" | "after";

export interface GuidedWorkflowStep {
  id: string;
  title: string;
  detail: string;
  status: string;
  tone: GuidedWorkflowTone;
  href: string;
  actionLabel: string;
}

interface GuidedWorkflowPanelProps {
  setupSummary: string;
  preDrawSteps: GuidedWorkflowStep[];
  postDrawSteps: GuidedWorkflowStep[];
}

const toneLabelClass: Record<GuidedWorkflowTone, string> = {
  ready: "windfall-guided-workflow__status--ready",
  review: "windfall-guided-workflow__status--review",
  optional: "windfall-guided-workflow__status--optional",
  after: "windfall-guided-workflow__status--after",
};

const GuidedWorkflowStepCard: React.FC<{
  step: GuidedWorkflowStep;
  index: number;
}> = ({ step, index }) => (
  <article className="windfall-guided-workflow__step">
    <div className="windfall-guided-workflow__step-topline">
      <span className="windfall-guided-workflow__step-number" aria-label={`Step ${index + 1}`}>
        {index + 1}
      </span>
      <span className={`windfall-guided-workflow__status ${toneLabelClass[step.tone]}`}>
        {step.status}
      </span>
    </div>
    <h3 className="windfall-guided-workflow__step-title">{step.title}</h3>
    <p className="windfall-guided-workflow__step-detail">{step.detail}</p>
    <a className="windfall-guided-workflow__step-link" href={step.href}>
      {step.actionLabel}
    </a>
  </article>
);

export const GuidedWorkflowPanel: React.FC<GuidedWorkflowPanelProps> = ({
  setupSummary,
  preDrawSteps,
  postDrawSteps,
}) => (
  <section className="windfall-guided-workflow" aria-labelledby="windfall-guided-workflow-title">
    <div className="windfall-guided-workflow__header">
      <div>
        <p className="windfall-guided-workflow__eyebrow">Guided Setup</p>
        <h2 id="windfall-guided-workflow-title" className="windfall-guided-workflow__title">
          What to do before the next draw
        </h2>
      </div>
      <p className="windfall-guided-workflow__summary">{setupSummary}</p>
    </div>

    <div className="windfall-guided-workflow__lanes">
      <div className="windfall-guided-workflow__lane">
        <div className="windfall-guided-workflow__lane-heading">
          <span>Pre-draw path</span>
          <small>Setup, inspect, generate, save</small>
        </div>
        <div className="windfall-guided-workflow__steps">
          {preDrawSteps.map((step, index) => (
            <GuidedWorkflowStepCard key={step.id} step={step} index={index} />
          ))}
        </div>
      </div>

      <div className="windfall-guided-workflow__lane windfall-guided-workflow__lane--after">
        <div className="windfall-guided-workflow__lane-heading">
          <span>After the draw happens</span>
          <small>Enter result, inspect prizes, score notes</small>
        </div>
        <div className="windfall-guided-workflow__steps">
          {postDrawSteps.map((step, index) => (
            <GuidedWorkflowStepCard key={step.id} step={step} index={index} />
          ))}
        </div>
      </div>
    </div>
  </section>
);

export default GuidedWorkflowPanel;
