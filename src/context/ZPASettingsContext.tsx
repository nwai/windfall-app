import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "zpa:settings:v1";
const DEFAULT_ZONE_WEIGHTING_ENABLED = false;
const DEFAULT_ZONE_GAMMA = 0.5;

interface StoredZPASettings {
  zoneWeightingEnabled?: unknown;
  zoneGamma?: unknown;
}

export interface ZPASettingsContextValue {
  zoneWeightingEnabled: boolean;
  setZoneWeightingEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  zoneGamma: number;
  setZoneGamma: React.Dispatch<React.SetStateAction<number>>;
}

const ZPASettingsContext = createContext<ZPASettingsContextValue | null>(null);

function readStoredZPASettings(): { zoneWeightingEnabled: boolean; zoneGamma: number } {
  if (typeof window === "undefined") {
    return {
      zoneWeightingEnabled: DEFAULT_ZONE_WEIGHTING_ENABLED,
      zoneGamma: DEFAULT_ZONE_GAMMA,
    };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        zoneWeightingEnabled: DEFAULT_ZONE_WEIGHTING_ENABLED,
        zoneGamma: DEFAULT_ZONE_GAMMA,
      };
    }

    const parsed = JSON.parse(raw) as StoredZPASettings;
    const zoneWeightingEnabled = typeof parsed.zoneWeightingEnabled === "boolean"
      ? parsed.zoneWeightingEnabled
      : DEFAULT_ZONE_WEIGHTING_ENABLED;
    const zoneGamma = typeof parsed.zoneGamma === "number" && Number.isFinite(parsed.zoneGamma)
      ? parsed.zoneGamma
      : DEFAULT_ZONE_GAMMA;

    return { zoneWeightingEnabled, zoneGamma };
  } catch {
    return {
      zoneWeightingEnabled: DEFAULT_ZONE_WEIGHTING_ENABLED,
      zoneGamma: DEFAULT_ZONE_GAMMA,
    };
  }
}

export const ZPASettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialSettings = useMemo(() => readStoredZPASettings(), []);
  const [zoneWeightingEnabledState, setZoneWeightingEnabledState] = useState<boolean>(initialSettings.zoneWeightingEnabled);
  const [zoneGammaState, setZoneGammaState] = useState<number>(initialSettings.zoneGamma);

  const setZoneWeightingEnabled = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((value) => {
    setZoneWeightingEnabledState((previous) => {
      const resolved = typeof value === "function"
        ? (value as (previousValue: boolean) => boolean)(previous)
        : value;
      return Boolean(resolved);
    });
  }, []);

  const setZoneGamma = useCallback<React.Dispatch<React.SetStateAction<number>>>((value) => {
    setZoneGammaState((previous) => {
      const resolved = typeof value === "function"
        ? (value as (previousValue: number) => number)(previous)
        : value;
      return Number.isFinite(resolved) ? resolved : previous;
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          zoneWeightingEnabled: zoneWeightingEnabledState,
          zoneGamma: zoneGammaState,
        }),
      );
    } catch {
      // Ignore quota and serialization issues.
    }
  }, [zoneGammaState, zoneWeightingEnabledState]);

  const contextValue = useMemo<ZPASettingsContextValue>(
    () => ({
      zoneWeightingEnabled: zoneWeightingEnabledState,
      setZoneWeightingEnabled,
      zoneGamma: zoneGammaState,
      setZoneGamma,
    }),
    [setZoneGamma, setZoneWeightingEnabled, zoneGammaState, zoneWeightingEnabledState],
  );

  return <ZPASettingsContext.Provider value={contextValue}>{children}</ZPASettingsContext.Provider>;
};

export function useZPASettings(): ZPASettingsContextValue {
  const context = useContext(ZPASettingsContext);
  if (!context) {
    throw new Error("useZPASettings must be used inside ZPASettingsProvider");
  }
  return context;
}
