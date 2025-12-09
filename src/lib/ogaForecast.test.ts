import { forecastOGA } from "./ogaForecast";

describe("forecastOGA", () => {
  it("returns zeros for empty history", () => {
    const out = forecastOGA([] as any);
    expect(out.n).toBe(0);
    expect(out.mean).toBe(0);
    expect(out.p10).toBe(0);
    expect(out.p50).toBe(0);
    expect(out.p90).toBe(0);
    expect(out.bands.low + out.bands.mid + out.bands.high).toBe(0);
  });
});
