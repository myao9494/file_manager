/**
 * サーバーターミナルの入力補助ロジックのテスト
 * Tabキーでブラウザフォーカスが移らない判定を検証する
 */
import { describe, expect, it } from "vitest";

import { shouldPreventTerminalTabFocus } from "./ServerTerminal";

describe("ServerTerminal helpers", () => {
  it("prevents plain Tab from moving browser focus away", () => {
    const event = { key: "Tab", altKey: false, ctrlKey: false, metaKey: false } as KeyboardEvent;

    expect(shouldPreventTerminalTabFocus(event)).toBe(true);
  });

  it("allows modified Tab combinations to pass through", () => {
    const event = { key: "Tab", altKey: false, ctrlKey: true, metaKey: false } as KeyboardEvent;

    expect(shouldPreventTerminalTabFocus(event)).toBe(false);
  });
});
