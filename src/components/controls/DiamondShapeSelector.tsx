import React from 'react';
import type { DiamondModel, DiamondShape } from '../../types/Diamond';

const options: { value: DiamondShape; label: string }[] = [
  { value: 'manhattan', label: 'Manhattan (diamond)' },
  { value: 'square', label: 'Square' },
  { value: 'circle', label: 'Circle' },
  { value: 'doubleHelix', label: 'Double Helix (v2 soon)' },
];

interface Props {
  diamond: DiamondModel;
  onChange: (updated: DiamondModel) => void;
}

export const DiamondShapeSelector: React.FC<Props> = ({ diamond, onChange }) => {
  return (
    <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      Shape:
      <select
        value={diamond.shape ?? 'manhattan'}
        onChange={(e) => onChange({ ...diamond, shape: e.target.value as DiamondShape })}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
};