import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

interface ForcedNumbersContextValue {
  forcedNumbers: number[];
  setForcedNumbers: React.Dispatch<React.SetStateAction<number[]>>;
  addForcedNumber: (value: number) => void;
  removeForcedNumber: (value: number) => void;
  clearForcedNumbers: () => void;
}

const ForcedNumbersContext = createContext<ForcedNumbersContextValue | null>(null);

export const ForcedNumbersProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [forcedNumbers, setForcedNumbers] = useState<number[]>([]);

  const addForcedNumber = useCallback((value: number) => {
    setForcedNumbers((previous) => {
      if (previous.includes(value)) {
        return previous;
      }
      return [...previous, value].sort((a, b) => a - b);
    });
  }, []);

  const removeForcedNumber = useCallback((value: number) => {
    setForcedNumbers((previous) => previous.filter((entry) => entry !== value));
  }, []);

  const clearForcedNumbers = useCallback(() => {
    setForcedNumbers([]);
  }, []);

  const contextValue = useMemo<ForcedNumbersContextValue>(
    () => ({
      forcedNumbers,
      setForcedNumbers,
      addForcedNumber,
      removeForcedNumber,
      clearForcedNumbers,
    }),
    [addForcedNumber, clearForcedNumbers, forcedNumbers, removeForcedNumber],
  );

  return <ForcedNumbersContext.Provider value={contextValue}>{children}</ForcedNumbersContext.Provider>;
};

export function useForcedNumbers(): ForcedNumbersContextValue {
  const context = useContext(ForcedNumbersContext);
  if (!context) {
    throw new Error("useForcedNumbers must be used inside ForcedNumbersProvider");
  }
  return context;
}
