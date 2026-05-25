import { describe, expect, it } from "vitest";
import { hasTrainableReturnLabels } from "../src/components/ReturnPredictor";
import type { NumberExample } from "../src/lib/churnFeatures";

const base: NumberExample = {
  number: 1,
  freqFortnight: 0,
  freqMonth: 0,
  freqQuarter: 0,
  tenure: 0,
  timeSinceLast: 0,
  zpaGroup: 0,
  churnLabel: 1,
  returnLabel: undefined,
};

describe("ReturnPredictor label readiness", () => {
  it("reports untrainable datasets when return labels are not computed", () => {
    expect(hasTrainableReturnLabels([base])).toBe(false);
  });

  it("reports trainable datasets when at least one churned row has a return label", () => {
    expect(hasTrainableReturnLabels([{ ...base, returnLabel: 1 }])).toBe(true);
  });
});
