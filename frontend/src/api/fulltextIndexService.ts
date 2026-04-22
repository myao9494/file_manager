/**
 * 全文検索サービスAPIクライアント
 * Index(L) / Index(R) 専用に backend の全文検索プロキシと通信する
 */

import { API_BASE_URL } from "../config";
import type { IndexSearchParams, IndexSearchResponse } from "./indexService";

const DEFAULT_FULLTEXT_INDEX_SERVICE_URL = `${API_BASE_URL}/api/fulltext-search`;
const DEFAULT_FULLTEXT_GUI_URL = "http://127.0.0.1:8079";

const FULLTEXT_INDEX_SERVICE_URL_KEY = "file_manager_fulltext_index_service_url";
const FULLTEXT_INDEX_GUI_URL_KEY = "file_manager_fulltext_index_gui_url";

export interface FulltextIndexServiceStatus {
  ready: boolean;
  total_indexed: number;
  is_running: boolean;
  last_error: string | null;
}

export interface IndexedFolderSearchParams {
  q: string;
  folderPath: string;
  limit?: number;
  offset?: number;
}

export interface IndexedFolderSearchItem {
  file_id: number;
  target_path: string;
  file_name: string;
  full_path: string;
  file_ext: string;
  created_at: string;
  mtime: string;
  click_count: number;
  snippet?: string;
}

export interface IndexedFolderSearchResponse {
  total: number;
  items: IndexedFolderSearchItem[];
}

/**
 * Windows 環境では外部サービスの一部フィールドがオブジェクト化されることがあるため、
 * UI へ渡す前に表示用のプリミティブへ正規化する。
 */
function normalizePrimitiveText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["full_path", "path", "file_name", "text", "snippet", "value", "display"]) {
      const candidate = record[key];
      if (candidate !== undefined) {
        return normalizePrimitiveText(candidate);
      }
    }
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return "";
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function normalizeSearchResponse(payload: unknown): IndexSearchResponse {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const rawResults = Array.isArray(record.results) ? record.results : [];

  return {
    totalResults: normalizeOptionalNumber(record.totalResults) ?? 0,
    results: rawResults.map((item) => {
      const result = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        name: normalizePrimitiveText(result.name),
        path: normalizePrimitiveText(result.path),
        type: normalizePrimitiveText(result.type) || "file",
        size: normalizeOptionalNumber(result.size) ?? 0,
        date_modified: normalizeOptionalNumber(result.date_modified) ?? 0,
        snippet: normalizePrimitiveText(result.snippet) || undefined,
      };
    }),
  };
}

function normalizeIndexedFolderResponse(payload: unknown): IndexedFolderSearchResponse {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const rawItems = Array.isArray(record.items) ? record.items : [];

  return {
    total: normalizeOptionalNumber(record.total) ?? 0,
    items: rawItems.map((item) => {
      const result = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        file_id: normalizeOptionalNumber(result.file_id) ?? 0,
        target_path: normalizePrimitiveText(result.target_path),
        file_name: normalizePrimitiveText(result.file_name),
        full_path: normalizePrimitiveText(result.full_path),
        file_ext: normalizePrimitiveText(result.file_ext),
        created_at: normalizePrimitiveText(result.created_at),
        mtime: normalizePrimitiveText(result.mtime),
        click_count: normalizeOptionalNumber(result.click_count) ?? 0,
        snippet: normalizePrimitiveText(result.snippet) || undefined,
      };
    }),
  };
}

export function getFulltextIndexServiceUrl(): string {
  return localStorage.getItem(FULLTEXT_INDEX_SERVICE_URL_KEY) || DEFAULT_FULLTEXT_INDEX_SERVICE_URL;
}

export function setFulltextIndexServiceUrl(url: string): void {
  localStorage.setItem(FULLTEXT_INDEX_SERVICE_URL_KEY, url);
}

export function getFulltextIndexGuiUrl(): string {
  return localStorage.getItem(FULLTEXT_INDEX_GUI_URL_KEY) || DEFAULT_FULLTEXT_GUI_URL;
}

export function setFulltextIndexGuiUrl(url: string): void {
  localStorage.setItem(FULLTEXT_INDEX_GUI_URL_KEY, url);
}

export async function getFulltextIndexServiceStatus(): Promise<FulltextIndexServiceStatus> {
  const url = getFulltextIndexServiceUrl();

  try {
    const response = await fetch(`${url}/status`);
    if (!response.ok) {
      return {
        ready: false,
        total_indexed: 0,
        is_running: false,
        last_error: null,
      };
    }
    return response.json();
  } catch (error) {
    console.warn("全文検索サービスへの接続に失敗しました", error);
    return {
      ready: false,
      total_indexed: 0,
      is_running: false,
      last_error: null,
    };
  }
}

export async function searchFulltextIndexService(params: IndexSearchParams & { depth?: number }): Promise<IndexSearchResponse> {
  const baseUrl = getFulltextIndexServiceUrl();
  const url = new URL(baseUrl, window.location.origin);

  url.searchParams.set("search", params.query);
  if (params.path) {
    url.searchParams.set("path", params.path);
  }
  url.searchParams.set("depth", String(params.depth ?? 1));

  if (params.count !== undefined) {
    url.searchParams.set("count", params.count.toString());
  }
  if (params.offset !== undefined) {
    url.searchParams.set("offset", params.offset.toString());
  }
  if (params.fileType && params.fileType !== "all") {
    url.searchParams.set("file_type", params.fileType);
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error("全文検索に失敗しました");
  }

  return normalizeSearchResponse(await response.json());
}

export async function searchIndexedFolder(params: IndexedFolderSearchParams): Promise<IndexedFolderSearchResponse> {
  const guiBaseUrl = getFulltextIndexGuiUrl();
  const url = new URL("/api/search/indexed", guiBaseUrl);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: params.q,
      folder_path: params.folderPath,
      limit: params.limit ?? 20,
      offset: params.offset ?? 0,
    }),
  });

  if (!response.ok) {
    let message = "indexed検索に失敗しました";

    try {
      const error = await response.json();
      message = error.detail || message;
    } catch {
      // ignore json parse error and use fallback message
    }

    throw new Error(message);
  }

  return normalizeIndexedFolderResponse(await response.json());
}
