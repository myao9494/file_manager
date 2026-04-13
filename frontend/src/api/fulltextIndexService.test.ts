import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getFulltextIndexServiceStatus,
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

  it("returns a safe fallback when the status endpoint is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    await expect(getFulltextIndexServiceStatus()).resolves.toEqual({
      ready: false,
      total_indexed: 0,
      is_running: false,
      last_error: null,
    });
  });
});
