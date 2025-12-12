import { forecastOGA } from "../src/lib/ogaForecast";
import { Draw } from "../src/types";

function makeDraw(mains: number[], supps: number[] = [1,2], date = "2024-01-01"): Draw {
  return { main: mains, supp: supps, date } as any;
}

describe("forecastOGA deciles", () => {
  it("computes decile thresholds and band probs on a simple history", () => {
    const history: Draw[] = [
      makeDraw([1,2,3,4,5,6]),
      makeDraw([7,8,9,10,11,12]),
      makeDraw([13,14,15,16,17,18]),
      makeDraw([19,20,21,22,23,24]),
      makeDraw([25,26,27,28,29,30]),
    ];
    const baseline = history.slice();
    const res = forecastOGA(history, baseline);
    expect(res).toBeTruthy();
    expect(res.deciles).toBeTruthy();
    expect(Array.isArray(res.deciles.thresholds)).toBe(true);
    expect(res.deciles.thresholds.length).toBeGreaterThanOrEqual(1);
    // bands is an object with low/mid/high
    expect(typeof res.bands).toBe("object");
    expect(typeof res.bands.low).toBe("number");
    expect(typeof res.bands.mid).toBe("number");
    expect(typeof res.bands.high).toBe("number");
    expect(res.bands.low + res.bands.mid + res.bands.high).toBeGreaterThan(0);
  });
});
