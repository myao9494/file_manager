/**
 * ファイル検索の外部GUIリンクを、バックエンドが動作するOSに合わせて選択する。
 */

const EVERYTHING_GUI_URL = "http://localhost:8080/";

/** macOSはLocal Fulltext Search、WindowsはEverything HTTP GUIのURLを返す。 */
export function getIndexGuiUrl(isWindows: boolean, macGuiUrl: string): string {
  return isWindows ? EVERYTHING_GUI_URL : macGuiUrl;
}
