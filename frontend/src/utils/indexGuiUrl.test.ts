/**
 * OSごとのインデックス検索GUI URL選択のテスト
 */
import { describe, expect, it } from "vitest";
import { getIndexGuiUrl } from "./indexGuiUrl";

describe("getIndexGuiUrl", () => {
  it("uses the local fulltext GUI on macOS", () => {
    expect(getIndexGuiUrl(false, "http://127.0.0.1:8079")).toBe("http://127.0.0.1:8079");
  });

  it("uses the Everything HTTP GUI on Windows", () => {
    expect(getIndexGuiUrl(true, "http://127.0.0.1:8079")).toBe("http://localhost:8080/");
  });
});
