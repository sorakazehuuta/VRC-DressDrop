import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse, type Font } from "opentype.js";
import { TEXT_FONTS, type TextFont } from "@/lib/templates/text";

// プリント面の文字に使うフォント（public/fonts）。ブラウザと同じファイルを読む
const cache = new Map<TextFont, Promise<Font>>();

export function loadTextFont(font: TextFont): Promise<Font> {
  let loaded = cache.get(font);
  if (!loaded) {
    loaded = readFile(path.join(process.cwd(), "public", TEXT_FONTS[font].file)).then((buf) =>
      parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer),
    );
    cache.set(font, loaded);
  }
  return loaded;
}
