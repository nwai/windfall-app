import { describe, expect, it } from "vitest"

import type { Draw } from "../types"
import { buildUndrawnForecast } from "./undrawnForecast"

const draw = (date: string, main: number[], supp: number[] = [], isSimulated = false): Draw => ({
  date,
  main,
  supp,
  isSimulated,
})

describe("buildUndrawnForecast", () => {
  it("returns an empty simulation when there is no history", () => {
    const forecast = buildUndrawnForecast([], { includeSupp: false, trials: 300, seed: 7 })

    expect(forecast.simulation.trials).toBe(0)
    expect(forecast.simulation.notes).toContain("No simulation available without draw history.")
    expect(forecast.next).toEqual([])
  })

  it("produces dynamic hot/cold rankings from simulation rather than fixed placeholder text", () => {
    const history: Draw[] = [
      draw("2026-01-01", [1, 2, 3, 4, 5, 6]),
      draw("2026-01-08", [1, 7, 8, 9, 10, 11]),
      draw("2026-01-15", [1, 12, 13, 14, 15, 16]),
      draw("2026-01-22", [1, 17, 18, 19, 20, 21]),
      draw("2026-01-29", [1, 22, 23, 24, 25, 26]),
      draw("2026-02-05", [1, 27, 28, 29, 30, 31]),
    ]

    const forecast = buildUndrawnForecast(history, { includeSupp: false, trials: 1200, topNumbers: 3, seed: 19 })
    const coldLeaders = forecast.simulation.topLikelyUndrawn.map((item) => item.number)

    expect(forecast.simulation.trials).toBe(1200)
    expect(forecast.simulation.topLikelyDrawn[0].number).toBe(1)
    expect(coldLeaders.every((number) => number >= 32)).toBe(true)
    expect(forecast.simulation.topLikelyUndrawn[0].undrawnRate).toBeGreaterThan(
      forecast.simulation.topLikelyDrawn[0].undrawnRate,
    )
    expect(forecast.next[0]).toContain("Highest simulated support for staying undrawn")
    expect(forecast.next[1]).toContain("Lowest simulated undrawn rates")
  })

  it("changes its forecast when supplementary numbers are included", () => {
    const history: Draw[] = [
      draw("2026-03-01", [1, 2, 3, 4, 5, 6], [45, 44]),
      draw("2026-03-08", [7, 8, 9, 10, 11, 12], [45, 43]),
      draw("2026-03-15", [13, 14, 15, 16, 17, 18], [45, 42]),
      draw("2026-03-22", [19, 20, 21, 22, 23, 24], [45, 41]),
    ]

    const mainsOnly = buildUndrawnForecast(history, { includeSupp: false, trials: 900, topNumbers: 5, seed: 23 })
    const mainsAndSupps = buildUndrawnForecast(history, { includeSupp: true, trials: 900, topNumbers: 5, seed: 23 })
    const mainsOnly45 = mainsOnly.simulation.numberRates.find((item) => item.number === 45)
    const mainsAndSupps45 = mainsAndSupps.simulation.numberRates.find((item) => item.number === 45)
    const drawnMode45 = mainsAndSupps.simulation.topLikelyDrawn.find((item) => item.number === 45)

    expect(mainsOnly45?.undrawnRate ?? 0).toBeGreaterThan(0.85)
    expect(mainsAndSupps45?.undrawnRate ?? 1).toBeLessThan((mainsOnly45?.undrawnRate ?? 1) - 0.18)
    expect(mainsAndSupps45?.drawnRate ?? 0).toBeGreaterThan(0.25)
    expect(drawnMode45?.number).toBe(45)
  })

  it("ignores simulated fallback rows instead of using them as undrawn forecast evidence", () => {
    const realHistory: Draw[] = [
      draw("2026-04-01", [1, 2, 3, 4, 5, 6]),
      draw("2026-04-08", [7, 8, 9, 10, 11, 12]),
      draw("2026-04-15", [13, 14, 15, 16, 17, 18]),
      draw("2026-04-22", [19, 20, 21, 22, 23, 24]),
    ]
    const contaminatedHistory = [
      ...realHistory,
      draw("2026-04-29", [40, 41, 42, 43, 44, 45], [], true),
    ]

    const clean = buildUndrawnForecast(realHistory, { includeSupp: false, trials: 600, topNumbers: 4, seed: 101 })
    const contaminated = buildUndrawnForecast(contaminatedHistory, { includeSupp: false, trials: 600, topNumbers: 4, seed: 101 })

    expect(contaminated.simulation.notes).toContain(
      "Ignored 1 simulated fallback draw row; undrawn forecast diagnostics use real historical draws only.",
    )
    expect(contaminated.simulation.meanUndrawn).toBe(clean.simulation.meanUndrawn)
    expect(contaminated.simulation.topLikelyUndrawn.map((item) => item.number)).toEqual(
      clean.simulation.topLikelyUndrawn.map((item) => item.number),
    )
  })
})
