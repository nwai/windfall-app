import type { Draw } from "../types"
import { filterRealDrawHistory } from "./realDrawHistory"
import { sortDrawsChronologically } from "./recentDraws"

const TOTAL_NUMBERS = 45
const DEFAULT_TOP_NUMBERS = 5
const DEFAULT_TRIALS = 2500
const MIN_WEIGHT = 0.0001

const GROUPS = [
  { label: "1-9", low: 1, high: 9 },
  { label: "10-18", low: 10, high: 18 },
  { label: "19-26", low: 19, high: 26 },
  { label: "27-35", low: 27, high: 35 },
  { label: "36-45", low: 36, high: 45 },
]

interface CleanDraw {
  undrawn: Set<number>
}

export interface UndrawnForecastNumberRate {
  number: number
  undrawnRate: number
  drawnRate: number
  latestWasUndrawn: boolean
  overallAbsenceRate: number
  recentAbsenceRate: number
  transitionAbsenceRate: number
}

export interface UndrawnForecastGroupRate {
  label: string
  averageUndrawn: number
  expectedUndrawn: number
}

export interface UndrawnSimulationSnapshot {
  trials: number
  recentWindow: number
  meanUndrawn: number
  undrawnRange95: [number, number]
  meanOddUndrawn: number
  oddUndrawnRange95: [number, number]
  meanLatestOverlap: number
  latestOverlapRange95: [number, number]
  numberRates: UndrawnForecastNumberRate[]
  topLikelyUndrawn: UndrawnForecastNumberRate[]
  topLikelyDrawn: UndrawnForecastNumberRate[]
  groups: UndrawnForecastGroupRate[]
  notes: string[]
}

export interface UndrawnForecastResult {
  simulation: UndrawnSimulationSnapshot
  next: string[]
}

interface BuildUndrawnForecastOptions {
  includeSupp: boolean
  trials?: number
  topNumbers?: number
  seed?: number
}

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value))

const mean = (values: number[]): number => (
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
)

