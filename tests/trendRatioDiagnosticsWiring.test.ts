import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readProjectFile = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Trend Ratio Diagnostics wiring", () => {
  it("documents the diagnostic and its non-probability z-score in the user manual", () => {
    const manual = readProjectFile("public/user-manual.html");

    expect(manual).toContain('id="trend-ratio-diagnostics"');
    expect(manual).toContain("Up / Down / Flat");
    expect(manual).toContain("mains + supplementary numbers");
    expect(manual).toContain("diagnostic, not a calibrated probability");
    expect(manual).toContain("Add button");
  });

  it("keeps the Add button wired to live trend-ratio generation state", () => {
    const appSource = readProjectFile("src/App.tsx");

    expect(appSource).toContain('const [allowedTrendRatios, setAllowedTrendRatios] = useState<string[]>([])');
    expect(appSource).toContain("const toggleTrendRatio = useCallback((tag: string)");
    expect(appSource).toContain("allowedTrendRatios={allowedTrendRatios}");
    expect(appSource).toContain("toggleTrendRatio={toggleTrendRatio}");
    expect(appSource).not.toContain("toggleTrendRatio={() => {}}");
    expect(appSource).not.toContain("allowedTrendRatios={[]}");
  });

  it("passes selected trend-ratio filters into the generation worker and trace", () => {
    const appSource = readProjectFile("src/App.tsx");

    expect(appSource).toContain("const activeTrendMap = useMemo(");
    expect(appSource).toContain("trendMapEntries: allowedTrendRatios.length ? serializeTrendMap(activeTrendMap) : undefined");
    expect(appSource).toContain("allowedTrendRatios: allowedTrendRatios.length ? allowedTrendRatios : undefined");
    expect(appSource).toContain("Trend ratio filter active:");
    expect(appSource).toContain("trend-ratio filter active");
  });
});
