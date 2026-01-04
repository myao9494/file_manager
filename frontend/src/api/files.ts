/**
 * ファイルAPI クライアント
 * バックエンドのFastAPI エンドポイントと通信
 *
 * 注: インデックス検索は外部サービス（file_index_service）に移行
 *     → indexService.ts を参照
 */
import type { DirectoryResponse, SearchResponse, SearchParams, PathInfoResponse } from "../types/file";

const API_BASE_URL = import.meta.env.DEV ? "http://localhost:8001/api" : `${window.location.origin}/api`;

/**
 * パスの種別を取得（ファイル/ディレクトリ/存在しない）
 */
export async function getPathInfo(path: string): Promise<PathInfoResponse> {
  const url = new URL(`${API_BASE_URL}/path-info`);
  if (path) {
    url.searchParams.set("path", path);
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "パス情報の取得に失敗しました");
  }

  return response.json();
}

/**
 * ファイル一覧を取得
 */
export async function getFiles(path: string = ""): Promise<DirectoryResponse> {
  const url = new URL(`${API_BASE_URL}/files`);
  if (path) {
    url.searchParams.set("path", path);
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "ファイル一覧の取得に失敗しました");
  }

  return response.json();
}

/**
 * ファイル/フォルダを削除
 */
export async function deleteItem(
  path: string,
  asyncMode: boolean = false,
  debugMode: boolean = false
): Promise<{
  status: string;
  message?: string;
  task_id?: string;
}> {
  const response = await fetch(`${API_BASE_URL}/delete`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path,
      async_mode: asyncMode,
      debug_mode: debugMode
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "削除に失敗しました");
  }
  return await response.json();
}

/**
 * ファイル数をカウント（フォルダの場合は指定した深さまで再帰的にカウント）
 */
export async function countFiles(
  paths: string[],
  maxDepth: number = 3
): Promise<{
  total_count: number;
  details: Array<{
    path: string;
    count: number;
    type: string;
    error?: string;
  }>;
}> {
  const response = await fetch(`${API_BASE_URL}/count-files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      paths,
      max_depth: maxDepth
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "ファイル数カウントに失敗しました");
  }
  return await response.json();
}

/**
 * 複数のファイル/フォルダを一括削除
 */
export async function deleteItemsBatch(
  paths: string[],
  asyncMode: boolean = false,
  debugMode: boolean = false
): Promise<{
  status: string;
  success_count?: number;
  fail_count?: number;
  results?: any[];
  task_id?: string;
  message?: string;
}> {
  const response = await fetch(`${API_BASE_URL}/delete/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      paths,
      async_mode: asyncMode,
      debug_mode: debugMode
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "削除に失敗しました");
  }
  return await response.json();
}

/**
 * フォルダを作成
 */
export async function createFolder(
  parentPath: string,
  name: string
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/create-folder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: parentPath, name }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "フォルダ作成に失敗しました");
  }
}

/**
 * ファイル/フォルダをリネーム
 */
export async function renameItem(
  oldPath: string,
  newName: string
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/rename`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ old_path: oldPath, new_name: newName }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "リネームに失敗しました");
  }
}

/**
 * ファイル検索（Liveモード用 - ディレクトリ走査）
 */
export async function searchFiles(params: SearchParams): Promise<SearchResponse> {
  const url = new URL(`${API_BASE_URL}/search`);
  url.searchParams.set("path", params.path);
  url.searchParams.set("query", params.query);
  url.searchParams.set("depth", params.depth.toString());
  url.searchParams.set("ignore", params.ignore);
  if (params.maxResults) {
    url.searchParams.set("max_results", params.maxResults.toString());
  }
  // ファイルタイプフィルタ
  if (params.fileType && params.fileType !== "all") {
    url.searchParams.set("file_type", params.fileType);
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "検索に失敗しました");
  }

  return response.json();
}

/**
 * ファイル/フォルダを移動
 */
export async function moveItem(
  srcPath: string,
  destPath: string
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ src_path: srcPath, dest_path: destPath }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "移動に失敗しました");
  }
}

/**
 * ファイルを作成
 */
export async function createFile(parentPath: string, name: string, content: string = ""): Promise<{ status: string; message: string; path: string }> {
  const response = await fetch(`${API_BASE_URL}/create-file`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: parentPath, name, content }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "ファイルの作成に失敗しました");
  }
  return await response.json();
}

/**
 * ファイルの内容を更新
 */
export async function updateFile(filePath: string, content: string): Promise<{ status: string; message: string }> {
  const response = await fetch(`${API_BASE_URL}/update-file`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: filePath, content }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "ファイルの更新に失敗しました");
  }
  return await response.json();
}


// 複数ファイル/フォルダを移動（安全な移動: コピー → 検証 → 削除）
// asyncMode=true の場合はタスクIDを返す（非同期処理）
export const moveItemsBatch = async (
  srcPaths: string[],
  destPath: string,
  overwrite: boolean = false,
  verifyChecksum: boolean = false,
  asyncMode: boolean = false,
  debugMode: boolean = false
): Promise<{ status: string; success_count?: number; fail_count?: number; results?: any[]; task_id?: string }> => {
  const response = await fetch(`${API_BASE_URL}/move/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      src_paths: srcPaths,
      dest_path: destPath,
      overwrite,
      verify_checksum: verifyChecksum,
      async_mode: asyncMode,
      debug_mode: debugMode
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "移動に失敗しました");
  }

  return await response.json();
};

