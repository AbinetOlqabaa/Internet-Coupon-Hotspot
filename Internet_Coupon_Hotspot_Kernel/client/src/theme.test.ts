import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("shared design tokens", () => {
  it("defines centralized brand and semantic status colors", () => {
    const css = readFileSync(new URL("./theme.css", import.meta.url), "utf8");
    expect(css).toContain("--color-brand-primary");
    expect(css).toContain("--color-brand-secondary");
    expect(css).toContain("--color-success");
    expect(css).toContain("--color-danger");
  });
});
