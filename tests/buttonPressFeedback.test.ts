import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = (): string => readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

describe("button press feedback", () => {
  it("defines app-wide visual feedback for enabled buttons and button-like controls", () => {
    const source = css();

    expect(source).toContain("--wf-press-shadow");
    expect(source).toContain("button:not(:disabled),");
    expect(source).toContain('[role="button"]');
    expect(source).toContain(".windfall-primary-button");
    expect(source).toContain(".windfall-secondary-button");
    expect(source).toContain("button:not(:disabled):active");
    expect(source).toContain("transform: translateY(1px) scale(0.985);");
    expect(source).toContain("filter: brightness(0.96) saturate(1.04);");
    expect(source).toContain("button:disabled");
    expect(source).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
