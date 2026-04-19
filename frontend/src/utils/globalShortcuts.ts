/**
 * グローバルショートカット判定ユーティリティ
 * ブラウザ既定動作と競合しやすいキー操作を安定して判定する
 */

export function isEditableEventTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function matchesCmdOrCtrlShortcut(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">,
  shortcutKey: string
): boolean {
  if (!event.ctrlKey && !event.metaKey) {
    return false;
  }

  if (event.shiftKey || event.altKey) {
    return false;
  }

  return event.key.toLowerCase() === shortcutKey.toLowerCase();
}
