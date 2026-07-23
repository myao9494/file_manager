/**
 * Git列の状態からアプリ内ターミナルへ貼り付ける同期コマンドを生成する。
 */

export type GitSyncAction = "push" | "pull" | "sync";

function quotePosixShellPath(path: string): string {
  return `'${path.replace(/'/g, "'\\''")}'`;
}

/** 対象フォルダへの移動を含むGit同期コマンドを作る。 */
export function buildGitSyncCommand(path: string, action: GitSyncAction): string {
  const gitCommand = action === "push"
    ? "git push"
    : action === "pull"
      ? "git pull --rebase"
      : "git pull --rebase && git push";
  return `cd ${quotePosixShellPath(path)} && ${gitCommand}`;
}
