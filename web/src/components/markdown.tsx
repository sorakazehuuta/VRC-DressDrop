import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import Link from "@/i18n/link";
import { pick } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import { commonMessages } from "./messages";

// 規約・FAQ などの文面（web/content/*.md）を表示する。
// 使える書き方: 見出し（# / ## / ###）、段落、箇条書き（- / 1.）、**太字**、[リンク](URL)、`コード`、
// 画像（1行に ![説明](/パス)。パスを placeholder にすると「画像準備中」の枠を出す）。
// 【要確認】（英語版では【TBD …】）は未確定の箇所として目立たせる。
// 英語版の文面は content/en/ に同じ名前で置く。日本語版を変えたら英語版も合わせて直す

export async function readContent(name: string, locale?: Locale) {
  const lang = locale ?? (await getLocale());
  return readFile(path.join(process.cwd(), "content", ...(lang === "en" ? ["en"] : []), name), "utf8");
}

function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\[(.+?)\]\((.+?)\)|(【(?:要確認|TBD)[^】]*】)|`(.+?)`/g;
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const key = m.index;
    if (m[1]) nodes.push(<strong key={key}>{m[1]}</strong>);
    else if (m[2] && m[3]) {
      nodes.push(
        m[3].startsWith("/") ? (
          <Link key={key} href={m[3]} className="font-medium underline">
            {m[2]}
          </Link>
        ) : (
          <a key={key} href={m[3]} className="font-medium underline" target="_blank" rel="noreferrer">
            {m[2]}
          </a>
        ),
      );
    } else if (m[4]) nodes.push(<mark key={key} className="rounded bg-amber-100 px-1 text-amber-900">{m[4]}</mark>);
    else if (m[5]) nodes.push(<code key={key} className="rounded bg-zinc-100 px-1 font-mono text-[0.9em]">{m[5]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "image"; alt: string; src: string };

function parse(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", text: paragraph.join("") });
    paragraph = [];
  };
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const item = /^(-|\d+\.)\s+(.*)$/.exec(line);
    const image = /^!\[(.*?)\]\((.+?)\)$/.exec(line);
    if (!line) flush();
    else if (image) {
      flush();
      blocks.push({ kind: "image", alt: image[1], src: image[2] });
    }
    else if (heading) {
      flush();
      blocks.push({ kind: "heading", level: heading[1].length as 1 | 2 | 3, text: heading[2] });
    } else if (item) {
      flush();
      const ordered = item[1] !== "-";
      const prev = blocks.at(-1);
      if (prev?.kind === "list" && prev.ordered === ordered) prev.items.push(item[2]);
      else blocks.push({ kind: "list", ordered, items: [item[2]] });
    } else paragraph.push(line);
  }
  flush();
  return blocks;
}

export async function Markdown({ source }: { source: string }) {
  const m = pick(commonMessages, await getLocale());
  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed text-zinc-800">
      {parse(source).map((b, i) => {
        if (b.kind === "heading") {
          if (b.level === 1) return <h1 key={i} className="text-2xl font-bold text-brand">{inline(b.text)}</h1>;
          if (b.level === 2) return <h2 key={i} className="mt-6 border-b border-zinc-200 pb-1 text-lg font-semibold text-brand">{inline(b.text)}</h2>;
          return <h3 key={i} className="mt-3 font-semibold">{inline(b.text)}</h3>;
        }
        if (b.kind === "image") {
          return (
            <figure key={i} className="flex flex-col gap-1">
              {b.src === "placeholder" ? (
                <div className="flex aspect-video items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 bg-zinc-50 p-4 text-center text-xs text-zinc-500">
                  {m.imagePending(b.alt)}
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.src} alt={b.alt} className="max-w-full self-start rounded-lg border border-zinc-200" />
              )}
              {b.src !== "placeholder" && <figcaption className="text-xs text-zinc-500">{b.alt}</figcaption>}
            </figure>
          );
        }
        if (b.kind === "list") {
          const List = b.ordered ? "ol" : "ul";
          return (
            <List key={i} className={`flex flex-col gap-1 pl-6 ${b.ordered ? "list-decimal" : "list-disc"}`}>
              {b.items.map((item, j) => <li key={j}>{inline(item)}</li>)}
            </List>
          );
        }
        return <p key={i}>{inline(b.text)}</p>;
      })}
    </div>
  );
}
