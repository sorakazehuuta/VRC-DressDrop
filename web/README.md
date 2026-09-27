# VRC-DressDrop Web

要件は [../Document/project.md](../Document/project.md) を参照。

## セットアップ

1. Supabase でプロジェクトを作成する
2. `supabase/migrations/` の SQL を、ファイル名の順に SQL Editor で実行する（Supabase CLI がある場合は `supabase db push`）
3. `.env.example` を `.env.local` にコピーし、Supabase の URL とキーを設定する
4. 依存パッケージをインストールして起動する

```bash
npm install
npm run dev
```

http://localhost:3000 を開く。

## 構成

- `src/app/` … 画面と Route Handler（App Router）
- `src/lib/supabase/` … Supabase クライアント（`client.ts`: ブラウザ用 / `server.ts`: サーバー用・管理用 / `proxy.ts`: セッション更新）
- `src/proxy.ts` … 全リクエストで Supabase のセッションを更新する（Next.js 16 で middleware から改名）
- `supabase/migrations/` … DB スキーマ・RLS・Storage バケット

## 管理者の設定

SQL Editor で次を実行する。

```sql
update public.profiles set is_admin = true where id = '<ユーザーID>';
```
