import path from "node:path";
import { defineConfig } from "vitest/config";

// npm test      … 単体テスト（tests/unit。ネットにつながない）
// npm run test:db … DB 関数のテスト（tests/db。.env.local の Supabase に、テスト用のユーザーを作って確かめる）
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // サーバー専用のモジュールにつける印。テストでは何もしない
      "server-only": path.resolve(import.meta.dirname, "tests/helpers/empty.ts"),
    },
  },
  test: {
    projects: [
      { extends: true, test: { name: "unit", include: ["tests/unit/**/*.test.ts"] } },
      // DB のテストは同じユーザーの行を触るため、ファイルを順に実行する
      {
        extends: true,
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts"],
          pool: "forks",
          poolOptions: { forks: { singleFork: true } },
          testTimeout: 30000,
          hookTimeout: 60000,
        },
      },
    ],
  },
});
