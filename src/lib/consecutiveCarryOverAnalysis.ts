import type { Draw } from "../types";
import { parseDrawDateToEpoch, sortDrawsChronologically } from "./recentDraws";

const TOTAL_NUMBERS = 45;

export interface ConsecutiveCarryOverEvent {
  number: number;
  startMonthLabel: string;
  consecutiveCarryOvers: number; // How many times it carried over (1 = undrawn in month1, hit in month2; 2 = undrawn in month1, undrawn in month2, hit in month3, etc.)
}

export interface ConsecutiveCarryOverDistribution {
  oneCarryOver: number; // Numbers that carried over 1 time
  twoCarryOvers: number; // Numbers that carried over 2 times
  threeCarryOvers: number; // Numbers that carried over 3 times
  fourPlusCarryOvers: number; // Numbers that carried over 4+ times
  total: number;
  percentageOneCarryOver: number;
  percentageTwoCarryOvers: number;
  percentageThreeCarryOvers: number;
  percentageFourPlusCarryOvers: number;
}

export interface ConsecutiveCarryOverAnalysis {
  distribution: ConsecutiveCarryOverDistribution;
  events: ConsecutiveCarryOverEvent[];
  summary: {
    majorityStopsAt: number;
    evidenceOfThreeTimes: boolean;
    evidenceOfFourTimes: boolean;
    notes: string[];
  };
}

interface MonthlySegment {
  monthLabel: string;
  drawnNumbers: Set<number>;
  undrawnNumbers: Set<number>;
}

