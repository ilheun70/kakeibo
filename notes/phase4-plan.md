# Phase 4 計画：レシート読み取り（縮小 → Gemini → 確認画面 → 保存）

> 状態：**計画を提示済み・未承認**（2026-10-15）。下の「決めていただくこと」4点の回答待ち。回答を得てから実装に着手する。
> このファイルに秘密情報（API キー、合言葉、GAS の URL、スプレッドシート ID）や家計データを書かない。

## 前提（2026-10-15 に公式ドキュメントで確認）

- **使う API**：`generateContent` を使う。
  - 公式は新しい Interactions API を推奨しているが、`generateContent` も「引き続き完全にサポート」と明記されている。
    https://ai.google.dev/gemini-api/docs/migrate-to-interactions
  - Interactions API は送った内容を既定でサーバーに保存する（`store=true`）。また 2026年5月に仕様の大きな変更があり、応答の形の記述にも食い違いがある。
    https://ai.google.dev/gemini-api/docs/interactions-breaking-changes-may-2026
  - `generateContent` の出力の形の指定は、`generationConfig` の `responseMimeType` と `responseSchema` で行う。スキーマの細かい書き方（null を許す書き方など）は実装時に確認する。
    https://ai.google.dev/api/generate-content （2026-10-13 更新）
- **画像**：JPEG、PNG、WebP、HEIC、HEIF に対応。画像を直接埋め込んで送る場合、1回のリクエストは全体で 20MB まで。
  https://ai.google.dev/gemini-api/docs/image-understanding （2026-09-23 更新）
- **API キー**：AI Studio の API キーのページで作る。リクエストでは `x-goog-api-key` ヘッダーで渡す。ブラウザ側に置かず、サーバー側（GAS）から呼ぶ。「Gemini API にだけ使える」制限をかけられる。
  https://ai.google.dev/gemini-api/docs/api-key （2026-10-06 更新）
- **エラー**：400・403 は送り方やキーの誤りで、やり直しても直らない（403 はキーが無効なとき）。429（回数の上限）と 503 は一時的なエラーで、間をあけてやり直す。
  https://ai.google.dev/gemini-api/docs/troubleshooting （2026-10-13 更新）
- **GAS から外部に通信する権限**：`UrlFetchApp` には `https://www.googleapis.com/auth/script.external_request` が必要。`appsscript.json` に追加すると、権限の承認とデプロイの更新をやり直す必要がある。
  https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app
- **未確認（実機で確かめる）**
  - GAS の Webアプリが受け付ける POST の大きさの上限（公式の記載が見つからなかった）
  - 写真の向き（撮影時の向きの情報）が、canvas で縮小するときに正しく反映されるか（CSS の `image-orientation` は既定で反映されるが、canvas の扱いは確認できなかった）
    https://developer.mozilla.org/en-US/docs/Web/CSS/image-orientation
  - 無料枠の1日あたりの上限（AI Studio の利用上限のページで利用者が確認する）

## 処理の流れ

```
[入力] レシートを読み取る
  → 撮影または写真を選ぶ
  → 個人情報の部分を隠す（決めていただくこと 1）
  → 縮小（長い辺 2000px、JPEG）→ base64 にして送信
GAS: action "readReceipt" → Gemini（generateContent、モデルは GEMINI_MODEL = gemini-3.5-flash-lite）
  → 応答の値をチェック・整形 → 返す
[入力] 既存のフォームに値を流し込む（source = receipt）
  → 確認・修正 → 保存（既存の add を使う）
```

## 実装の範囲

### GAS（`gas/`）

- `Gemini.js`（新規）
  - スクリプトプロパティの `GEMINI_API_KEY` と `GEMINI_MODEL` を読み、`generateContent` を呼ぶ。
  - 指示文は `notes/phase0.md` のものを使い、出力の形（スキーマ）も指定する。
