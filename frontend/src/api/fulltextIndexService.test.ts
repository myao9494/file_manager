import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getFulltextIndexServiceStatus,
  searchIndexedFolder,
  searchFulltextIndexService,
} from "./fulltextIndexService";

describe("fulltextIndexService", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("window", {
      location: {
        origin: "http://localhost:5173",
      },
    });
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("builds a fulltext search request with depth and file type", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ totalResults: 1, results: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await searchFulltextIndexService({
      query: "寿司",
      path: "/tmp/docs",
      depth: 2,
      count: 50,
      fileType: "file",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(requestUrl.pathname).toBe("/api/fulltext-search");
    expect(requestUrl.searchParams.get("search")).toBe("寿司");
    expect(requestUrl.searchParams.get("path")).toBe("/tmp/docs");
    expect(requestUrl.searchParams.get("depth")).toBe("2");
    expect(requestUrl.searchParams.get("count")).toBe("50");
    expect(requestUrl.searchParams.get("file_type")).toBe("file");
  });

  it("normalizes object-like fulltext search fields into strings", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        totalResults: 1,
        results: [
          {
            name: { value: "sushi.md" },
            path: { full_path: String.raw`C:\docs\sushi.md` },
            type: "file",
            size: null,
            date_modified: null,
            snippet: { text: "今日は<mark>寿司</mark>です" },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      searchFulltextIndexService({
        query: "寿司",
        path: String.raw`C:\docs`,
        depth: 2,
      })
    ).resolves.toEqual({
      totalResults: 1,
      results: [
        {
          name: "sushi.md",
          path: String.raw`C:\docs\sushi.md`,
          type: "file",
          size: 0,
          date_modified: 0,
          snippet: "今日は<mark>寿司</mark>です",
        },
      ],
    });
  });

  it("returns a safe fallback when the status endpoint is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    await expect(getFulltextIndexServiceStatus()).resolves.toEqual({
      ready: false,
      total_indexed: 0,
      is_running: false,
      last_error: null,
    });
  });

  it("posts an indexed folder search request to the GUI service", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ total: 1, items: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => {
        if (key === "file_manager_fulltext_index_gui_url") {
          return "http://127.0.0.1:8079";
        }
        return null;
      }),
      setItem: vi.fn(),
    });

    await searchIndexedFolder({
      q: "見積",
      folderPath: String.raw`\\vss45\一行課\資料`,
      limit: 20,
      offset: 5,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8079/api/search/indexed");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      q: "見積",
      folder_path: String.raw`\\vss45\一行課\資料`,
      limit: 20,
      offset: 5,
    });
  });

  it("normalizes object-like indexed folder search fields into strings", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        total: 1,
        items: [
          {
            file_id: "10",
            target_path: { path: String.raw`\\vss45\一行課\資料` },
            file_name: { text: "見積書.md" },
            full_path: { value: String.raw`\\vss45\一行課\資料\見積書.md` },
            file_ext: { value: ".md" },
            created_at: { value: "2026-04-18T00:00:00+09:00" },
            mtime: { value: "2026-04-18T00:00:00+09:00" },
            click_count: "2",
            snippet: { snippet: "見積の<mark>結果</mark>" },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      searchIndexedFolder({
        q: "結果",
        folderPath: String.raw`\\vss45\一行課\資料`,
      })
    ).resolves.toEqual({
      total: 1,
      items: [
        {
          file_id: 10,
          target_path: String.raw`\\vss45\一行課\資料`,
          file_name: "見積書.md",
          full_path: String.raw`\\vss45\一行課\資料\見積書.md`,
          file_ext: ".md",
          created_at: "2026-04-18T00:00:00+09:00",
          mtime: "2026-04-18T00:00:00+09:00",
          click_count: 2,
          snippet: "見積の<mark>結果</mark>",
        },
      ],
    });
  });
});