const toMonthLabel = (epoch: number): string => {
  const date = new Date(epoch);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const toSelectedSet = (draw: Draw, includeSupp: boolean): Set<number> => {
  const selected = new Set<number>();
  const values = [
    ...(Array.isArray(draw.main) ? draw.main : []),
    ...(includeSupp && Array.isArray(draw.supp) ? draw.supp : []),
  ];
  for (const value of values) {
    if (Number.isInteger(value) && value >= 1 && value <= TOTAL_NUMBERS) {
      selected.add(value);
    }
  }
  return selected;
};

const buildMonthlySegments = (history: Draw[], includeSupp: boolean): MonthlySegment[] => {
  const chrono = sortDrawsChronologically(history);
  const segmentMap = new Map<string, MonthlySegment>();

  for (const draw of chrono) {
    const epoch = parseDrawDateToEpoch(draw.date);
    if (!epoch) continue;
    const monthLabel = toMonthLabel(epoch);

    if (!segmentMap.has(monthLabel)) {
      segmentMap.set(monthLabel, {
        monthLabel,
        drawnNumbers: new Set<number>(),
        undrawnNumbers: new Set<number>(),
      });
    }

    const segment = segmentMap.get(monthLabel)!;
    const selected = toSelectedSet(draw, includeSupp);
    for (const number of selected) {
      segment.drawnNumbers.add(number);
    }
  }

  // Compute undrawn numbers for each segment
  for (const segment of segmentMap.values()) {
    for (let number = 1; number <= TOTAL_NUMBERS; number += 1) {
      if (!segment.drawnNumbers.has(number)) {
        segment.undrawnNumbers.add(number);
      }
    }
  }

  // Return segments sorted chronologically
  return Array.from(segmentMap.values()).sort((a, b) => a.monthLabel.localeCompare(b.monthLabel));
};

export function analyzeConsecutiveCarryOvers(
  history: Draw[],
  options: { includeSupp: boolean } = { includeSupp: true },
): ConsecutiveCarryOverAnalysis {
  const segments = buildMonthlySegments(history, options.includeSupp);

  if (segments.length < 2) {
    return {
      distribution: {
        oneCarryOver: 0,
        twoCarryOvers: 0,
        threeCarryOvers: 0,
        fourPlusCarryOvers: 0,
        total: 0,
        percentageOneCarryOver: 0,
        percentageTwoCarryOvers: 0,
        percentageThreeCarryOvers: 0,
        percentageFourPlusCarryOvers: 0,
      },
      events: [],
      summary: {
        majorityStopsAt: 0,
        evidenceOfThreeTimes: false,
        evidenceOfFourTimes: false,
        notes: ["Insufficient history (need at least 2 months)"],
      },
    };
  }

  const events: ConsecutiveCarryOverEvent[] = [];

  // For each number, track its carry-over chain
  for (let number = 1; number <= TOTAL_NUMBERS; number += 1) {
    let consecutiveUndrawnMonths = 0;
    let chainStartMonthLabel = "";

    for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
      const segment = segments[segmentIndex];
      const isUndrawn = segment.undrawnNumbers.has(number);

      if (isUndrawn) {
        if (consecutiveUndrawnMonths === 0) {
          chainStartMonthLabel = segment.monthLabel;
        }
        consecutiveUndrawnMonths += 1;
      } else {
        // Number was drawn in this month
        if (consecutiveUndrawnMonths > 0) {
          // End of an undrawn chain - this is when the carry-over resolves
          events.push({
            number,
            startMonthLabel: chainStartMonthLabel,
            consecutiveCarryOvers: consecutiveUndrawnMonths,
          });
        }
        consecutiveUndrawnMonths = 0;
      }
    }

    // Handle case where number remains undrawn until the end of history
    if (consecutiveUndrawnMonths > 0) {
      events.push({
        number,
        startMonthLabel: chainStartMonthLabel,
        consecutiveCarryOvers: consecutiveUndrawnMonths,
      });
    }
  }

  // Calculate distribution
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const event of events) {
    if (event.consecutiveCarryOvers === 1) counts[1] += 1;
    else if (event.consecutiveCarryOvers === 2) counts[2] += 1;
    else if (event.consecutiveCarryOvers === 3) counts[3] += 1;
    else if (event.consecutiveCarryOvers >= 4) counts[4] += 1;
  }

  const total = events.length;
  const distribution: ConsecutiveCarryOverDistribution = {
    oneCarryOver: counts[1],
    twoCarryOvers: counts[2],
    threeCarryOvers: counts[3],
    fourPlusCarryOvers: counts[4],
    total,
    percentageOneCarryOver: total > 0 ? (counts[1] / total) * 100 : 0,
    percentageTwoCarryOvers: total > 0 ? (counts[2] / total) * 100 : 0,
    percentageThreeCarryOvers: total > 0 ? (counts[3] / total) * 100 : 0,
    percentageFourPlusCarryOvers: total > 0 ? (counts[4] / total) * 100 : 0,
  };

  // Determine majority stopping point
  let majorityStopsAt = 0;
  let maxCount = 0;
  if (counts[1] > maxCount) {
    maxCount = counts[1];
    majorityStopsAt = 1;
  }
  if (counts[2] > maxCount) {
    maxCount = counts[2];
    majorityStopsAt = 2;
  }
  if (counts[3] > maxCount) {
    maxCount = counts[3];
    majorityStopsAt = 3;
  }
  if (counts[4] > maxCount) {
    maxCount = counts[4];
    majorityStopsAt = 4;
  }

  const notes = [
    `Analyzed ${segments.length} months of lottery history`,
    `Found ${total} carry-over events across all numbers`,
    `Distribution: ${counts[1]} (${distribution.percentageOneCarryOver.toFixed(1)}%) stopped at 1, ${counts[2]} (${distribution.percentageTwoCarryOvers.toFixed(1)}%) stopped at 2, ${counts[3]} (${distribution.percentageThreeCarryOvers.toFixed(1)}%) stopped at 3, ${counts[4]} (${distribution.percentageFourPlusCarryOvers.toFixed(1)}%) stopped at 4+`,
  ];

  return {
    distribution,
    events: events.sort((a, b) => a.startMonthLabel.localeCompare(b.startMonthLabel) || a.number - b.number),
    summary: {
      majorityStopsAt,
      evidenceOfThreeTimes: counts[3] > 0,
      evidenceOfFourTimes: counts[4] > 0,
      notes,
    },
  };
}

export default analyzeConsecutiveCarryOvers;