- `readReceipt` の処理（新規）
  - 受け取る前に、画像の形式（JPEG のみ）と大きさをチェックする。
  - 応答の値をチェックする。日付が実在しない、金額が整数でない、支払方法が選択肢にない、といった場合はその値を空にする。明細は100行までにする。
  - エラーごとの日本語メッセージ：
    - 429：「読み取り回数の上限に達した可能性があります」
    - 403：「API キーの設定を確認してください」
    - 503 など：1回だけやり直し、それでも失敗したらエラーを返す
  - 画像と API キーはログに一切残さない。
- `appsscript.json`：権限の一覧に `script.external_request` を追加する。

### 画面（`docs/`）

- `js/receipt.js`（新規）
  - 画像を読み込み、隠す範囲を描く画面を出す（「1つ戻す」「全部消す」あり）。
  - 縮小して JPEG にし、base64 に変換する。
- 入力画面
  - 上部に「レシートを読み取る」ボタンを置く。
  - 読み取り中は操作できないようにし、「読み取っています…」と表示する。
  - 読み取った値を既存のフォームに流し込む（`form.js` の `setValues`）。読めなかった項目は空欄にして「確認してください」と表示する。
  - 保存時は `source: receipt` にする。保存後やクリア時は `manual` に戻す。
- 「カメラ確認」タブ：役目を終えたので削除する（決めていただくこと 4）。

### 確認方法

- この作業環境：
  - GAS は、Gemini の応答（正常、壊れた JSON、429、403、503）を模擬して Node.js で確かめる。
  - 画面は、Chromium（Playwright）と模擬サーバーで、縮小、塗りつぶし、値の流し込み、エラー表示を確かめる。
- 利用者にお願いすること：
  1. AI Studio で API キーを作り、「Gemini API にだけ使える」制限をかける。**課金（請求先アカウント）の設定はしない。**
  2. スクリプトプロパティに `GEMINI_API_KEY` と、`GEMINI_MODEL` = `gemini-3.5-flash-lite` を登録する。
  3. `clasp push` のあと、エディタで関数を1回実行して権限を承認し直し、デプロイを新しいバージョンに更新する。
  4. iPhone と iPad の実機で、写真の向き、送信できる大きさ、読み取り結果を確かめる。

## 決めていただくこと（未回答）

1. **個人情報の隠し方**
   - (a) アプリ内で塗りつぶす（推奨）：カード番号はレシートの中ほどに印字されることが多く、切り取りでは必要な部分まで失いがち。
   - (b) 写真アプリで切り取ってから選ぶ（アプリ側の作業なし。毎回忘れずに行う必要がある）
   - (c) アプリ内で四角く切り取る
2. **カテゴリの推定**：Gemini に既存の10個のカテゴリから選ばせるか。確認画面で直せるので手間が減る。ただし CLAUDE.md の出力項目にない追加で、Phase 0 では精度を試していない。推奨：追加する。
3. **明細（items）の扱い**：スプレッドシートに明細の列はない。
   - (a) 確認画面に参考として表示するだけで保存しない（推奨）
   - (b) 「メモ」欄に要約を入れる
4. **「カメラ確認」タブの削除**：削除してよいか。

## これまでの作業で決めた進め方（compact 後の引き継ぎ用）

- 回答・PR・コミットメッセージは**日本語**で書く。
- 作業ブランチは `claude/hopeful-gates-8b57wq`。PR がマージされたら、`main` の最新から同じ名前で作り直して次の作業を始める。PR のマージは利用者の許可を得てから行う。
- コミット前に `git diff` で秘密情報が入っていないことを確認する。
- 個人用の検証スプレッドシート「kakeibo Phase0 検証結果」（利用者の Google ドライブ）は、許可された「集計」タブ以外は読まない（「記録」タブにはレシートの内容が入っている）。
- 利用者の PC は Windows。GAS への反映は PC の clone（`$HOME\kakeibo`）で clasp を使う。curl での確認は Git Bash で行い、貼り付けは Shift+Insert か右クリック（Ctrl+V は制御文字が入る）。
