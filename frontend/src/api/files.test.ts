/**
 * ファイルAPIクライアントのURL生成テスト
 * ダウンロードURLとPDF表示URLのエンコードを確認する
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDownloadUrl, getPdfViewUrl } from "./files";

describe("file api url builders", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds download url with encoded path", () => {
    vi.stubGlobal("window", {
      location: {
        origin: "http://localhost:5173",
      },
    });

    expect(getDownloadUrl("/Users/mine/My File.pdf")).toBe(
      "http://localhost:5173/api/download?path=%2FUsers%2Fmine%2FMy+File.pdf"
    );
  });

  it("builds pdf view url with encoded path", () => {
    vi.stubGlobal("window", {
      location: {
        origin: "http://localhost:5173",
      },
    });

    expect(getPdfViewUrl("/Users/mine/Documents/資料.pdf")).toBe(
      "http://localhost:5173/api/view-pdf?path=%2FUsers%2Fmine%2FDocuments%2F%E8%B3%87%E6%96%99.pdf"
    );
  });
});
