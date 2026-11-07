export type NewsItem = { date: string; title: string };

// content/news.md の「## 2026-11-07 タイトル」の見出しを、書かれた順に取り出す
export function parseNews(source: string): NewsItem[] {
  return [...source.matchAll(/^##\s+(\d{4}-\d{2}-\d{2})\s+(.+?)\s*$/gm)].map((m) => ({ date: m[1], title: m[2] }));
}
