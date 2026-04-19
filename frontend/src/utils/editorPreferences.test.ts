/**
 * エディタ起動設定の永続化テスト
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getStoredMarkdownOpenMode,
  getStoredTextFileOpenMode,
  setStoredMarkdownOpenMode,
  setStoredTextFileOpenMode,
} from "./editorPreferences";

function createStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe("editorPreferences", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses web editor as the default mode for text files", () => {
    vi.stubGlobal("localStorage", createStorageMock());

    expect(getStoredTextFileOpenMode()).toBe("web");
  });

  it("uses web editor as the default mode for markdown files", () => {
    vi.stubGlobal("localStorage", createStorageMock());

    expect(getStoredMarkdownOpenMode()).toBe("web");
  });

  it("persists the selected text file mode", () => {
    vi.stubGlobal("localStorage", createStorageMock());

    setStoredTextFileOpenMode("vscode");

    expect(getStoredTextFileOpenMode()).toBe("vscode");
  });

  it("persists the selected markdown mode", () => {
    vi.stubGlobal("localStorage", createStorageMock());

    setStoredMarkdownOpenMode("obsidian");

    expect(getStoredMarkdownOpenMode()).toBe("obsidian");
  });

  it("falls back to web editor for invalid stored values", () => {
    const storage = createStorageMock();
    storage.setItem("file_manager_text_file_open_mode", "unknown");
    storage.setItem("file_manager_markdown_open_mode", "unknown");
    vi.stubGlobal("localStorage", storage);

    expect(getStoredTextFileOpenMode()).toBe("web");
    expect(getStoredMarkdownOpenMode()).toBe("web");
  });
});
