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
  url.searchParams.set("path", params.path ?? "");
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

  return response.json();
}
