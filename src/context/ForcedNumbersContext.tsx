import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type ForcedNumbersContextValue = {
  forcedNumbers: number[];
  setForcedNumbers: React.Dispatch<React.SetStateAction<number[]>>;
  add: (n: number) => void;
  remove: (n: number) => void;
  toggle: (n: number) => void;
  clear: () => void;
};

const ForcedNumbersContext = createContext<ForcedNumbersContextValue | undefined>(undefined);

const LS_KEY = "windfall.forcedNumbers";

function normalize(nums: number[]): number[] {
  // Keep valid range 1..45, unique, ascending
  const filtered = nums.filter((n) => Number.isInteger(n) && n >= 1 && n <= 45);
  return Array.from(new Set(filtered)).sort((a, b) => a - b);
}

export function ForcedNumbersProvider({ children }: { children: React.ReactNode }) {
  const [forcedNumbers, setForcedNumbers] = useState<number[]>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return normalize(parsed as number[]);
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(forcedNumbers));
    } catch {
      // ignore storage errors
    }
  }, [forcedNumbers]);

  const add = (n: number) => setForcedNumbers((prev) => normalize([...prev, n]));
  const remove = (n: number) => setForcedNumbers((prev) => prev.filter((x) => x !== n));
  const toggle = (n: number) =>
    setForcedNumbers((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : normalize([...prev, n])));
  const clear = () => setForcedNumbers([]);

  const value = useMemo<ForcedNumbersContextValue>(
    () => ({ forcedNumbers, setForcedNumbers, add, remove, toggle, clear }),
    [forcedNumbers]
  );

  return <ForcedNumbersContext.Provider value={value}>{children}</ForcedNumbersContext.Provider>;
}

export function useForcedNumbers(): ForcedNumbersContextValue {
  const ctx = useContext(ForcedNumbersContext);
  if (!ctx) {
    throw new Error("useForcedNumbers must be used within a ForcedNumbersProvider");
  }
  return ctx;
}