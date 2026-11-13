import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // unitypackage に同梱する Unity 用スクリプト、規約・FAQ の文面（content/*.md）、プリント面の文字のフォントを、
  // サーバー処理から読めるように本番にも含める
  outputFileTracingIncludes: {
    "/**": ["./gimmicks/unity/**/*.cs", "./content/**/*.md", "./public/fonts/*.ttf"],
  },
};

export default nextConfig;
