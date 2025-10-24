import React from 'react';
import type { DiamondModel } from '../../types/Diamond';

interface Props {
  diamond: DiamondModel;
  onChange: (updated: DiamondModel) => void;
}

export const DiamondVisibilityControls: React.FC<Props> = ({ diamond, onChange }) => {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <label>
        Hidden:
        <input
          type="checkbox"
          checked={!!diamond.hidden}
          onChange={(e) => onChange({ ...diamond, hidden: e.target.checked })}
          style={{ marginLeft: 6 }}
        />
      </label>
      <label>
        Opacity:
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={diamond.opacity ?? 1}
          onChange={(e) => onChange({ ...diamond, opacity: parseFloat(e.target.value) })}
          style={{ width: 120, marginLeft: 6 }}
        />
        <span style={{ marginLeft: 6, fontSize: 12 }}>{(diamond.opacity ?? 1).toFixed(2)}</span>
      </label>
      <label>
        Fill:
        <input
          type="checkbox"
          checked={diamond.fill !== false}
          onChange={(e) => onChange({ ...diamond, fill: e.target.checked })}
          style={{ marginLeft: 6 }}
        />
      </label>
    </div>
  );
};