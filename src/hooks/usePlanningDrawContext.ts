import { useEffect, useMemo, useState } from "react";

import type { Draw } from "../types";
import {
  buildPlanningDrawContext,
  localDateKey,
  type PlanningDrawContext,
} from "../lib/planningDrawContext";

const msUntilNextLocalDay = (now = new Date()): number => {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  return Math.max(1_000, next.getTime() - now.getTime());
};

export const useLocalDateKey = (): string => {
  const [dateKey, setDateKey] = useState(() => localDateKey());

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      timeoutId = setTimeout(() => {
        setDateKey(localDateKey());
        schedule();
      }, msUntilNextLocalDay());
    };

    schedule();
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return dateKey;
};

export const usePlanningDrawContext = (history: readonly Draw[]): PlanningDrawContext => {
  const dateKey = useLocalDateKey();
  return useMemo(
    () => buildPlanningDrawContext(history, { now: new Date(`${dateKey}T00:00:00`) }),
    [dateKey, history],
  );
};
