/**
 * リネーム時の名前と拡張子結合のテスト
 */
import { describe, expect, it } from "vitest";
import { buildRenamedFileName } from "./renameFileName";

describe("buildRenamedFileName", () => {
  it("joins a base name and an extension", () => {
    expect(buildRenamedFileName("report", "xlsx")).toBe("report.xlsx");
  });

  it("keeps a leading dot when supplied", () => {
    expect(buildRenamedFileName("report", ".csv")).toBe("report.csv");
  });

  it("supports removing an extension", () => {
    expect(buildRenamedFileName("report", "")).toBe("report");
  });
});
