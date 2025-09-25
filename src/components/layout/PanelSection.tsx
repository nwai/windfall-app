import React from 'react';
import { useCandidates } from '../../shared/CandidatesContext';

interface PanelSectionProps {
  title: string;
  id?: string;
  children: React.ReactNode;
  allowWhenLocked?: boolean;
  actions?: React.ReactNode;
}

export const PanelSection: React.FC<PanelSectionProps> = ({
  title, id, children, allowWhenLocked = false, actions
}) => {
  const { lock } = useCandidates();
  const locked = lock && !allowWhenLocked;
  return (
    <section id={id} style={{
      border: '1px solid #ddd',
      borderRadius: 6,
      padding: '8px 10px',
      opacity: locked ? 0.55 : 1,
      position: 'relative',
      background: '#fff'
    }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>{title}</h3>
        {actions}
      </header>
      {locked && (
        <div style={{
          position: 'absolute', top: 4, right: 8,
          fontSize: 11, color: '#c00'
        }}>Locked</div>
      )}
      <div style={{ pointerEvents: locked ? 'none' : 'auto' }}>
        {children}
      </div>
    </section>
  );
};