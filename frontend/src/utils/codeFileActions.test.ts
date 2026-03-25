import { describe, expect, it } from "vitest";
import { isProgramCodeFile } from "./codeFileActions";

describe("isProgramCodeFile", () => {
  it("returns true for supported script extensions", () => {
    expect(isProgramCodeFile("main.py")).toBe(true);
    expect(isProgramCodeFile("build.sh")).toBe(true);
    expect(isProgramCodeFile("start.BAT")).toBe(true);
  });

  it("returns false for unsupported extensions", () => {
    expect(isProgramCodeFile("notes.md")).toBe(false);
    expect(isProgramCodeFile("archive.zip")).toBe(false);
    expect(isProgramCodeFile("README")).toBe(false);
  });
});
