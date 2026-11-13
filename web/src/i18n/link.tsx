"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";
import { useLocalePath } from "./client";

// next/link の代わりに使う。サイト内のリンクに、表示している言語を付ける（英語なら /en/...）
export default function Link({ href, ...props }: ComponentProps<typeof NextLink>) {
  const toLocale = useLocalePath();
  const localizedHref =
    typeof href === "string" ? toLocale(href) : href.pathname ? { ...href, pathname: toLocale(href.pathname) } : href;
  return <NextLink href={localizedHref} {...props} />;
}