// 複数ファイル/フォルダをコピー
export const copyItemsBatch = async (
  srcPaths: string[],
  destPath: string,
  overwrite: boolean = false,
  verifyChecksum: boolean = false,
  asyncMode: boolean = false,
  debugMode: boolean = false
): Promise<{
  status: string;
  success_count?: number;
  fail_count?: number;
  results?: any[];
  task_id?: string;
}> => {
  const response = await fetch(`${API_BASE_URL}/copy/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      src_paths: srcPaths,
      dest_path: destPath,
      overwrite,
      verify_checksum: verifyChecksum,
      async_mode: asyncMode,
      debug_mode: debugMode
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "コピーに失敗しました");
  }

  return await response.json();
};

/**
 * VS Codeで開く
 */
export async function openInVSCode(path: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/open/vscode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "VS Codeで開けませんでした");
  }
}

/**
 * エクスプローラー/Finderで開く
 */
export async function openInExplorer(path: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/open/explorer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "フォルダを開けませんでした");
  }
}

/**
 * ダウンロードURLを取得
 */
export function getDownloadUrl(path: string): string {
  const url = new URL(`${API_BASE_URL}/download`);
  url.searchParams.set("path", path);
  return url.toString();
}

/**
 * Antigravityで開く
 */
export async function openInAntigravity(path: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/open/antigravity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Antigravityで開けませんでした");
  }
}

/**
 * Jupyterで開く
 */
export async function openInJupyter(path: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/open/jupyter`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Jupyterで開けませんでした");
  }
}

/**
 * Excalidrawで開く
 */
export async function openInExcalidraw(path: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/open/excalidraw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Excalidrawで開けませんでした");
  }
}

/**
 * Obsidianで開く
 * パスに「obsidian」を含むディレクトリがある必要がある
 */
export async function openInObsidian(path: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/open/obsidian`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Obsidianで開けませんでした");
  }
}

// ----------------------------------------------------------------
// ファイルオープンAPI
// ----------------------------------------------------------------

/**
 * スマートオープン結果の型
 */
export interface SmartOpenResult {
  status: string;
  action: "opened" | "open_modal";
  message: string;
  content?: string;  // action=open_modalの場合のファイル内容
}

/**
 * ファイル種類に応じてスマートに開く
 * バックエンドで種類判定を行い、適切な処理を実行
 */
export async function openSmart(path: string): Promise<SmartOpenResult> {
  const response = await fetch(`${API_BASE_URL}/open/smart`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "ファイルを開けませんでした");
  }

  return response.json();
}

/**
 * デフォルトアプリケーションでファイルを開く
 */
export async function openInDefaultApp(path: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/open/default`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, message: error.detail || "ファイルを開けませんでした" };
    }

    return { success: true, message: "ファイルを開きました" };
  } catch (error) {
    return { success: false, message: "サーバーに接続できませんでした" };
  }
}

/**
 * ゴミ箱を開く
 */
export async function openTrash(): Promise<{ success: boolean; message?: string; error?: string }> {
  const response = await fetch(`${API_BASE_URL}/open/trash`, {
    method: "POST",
  });
  return await response.json();
}

/**
 * テストフォルダのパスを取得
 */
export async function getTestFolderPath(): Promise<{ success: boolean; path?: string; error?: string }> {
  const response = await fetch(`${API_BASE_URL}/test-folder-path`);
  return await response.json();
}

/**
 * ファイルの内容を取得（Markdownエディタ用）
 */
export async function getFileContent(path: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/file-content?path=${encodeURIComponent(path)}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "ファイル内容の取得に失敗しました");
  }

  const data = await response.json();
  return data.content;
}

