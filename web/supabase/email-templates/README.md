# 認証メールのテンプレート

Supabase のダッシュボードで設定する（コードからは反映されない）。文面を変えたら、ここのファイルも同じ内容にする。

設定場所: Authentication → Email Templates（項目名はダッシュボードの版で異なることがある）

| 種類 | 件名 | 本文（Source に貼り付ける） |
|---|---|---|
| Confirm sign up | 【VRPrintLab】メールアドレスの確認 / Confirm your email address | `confirm-signup.html` |
| Reset password | 【VRPrintLab】パスワードの再設定 / Reset your password | `reset-password.html` |

- サイトから送るのはこの2種類だけ（招待・マジックリンク・メールアドレスの変更は使っていない）
- リンクは `{{ .ConfirmationURL }}` のまま変えない
- Supabase のテンプレートは言語ごとに分けられないため、件名と本文は日本語と英語を併記する（日本語を変えたら英語も直す）
- 差出人の名前とアドレスは文面では変えられない。独自の SMTP の設定が必要（[handoff.md](../../../Document/handoff.md) の残課題）