const quantile = (values: number[], probability: number): number => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const clamped = clamp(probability, 0, 1)
  const index = clamped * (sorted.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  const weight = index - lower
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

const quantileRange95 = (values: number[]): [number, number] => [
  quantile(values, 0.025),
  quantile(values, 0.975),
]

const formatRange95 = (values: [number, number]): string => `${values[0].toFixed(1)}–${values[1].toFixed(1)}`

const formatNumberRateList = (items: Array<{ number: number; rate: number }>, invert = false): string => (
  items
    .map((item) => {
      const rate = invert ? (1 - item.rate) * 100 : item.rate * 100
      return `${item.number} (${rate.toFixed(1)}%)`
    })
    .join(", ")
)

const smoothRate = (successes: number, trials: number, priorRate: number, priorWeight: number): number => {
  if (trials <= 0) return priorRate
  return (successes + priorRate * priorWeight) / (trials + priorWeight)
}

const countIntersection = (left: Set<number>, right: Set<number>): number => {
  const [smaller, larger] = left.size <= right.size ? [left, right] : [right, left]
  let count = 0
  for (const value of smaller) {
    if (larger.has(value)) count += 1
  }
  return count
}

const seededRng = (seed: number): (() => number) => {
  let state = seed >>> 0
  return () => {
    state += 0x6D2B79F5
    let result = Math.imul(state ^ (state >>> 15), 1 | state)
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

const weightedSampleWithoutReplacement = (
  weights: number[],
  count: number,
  rng: () => number,
): number[] => {
  const scored = Array.from({ length: TOTAL_NUMBERS }, (_, index) => {
    const number = index + 1
    const weight = Math.max(MIN_WEIGHT, weights[number] ?? MIN_WEIGHT)
    const u = Math.max(rng(), 1e-12)
    return {
      number,
      key: -Math.log(u) / weight,
    }
  })

  return scored
    .sort((a, b) => a.key - b.key)
    .slice(0, clamp(Math.floor(count), 0, TOTAL_NUMBERS))
    .map((entry) => entry.number)
}

const toSelectedSet = (draw: Draw, includeSupp: boolean): Set<number> => {
  const selected = new Set<number>()
  const source = includeSupp ? [...draw.main, ...draw.supp] : [...draw.main]
  for (const value of source) {
    if (Number.isInteger(value) && value >= 1 && value <= TOTAL_NUMBERS) {
      selected.add(value)
    }
  }
  return selected
}

const buildCleanHistory = (history: Draw[], includeSupp: boolean): CleanDraw[] => (
  sortDrawsChronologically(history).map((draw) => {
    const selected = toSelectedSet(draw, includeSupp)
    const undrawn = new Set<number>()
    for (let number = 1; number <= TOTAL_NUMBERS; number += 1) {
      if (!selected.has(number)) undrawn.add(number)
    }
    return { undrawn }
  })
)

const countTrailingState = (cleaned: CleanDraw[], number: number, undrawnState: boolean): number => {
  let streak = 0
  for (let index = cleaned.length - 1; index >= 0; index -= 1) {
    const matches = cleaned[index].undrawn.has(number) === undrawnState
    if (!matches) break
    streak += 1
  }
  return streak
}

const buildEmptySnapshot = (): UndrawnSimulationSnapshot => ({
  trials: 0,
  recentWindow: 0,
  meanUndrawn: 0,
  undrawnRange95: [0, 0],
  meanOddUndrawn: 0,
  oddUndrawnRange95: [0, 0],
  meanLatestOverlap: 0,
  latestOverlapRange95: [0, 0],
  numberRates: [],
  topLikelyUndrawn: [],
  topLikelyDrawn: [],
  groups: GROUPS.map((group) => ({
    label: group.label,
    averageUndrawn: 0,
    expectedUndrawn: 0,
  })),
  notes: ["No simulation available without draw history."],
})

const buildNextMessages = (simulation: UndrawnSimulationSnapshot): string[] => {
  if (simulation.trials <= 0) return []

  const topUndrawn = formatNumberRateList(
    simulation.topLikelyUndrawn.map((item) => ({ number: item.number, rate: item.undrawnRate })),
  )
  const topDrawn = formatNumberRateList(
    simulation.topLikelyDrawn.map((item) => ({ number: item.number, rate: item.undrawnRate })),
    true,
  )
  const strongestGroup = simulation.groups.reduce<UndrawnForecastGroupRate | null>((best, group) => {
    if (!best) return group
    return group.averageUndrawn - group.expectedUndrawn > best.averageUndrawn - best.expectedUndrawn ? group : best
  }, null)

  const lightestGroup = simulation.groups.reduce<UndrawnForecastGroupRate | null>((best, group) => {
    if (!best) return group
    return group.averageUndrawn - group.expectedUndrawn < best.averageUndrawn - best.expectedUndrawn ? group : best
  }, null)

  return [
    `Highest simulated support for staying undrawn: ${topUndrawn}.`,
    `Lowest simulated undrawn rates: ${topDrawn}.`,
    `Expected next undrawn profile: ${simulation.meanUndrawn.toFixed(1)} undrawn numbers (95% ${formatRange95(simulation.undrawnRange95)}), with ${simulation.meanOddUndrawn.toFixed(1)} odd undrawn numbers on average (95% ${formatRange95(simulation.oddUndrawnRange95)}).`,
    strongestGroup && lightestGroup
      ? `Range pressure is strongest in ${strongestGroup.label} (${strongestGroup.averageUndrawn.toFixed(1)} undrawn on average) and lightest in ${lightestGroup.label} (${lightestGroup.averageUndrawn.toFixed(1)}). About ${simulation.meanLatestOverlap.toFixed(1)} of the latest undrawn numbers carry over on average (95% ${formatRange95(simulation.latestOverlapRange95)}).`
      : `About ${simulation.meanLatestOverlap.toFixed(1)} of the latest undrawn numbers carry over on average (95% ${formatRange95(simulation.latestOverlapRange95)}).`,
  ]
}

export function buildUndrawnForecast(
  history: Draw[],
  options: BuildUndrawnForecastOptions,
): UndrawnForecastResult {
  const realHistory = filterRealDrawHistory(history, "undrawn forecast diagnostics")
  const cleaned = buildCleanHistory(realHistory.history, options.includeSupp)
  if (cleaned.length === 0) {
    const empty = buildEmptySnapshot()
    return {
      simulation: {
        ...empty,
        notes: [...realHistory.warnings, ...empty.notes],
      },
      next: [],
    }
  }

  const draws = cleaned.length
  const recentWindow = Math.min(draws, Math.max(4, Math.min(12, Math.ceil(draws / 3))))
  const topNumbers = Math.max(1, Math.floor(options.topNumbers ?? DEFAULT_TOP_NUMBERS))
  const trials = Math.max(200, Math.floor(options.trials ?? DEFAULT_TRIALS))
  const rng = seededRng(options.seed ?? 20260531)
  const undrawnTemplates = cleaned.map((draw) => draw.undrawn.size)
  const baselineAbsenceRate = mean(undrawnTemplates) / TOTAL_NUMBERS
  const latestUndrawn = cleaned[cleaned.length - 1]?.undrawn ?? new Set<number>()

  const weights = Array(TOTAL_NUMBERS + 1).fill(0)
  const rateSummaries: UndrawnForecastNumberRate[] = []

  for (let number = 1; number <= TOTAL_NUMBERS; number += 1) {
    let undrawnCount = 0
    let recentUndrawnCount = 0
    let prevUndrawnTrials = 0
    let prevUndrawnToUndrawn = 0
    let prevDrawnTrials = 0
    let prevDrawnToUndrawn = 0

    for (let index = 0; index < cleaned.length; index += 1) {
      const isUndrawn = cleaned[index].undrawn.has(number)
      if (isUndrawn) undrawnCount += 1
      if (index >= cleaned.length - recentWindow && isUndrawn) recentUndrawnCount += 1

      if (index === 0) continue
      const wasUndrawn = cleaned[index - 1].undrawn.has(number)
      if (wasUndrawn) {
        prevUndrawnTrials += 1
        if (isUndrawn) prevUndrawnToUndrawn += 1
      } else {
        prevDrawnTrials += 1
        if (isUndrawn) prevDrawnToUndrawn += 1
      }
    }

    const overallAbsenceRate = smoothRate(undrawnCount, draws, baselineAbsenceRate, 2)
    const recentAbsenceRate = smoothRate(recentUndrawnCount, recentWindow, overallAbsenceRate, 2)
    const latestWasUndrawn = latestUndrawn.has(number)
    const transitionAbsenceRate = latestWasUndrawn
      ? smoothRate(prevUndrawnToUndrawn, prevUndrawnTrials, overallAbsenceRate, 3)
      : smoothRate(prevDrawnToUndrawn, prevDrawnTrials, overallAbsenceRate, 3)

    const undrawnStreak = latestWasUndrawn ? countTrailingState(cleaned, number, true) : 0
    const drawnStreak = latestWasUndrawn ? 0 : countTrailingState(cleaned, number, false)
    const streakMultiplier = latestWasUndrawn
      ? 1 + Math.min(Math.max(undrawnStreak - 1, 0), 4) * 0.03
      : 1 - Math.min(Math.max(drawnStreak - 1, 0), 4) * 0.02

    const blendedAbsenceRate = transitionAbsenceRate * 0.5 + recentAbsenceRate * 0.3 + overallAbsenceRate * 0.2
    const propensityWeight = Math.max(0.02, blendedAbsenceRate * streakMultiplier)

    weights[number] = propensityWeight
    rateSummaries.push({
      number,
      undrawnRate: 0,
      drawnRate: 0,
      latestWasUndrawn,
      overallAbsenceRate,
      recentAbsenceRate,
      transitionAbsenceRate,
    })
  }

  const simulatedUndrawnCounts: number[] = []
  const simulatedOddUndrawnCounts: number[] = []
  const simulatedLatestOverlaps: number[] = []
  const simulatedGroupCounts = GROUPS.map(() => [] as number[])
  const simulatedUndrawnHits = Array(TOTAL_NUMBERS + 1).fill(0)

  for (let trial = 0; trial < trials; trial += 1) {
    const sampleIndex = Math.floor(rng() * undrawnTemplates.length)
    const sampleCount = undrawnTemplates[sampleIndex] ?? Math.round(mean(undrawnTemplates))
    const simulatedUndrawn = weightedSampleWithoutReplacement(weights, sampleCount, rng)
    const simulatedSet = new Set(simulatedUndrawn)
    simulatedUndrawnCounts.push(simulatedUndrawn.length)
    simulatedOddUndrawnCounts.push(simulatedUndrawn.filter((number) => number % 2 === 1).length)
    simulatedLatestOverlaps.push(countIntersection(simulatedSet, latestUndrawn))

    for (const number of simulatedUndrawn) {
      simulatedUndrawnHits[number] += 1
    }

    GROUPS.forEach((group, groupIndex) => {
      let count = 0
      for (const number of simulatedUndrawn) {
        if (number >= group.low && number <= group.high) count += 1
      }
      simulatedGroupCounts[groupIndex].push(count)
    })
  }

  const rankedSummaries = rateSummaries.map((summary) => {
    const simulatedUndrawnRate = simulatedUndrawnHits[summary.number] / trials
    return {
      ...summary,
      undrawnRate: simulatedUndrawnRate,
      drawnRate: 1 - simulatedUndrawnRate,
    }
  })

  const simulation: UndrawnSimulationSnapshot = {
    trials,
    recentWindow,
    meanUndrawn: mean(simulatedUndrawnCounts),
    undrawnRange95: quantileRange95(simulatedUndrawnCounts),
    meanOddUndrawn: mean(simulatedOddUndrawnCounts),
    oddUndrawnRange95: quantileRange95(simulatedOddUndrawnCounts),
    meanLatestOverlap: mean(simulatedLatestOverlaps),
    latestOverlapRange95: quantileRange95(simulatedLatestOverlaps),
    numberRates: [...rankedSummaries].sort((left, right) => left.number - right.number),
    topLikelyUndrawn: [...rankedSummaries]
      .sort((left, right) => right.undrawnRate - left.undrawnRate || left.number - right.number)
      .slice(0, topNumbers),
    topLikelyDrawn: [...rankedSummaries]
      .sort((left, right) => left.undrawnRate - right.undrawnRate || left.number - right.number)
      .slice(0, topNumbers),
    groups: GROUPS.map((group, index) => ({
      label: group.label,
      averageUndrawn: mean(simulatedGroupCounts[index]),
      expectedUndrawn: ((group.high - group.low + 1) / TOTAL_NUMBERS) * mean(simulatedUndrawnCounts),
    })),
    notes: [
      ...realHistory.warnings,
      `${trials.toLocaleString()} seeded trials sampled the next undrawn set using a blended absence score for each number.`,
      `Each number’s score combines latest-state transition tendency (50%), recent-window absence over the last ${recentWindow} draws (30%), and full-window absence rate (20%).`,
      `Each trial reuses an observed undrawn-count template from the active window (mean ${mean(undrawnTemplates).toFixed(1)}, 95% ${formatRange95(quantileRange95(undrawnTemplates))}); percentages below are the share of trials where a number stayed undrawn.`,
    ],
  }

  return {
    simulation,
    next: buildNextMessages(simulation),
  }
}
