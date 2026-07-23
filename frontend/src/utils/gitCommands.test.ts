/**
 * Git列からターミナルへ渡すコマンド生成のテスト
 */
import { describe, expect, it } from "vitest";
import { buildGitSyncCommand } from "./gitCommands";

describe("buildGitSyncCommand", () => {
  it("builds a push command with a shell-quoted folder path", () => {
    expect(buildGitSyncCommand("/Users/mine/My Project", "push")).toBe(
      "cd '/Users/mine/My Project' && git push"
    );
  });

  it("builds a pull command", () => {
    expect(buildGitSyncCommand("/Users/mine/repo", "pull")).toBe(
      "cd '/Users/mine/repo' && git pull --rebase"
    );
  });

  it("builds a pull-then-push command for diverged branches", () => {
    expect(buildGitSyncCommand("/Users/mine/repo", "sync")).toBe(
      "cd '/Users/mine/repo' && git pull --rebase && git push"
    );
  });

  it("escapes apostrophes in a folder path", () => {
    expect(buildGitSyncCommand("/Users/mine/O'Reilly", "push")).toBe(
      "cd '/Users/mine/O'\\''Reilly' && git push"
    );
  });
});
