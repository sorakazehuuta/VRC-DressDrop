import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // unitypackage に同梱する Unity 用スクリプトを、サーバー処理から読めるように本番にも含める
  outputFileTracingIncludes: {
    "/**": ["./gimmicks/unity/**/*.cs"],
  },
};

export default nextConfig;
