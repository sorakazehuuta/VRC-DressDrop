import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseNews } from "@/lib/news";

describe("お知らせの見出し", () => {
  it("日付とタイトルを書かれた順に取り出し、形式が違う見出しは無視する", () => {
    const source = "# お知らせ\r\n\r\n## 2026-11-07 新しい\r\n\r\n本文\r\n\r\n## 日付なし\r\n\r\n## 2026-10-01 古い\r\n";
    expect(parseNews(source)).toEqual([
      { date: "2026-11-07", title: "新しい" },
      { date: "2026-10-01", title: "古い" },
    ]);
  });

  it("実際のお知らせは新しい順に並んでいる", () => {
    const items = parseNews(readFileSync(path.join(process.cwd(), "content", "news.md"), "utf8"));
    expect(items.length).toBeGreaterThan(0);
    const dates = items.map((i) => i.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });
});
