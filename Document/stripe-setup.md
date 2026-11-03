# Stripe の設定手順（トークン購入）

トークンの購入は Stripe Checkout（Stripe が用意する決済画面）で行い、入金の確認は Webhook（Stripe からの通知）で受け取ります。
最初はテストモードで動作を確認し、規約類の公開と本番の審査が済んでから本番のキーに切り替えます。

## 1. テストモードで動かす（開発用）

1. [Stripe ダッシュボード](https://dashboard.stripe.com/) にログインし、右上を「テスト環境」に切り替える
2. 「開発者」→「API キー」でシークレットキー（`sk_test_...`）をコピーする
3. `web/.env.local` に次の2行を追加する

   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_dev_local
   ```

   開発中の `STRIPE_WEBHOOK_SECRET` は任意の文字列でかまいません（次の `stripe:forward` がこの値で署名します）。
4. コンビニ払いを使う場合は、「設定」→「決済手段」でコンビニ決済を有効にする（日本のアカウントのみ）。
   有効にしていない支払い方法は決済画面に出ません。カードだけで試すときは `.env.local` に `STRIPE_PAYMENT_METHODS=card` を足します
5. ターミナルを2つ開き、`web` フォルダで次を実行する

   ```bash
   npm run dev              # サイト（http://localhost:3000）
   npm run stripe:forward   # Stripe のイベントをローカルの Webhook に転送する
   ```

   `stripe:forward` は Stripe CLI の `stripe listen` の代わりです（インストール不要）。Stripe CLI を使う場合は
   `stripe listen --forward-to localhost:3000/api/stripe/webhook` を実行し、表示された `whsec_...` を `STRIPE_WEBHOOK_SECRET` にします。

### テスト用のカード

有効期限は未来の日付、セキュリティコードは任意の3桁で使えます。

| カード番号 | 結果 |
|---|---|
| 4242 4242 4242 4242 | 成功（3D セキュアの確認画面が出たら「Complete」を押す） |
| 4000 0027 6000 3184 | 3D セキュアの認証が必要 |
| 4000 0000 0000 0002 | 拒否される |
| 4000 0000 0000 0259 | 支払いのあとにチャージバックが起きる（アカウント停止・カードのブロックの確認用） |

コンビニ払いのテストでは、メールアドレスを `succeed_immediately@test.com` にするとすぐに入金済みになります。

## 2. 本番に切り替える

規約類（利用規約・特定商取引法に基づく表記・プライバシーポリシー・返金方針）を独自ドメインで公開し、Stripe の本番利用の申請が通ってから行います。

1. ダッシュボードを本番環境に切り替え、シークレットキー（`sk_live_...`）を Vercel の環境変数 `STRIPE_SECRET_KEY` に設定する
2. 「開発者」→「Webhook」で送信先を追加する
   - URL: `https://<ドメイン>/api/stripe/webhook`
   - イベント: `checkout.session.completed`、`checkout.session.async_payment_succeeded`、`checkout.session.async_payment_failed`、`checkout.session.expired`、`charge.refunded`、`charge.dispute.created`
3. 作成した Webhook の署名シークレット（`whsec_...`）を Vercel の環境変数 `STRIPE_WEBHOOK_SECRET` に設定する
4. 「設定」→「決済手段」で、カード（Apple Pay / Google Pay を含む）とコンビニ決済を有効にする

## 3. 運用

- **価格の変更**: 管理画面ができるまでは、Supabase の SQL Editor で `token_packs` を更新する（例: `update token_packs set price_jpy = 980 where tokens = 5;`）。`is_active = false` で販売を止められる
- **返金**: Stripe ダッシュボードの支払いの画面から返金する。Webhook を受けて、その支払いで付与したトークンのうち未使用の分が自動で取り消される（使用済みの分は取り消されない）
- **チャージバック**: Webhook を受けて自動で、未使用の分を取り消し、使用済みの分をマイナス残高にし、カードをブロックし、アカウントを停止する。反論は Stripe ダッシュボードの「不審請求の申請」から、ダウンロード履歴を証拠として行う。勝訴しても停止・ブロックは自動では戻らない（Supabase で `profiles.status` を `active` に戻す）
- **有効期限切れ**: トークン画面を開いたときと、ダウンロードの前に、期限が切れたトークンを「有効期限切れ」として履歴に記録する
