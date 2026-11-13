import { parse, type Font } from "opentype.js";
import { useEffect, useState } from "react";
import { TEXT_FONTS, type TextFont } from "@/lib/templates/text";

// プリント面の文字のフォント。使われたときに一度だけ読み込む（サーバーと同じ public/fonts のファイル）
const cache = new Map<TextFont, Promise<Font>>();

export function loadTextFont(font: TextFont): Promise<Font> {
  let loaded = cache.get(font);
  if (!loaded) {
    loaded = fetch(TEXT_FONTS[font].file)
      .then((res) => {
        if (!res.ok) throw new Error(`font ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buf) => parse(buf));
    // 読み込みに失敗したら、次に使うときにもう一度読み込む
    loaded.catch(() => cache.delete(font));
    cache.set(font, loaded);
  }
  return loaded;
}

// 使っているフォントを読み込み、読み込めたものを返す（読み込めると描き直しのために値が変わる）
export function useTextFonts(needed: TextFont[]): Partial<Record<TextFont, Font>> {
  const [fonts, setFonts] = useState<Partial<Record<TextFont, Font>>>({});
  const key = [...new Set(needed)].sort().join(",");
  useEffect(() => {
    let cancelled = false;
    for (const font of key ? (key.split(",") as TextFont[]) : []) {
      loadTextFont(font)
        .then((f) => {
          if (!cancelled) setFonts((prev) => (prev[font] === f ? prev : { ...prev, [font]: f }));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [key]);
  return fonts;
}
