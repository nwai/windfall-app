import React from 'react';
import type { DiamondModel } from '../../types/Diamond';
import { DiamondShapeSelector } from '../controls/DiamondShapeSelector';
import { DiamondVisibilityControls } from '../controls/DiamondVisibilityControls';

interface Props {
  diamonds: DiamondModel[];
  onChange: (updated: DiamondModel) => void;
}

export const DiamondInspectorPanel: React.FC<Props> = ({ diamonds, onChange }) => {
  if (!diamonds?.length) return <div style={{ fontSize: 12, color: '#666' }}>No diamonds yet.</div>;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {diamonds.map((d) => (
        <div key={d.id} style={{ border: '1px solid #ddd', borderRadius: 6, padding: 8 }}>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>Diamond {d.id}</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <DiamondShapeSelector diamond={d} onChange={onChange} />
            <DiamondVisibilityControls diamond={d} onChange={onChange} />
          </div>
        </div>
      ))}
    </div>
  );
};