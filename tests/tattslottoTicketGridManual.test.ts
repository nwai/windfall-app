import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Tattslotto Ticket Grid Replay manual entry", () => {
  it("documents the replay panel as observed diagnostics, not prediction", () => {
    const manual = readFileSync(resolve(process.cwd(), "public/user-manual.html"), "utf8");

    expect(manual).toContain("Tattslotto Ticket Grid Replay");
    expect(manual).toContain("observed historical draws");
    expect(manual).toContain("running hot/cold");
    expect(manual).toContain("not calibrated predictions");
    expect(manual).not.toContain("ticket-grid prediction");
  });
});
