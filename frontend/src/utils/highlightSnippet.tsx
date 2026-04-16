/**
 * indexed検索のスニペットに含まれる <mark> タグを安全に分解する
 */
export interface HighlightSnippetPart {
  text: string;
  highlighted: boolean;
}

export function parseHighlightSnippet(snippet: string): HighlightSnippetPart[] {
  if (!snippet) {
    return [];
  }

  const parts: HighlightSnippetPart[] = [];
  const markPattern = /<mark>(.*?)<\/mark>/g;
  let lastIndex = 0;

  for (const match of snippet.matchAll(markPattern)) {
    const matchIndex = match.index ?? 0;

    if (matchIndex > lastIndex) {
      parts.push({
        text: snippet.slice(lastIndex, matchIndex),
        highlighted: false,
      });
    }

    parts.push({
      text: match[1] ?? "",
      highlighted: true,
    });
    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < snippet.length) {
    parts.push({
      text: snippet.slice(lastIndex),
      highlighted: false,
    });
  }

  return parts;
}
