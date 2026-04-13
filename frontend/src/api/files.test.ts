/**
 * ファイルAPIクライアントのURL生成テスト
 * ダウンロードURL・全文検索URL・PDF表示URLのエンコードを確認する
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDownloadUrl, getFullTextSearchUrl, getPdfViewUrl } from "./files";

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

  it("builds full text search url with encoded path", () => {
    expect(getFullTextSearchUrl("/Users/mine/Documents/確定申告 2025")).toBe(
      "http://127.0.0.1:8079/?full_path=%2FUsers%2Fmine%2FDocuments%2F%E7%A2%BA%E5%AE%9A%E7%94%B3%E5%91%8A+2025"
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
