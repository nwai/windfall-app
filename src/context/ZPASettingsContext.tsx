import React from 'react';

export interface ZPASettings {
  zoneWeightingEnabled: boolean;
  zoneGamma: number;
  setZoneWeightingEnabled: (v: boolean) => void;
  setZoneGamma: (g: number) => void;
}

const defaultValue: ZPASettings = {
  zoneWeightingEnabled: false,
  zoneGamma: 0.5,
  setZoneWeightingEnabled: () => {},
  setZoneGamma: () => {},
};

export const ZPASettingsContext = React.createContext<ZPASettings>(defaultValue);

export function useZPASettings() {
  return React.useContext(ZPASettingsContext);
}

export const ZPASettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [zoneWeightingEnabled, setZoneWeightingEnabled] = React.useState(false);
  const [zoneGamma, setZoneGamma] = React.useState(0.5);

  return (
    <ZPASettingsContext.Provider
      value={{ zoneWeightingEnabled, zoneGamma, setZoneWeightingEnabled, setZoneGamma }}
    >
      {children}
    </ZPASettingsContext.Provider>
  );
};