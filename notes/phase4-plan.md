# Phase 4 計画：レシート読み取り（縮小 → Gemini → 確認画面 → 保存）

> 状態：**承認済み・実装済み、実機での確認待ち**（2026-10-15）。決定事項は下の「決めたこと」を参照。
> このファイルに秘密情報（API キー、合言葉、GAS の URL、スプレッドシート ID）や家計データを書かない。

## 前提（2026-10-15 に公式ドキュメントで確認）

- **使う API**：`generateContent` を使う。
  - 公式は新しい Interactions API を推奨しているが、`generateContent` も「引き続き完全にサポート」と明記されている。
    https://ai.google.dev/gemini-api/docs/migrate-to-interactions
  - Interactions API は送った内容を既定でサーバーに保存する（`store=true`）。また 2026年5月に仕様の大きな変更があり、応答の形の記述にも食い違いがある。
    https://ai.google.dev/gemini-api/docs/interactions-breaking-changes-may-2026
- **出力の形の指定**：`generationConfig.responseFormat.text` に `mimeType: "APPLICATION_JSON"` と `schema`（JSON Schema）を入れる。
  - 当初の計画では `responseMimeType` と `responseSchema` で指定する予定だった。しかし API リファレンスでは `responseSchema` が非推奨（deprecated）になっており、「responseFormat を使う」と書かれている。
    https://ai.google.dev/api/generate-content （2026-10-13 更新）
  - null を許す項目は、`type` の配列に `"null"` を含めて書く（例：`{"type": ["string", "null"]}`）。`enum` と `integer` も使える。ただし、JSON Schema の機能がすべて使えるわけではない。
    https://ai.google.dev/gemini-api/docs/structured-output （2026-10-13 更新）
    - このページは Interactions API の書き方で説明している。`generateContent` の `responseFormat` でも同じ書き方が通るかは**未確認**。実装後、利用者の実機テストで確かめる。
- **考える深さ（thinking）**：`gemini-3.5-flash-lite` の既定は minimal、`gemini-3.8-flash` の既定は medium。考える深さを下げると速くなる。
  https://ai.google.dev/gemini-api/docs/thinking （2026-10-14 更新）
  - 既定値のまま使う。Phase 0 も既定値で試し、5枚とも正しく読めたため。
  - 3.8-flash に切り替えると既定が medium になり、時間がかかる。Phase 0 の平均は 9.5 秒で、3.5-flash-lite は 6.4 秒だった。
- **画像の解像度の扱い（media resolution）**：Gemini 3 の既定は unspecified（画像1枚 1120 トークン）。文書は medium で精度が頭打ちになりやすい、という記載がある。
  https://ai.google.dev/gemini-api/docs/media-resolution （2026-10-13 更新）
  - 既定値のまま使う。下げるのは、精度に問題がないことを確かめてからにする。
- **画像**：JPEG、PNG、WebP、HEIC、HEIF に対応。画像を直接埋め込んで送る場合、1回のリクエストは全体で 20MB まで。
  https://ai.google.dev/gemini-api/docs/image-understanding （2026-09-23 更新）
- **API キー**：AI Studio の API キーのページで作る。リクエストでは `x-goog-api-key` ヘッダーで渡す。ブラウザ側に置かず、サーバー側（GAS）から呼ぶ。「Gemini API にだけ使える」制限をかけられる。
  https://ai.google.dev/gemini-api/docs/api-key （2026-10-06 更新）
- **エラー**：400・403 は送り方やキーの誤りで、やり直しても直らない（403 はキーが無効なとき）。429（回数の上限）と 503 は一時的なエラーで、間をあけてやり直す。
  https://ai.google.dev/gemini-api/docs/troubleshooting （2026-10-13 更新）
  - 応答が来ても読み取り結果がないことがある。たとえば、入力が止められると `promptFeedback.blockReason` が入って候補が返らない。また `finishReason` が `STOP` 以外（`MAX_TOKENS`、`SAFETY`、`SPII` など）になることもある。
    https://ai.google.dev/api/generate-content
- **GAS の上限**（一般アカウント）
  - 1回の実行は6分まで。
  - URL Fetch は1日 20,000 回、1回の送信は 50MB まで。
  - https://developers.google.com/apps-script/guides/services/quotas （2026-09-03 更新）
- **GAS から外部に通信する権限**：`UrlFetchApp` には `https://www.googleapis.com/auth/script.external_request` が必要。`appsscript.json` に追加すると、権限の承認とデプロイの更新をやり直す必要がある。
  https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app
- **未確認（実機で確かめる）**
  - GAS の Webアプリが受け付ける POST の大きさの上限
    - 公式の記載は見つからなかった（2026-10-15 に再度検索）。上の 50MB は GAS から外へ送るときの上限で、受け取る側の上限ではない。
  - 写真の向き（撮影時の向きの情報）が、縮小のとき正しく反映されるか
    - `createImageBitmap` の既定は、撮影時の向きの情報に従って回転させる（`imageOrientation: "from-image"`）。
      https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap （2025-06-23 更新）
    - canvas の `drawImage` でも主要ブラウザが向きを反映するようになった、という報告がある。ただし二次情報で、2020〜2022年のもの。Safari では `ImageBitmap` の扱いに不具合の報告もあった。
      https://bugzilla.mozilla.org/show_bug.cgi?id=1616169 、https://bugs.webkit.org/show_bug.cgi?id=242137
  - iOS Safari の canvas の大きさの上限
    - 約1,677万画素（16,777,216）を超える canvas は使えない、という報告がある。二次情報で、現在の iOS での値は未確認。
      https://pqina.nl/blog/canvas-area-exceeds-the-maximum-limit/
    - iPhone の 2400万画素や 4800万画素の写真を、そのままの大きさで canvas に描くと超える（推論）。
  - canvas から作り直した JPEG に、元の写真の位置情報など（Exif）が残らないこと
    - canvas は画素から新しく画像を作るので残らない、という二次情報（2013年の WHATWG のメーリングリスト）しか見つからなかった。この作業環境の Chromium で確かめ、iPhone でも確認する。
      https://lists.whatwg.org/pipermail/whatwg-whatwg.org/2013-June/039715.html
  - 無料枠の1日あたりの上限（AI Studio の利用上限のページで利用者が確認する）

## 処理の流れ

```
[入力] レシートを読み取る
  → 撮影または写真を選ぶ
  → 長い辺 2000px の canvas に縮小して描く（元の大きさの canvas は作らない）
  → 個人情報の部分を隠す（決めていただくこと 1）
  → JPEG にして base64 で送信（元のファイルは送らない）
GAS: action "readReceipt" → Gemini（generateContent、モデルは GEMINI_MODEL = gemini-3.5-flash-lite）
  → 応答の値をチェック・整形 → 返す（シートには書かない）
[入力] 既存のフォームに値を流し込む（source = receipt）
  → 確認・修正 → 保存（既存の add を使う）
```

- 縮小を先にする理由：iOS の canvas の大きさの上限を避けるため。また、隠す作業も縮小後の画像で行えば十分なため。
- 元のファイルを送らない理由：位置情報などのメタデータを Gemini に送らないため。
- 長い辺 2000px は仮の値で、コードの定数1か所で変えられるようにする。
  - 細長いレシート（縦横比 1:4 など）では、幅が 500px ほどになる。実機で読み取りの精度が落ちるようなら見直す。
  - JPEG の画質は 0.85 とする。1枚あたり数百KB程度になる見込み（推定。実機で確かめる）。

## 実装の範囲

### GAS（`gas/`）

- `Gemini.js`（新規）
  - スクリプトプロパティの `GEMINI_API_KEY` と `GEMINI_MODEL` を読み、`generateContent` を呼ぶ。
  - `GEMINI_MODEL` は URL の一部になるので、英小文字・数字・`.`・`-` 以外を含む値は受け付けない。
  - 指示文は `notes/phase0.md` のものを使い、出力の形（スキーマ）も指定する。
  - `UrlFetchApp` は `muteHttpExceptions: true` で呼び、HTTP の状態コードで処理を分ける。
- `readReceipt` の処理（新規）
  - 受け取った画像の形式（JPEG のみ）と大きさをチェックする。base64 で 5MB を超えたら受け付けない（仮の値）。
  - 応答の値をチェックする。条件に合わない値は空にする。
    - 日付：実在する YYYY-MM-DD でなければ空にする。
    - 金額：手動入力と同じ条件（1〜1億の整数）でなければ空にする。
    - 店名：200字まで。
    - 支払方法：選択肢にない値なら空にする。
    - 明細：100行までにする。
  - エラーごとの日本語メッセージ：
    - 429：「読み取り回数の上限に達した可能性があります」。1日の回数は太平洋時間の0時、日本時間では16時（夏時間の期間）か17時にリセットされることも示す。
    - 403：「API キーの設定を確認してください」
    - 503 など：1回だけやり直す。それでも失敗したらエラーを返す。
    - 結果がない場合（`blockReason` がある、`finishReason` が `STOP` 以外、JSON として読めない）：「レシートを読み取れませんでした。手で入力してください」
  - ログに残さないもの：画像、API キー、Gemini の応答の中身（レシートの内容は家計データのため）。エラー時に残すのは、状態コードと処理の場所だけにする。
- `appsscript.json`：権限の一覧に `script.external_request` を追加する。

### 画面（`docs/`）

- `js/receipt.js`（新規）
  - 画像を読み込み、長い辺 2000px の canvas に縮小して描く。
  - 隠す範囲を描く画面を出す（「1つ戻す」「全部消す」あり）。隠す部分は不透明の単色で塗りつぶし、ぼかしは使わない。ぼかしは元に戻せる場合があるため。
  - JPEG にして base64 に変換する。
- 入力画面
  - 上部に「レシートを読み取る」ボタンを置く。中身は `<input type="file" accept="image/*">` で、撮影と写真ライブラリからの選択の両方ができる。
  - 読み取り中は操作できないようにし、「読み取っています…」と表示する。
  - `readReceipt` の待ち時間は 60 秒にする。今の `api.js` は一律 30 秒なので、action ごとに変えられるようにする。Gemini の応答に数秒〜10秒ほどかかり、503 のやり直しもありうるため。
  - 読み取った値を既存のフォームに流し込む（`form.js` の `setValues`）。読めなかった項目は空欄にして「確認してください」と表示する。
  - 保存時は `source: receipt` にする。保存後やクリア時は `manual` に戻す。
- 「カメラ確認」タブ：役目を終えたので削除する（決めていただくこと 4）。

### 文書

- README
  - セットアップに、API キーの作り方と、スクリプトプロパティ `GEMINI_API_KEY`・`GEMINI_MODEL` の登録を足す。
  - 権限の承認をやり直す手順を足す。
  - API の表に `readReceipt` を足す。
  - 「iPhone / iPad で使う」の「カメラ確認」の行を直す。
- CLAUDE.md：Phase 4 のチェックと、実機で確かめた結果を書く。

### コミットの単位（予定）

1. GAS：`Gemini.js`、`readReceipt`、権限の追加
2. 画面：`receipt.js`、入力画面のボタン、待ち時間の変更、「カメラ確認」タブの削除
3. 文書：README・CLAUDE.md

### 確認方法

- この作業環境：
  - GAS は、Gemini の応答を模擬して Node.js で確かめる。模擬する応答は、正常、壊れた JSON、429、403、503、`blockReason` あり、`finishReason` が `STOP` 以外。あわせて、ログに画像や応答の中身が出ないことも確かめる。
  - 画面は、Chromium（Playwright）と模擬サーバーで確かめる。確かめる内容は、縮小、塗りつぶし、値の流し込み、エラー表示、送る JPEG に元の写真のメタデータ（位置情報など）が残らないこと。
- 利用者にお願いすること：
  1. AI Studio で API キーを作り、「Gemini API にだけ使える」制限をかける。**課金（請求先アカウント）の設定はしない。**
  2. スクリプトプロパティに `GEMINI_API_KEY` と、`GEMINI_MODEL` = `gemini-3.5-flash-lite` を登録する。
  3. `clasp push` のあと、エディタで `checkGeminiSetup` を実行して権限を承認し直し（ログに「OK」と出ることを確認）、デプロイを新しいバージョンに更新する。
  4. iPhone と iPad の実機で、写真の向き、送信できる大きさ、読み取り結果、塗りつぶした部分が送られていないことを確かめる。

## 決めたこと（2026-10-15 回答）

1〜3 は推奨案、4 は削除。

- 個人情報の隠し方：(a) アプリ内で塗りつぶす
- カテゴリの推定：Gemini に既存の10個から選ばせる
- 明細：(a) 確認画面に参考として表示するだけで保存しない
- 「カメラ確認」タブ：削除する

以下は、回答前に示した選択肢（記録として残す）。

1. **個人情報の隠し方**
   - (a) アプリ内で塗りつぶす（推奨）：カード番号はレシートの中ほどに印字されることが多く、切り取りでは必要な部分まで失いがち。
   - (b) 写真アプリで切り取ってから選ぶ（アプリ側の作業なし。毎回忘れずに行う必要がある）
   - (c) アプリ内で四角く切り取る
2. **カテゴリの推定**：Gemini に既存の10個のカテゴリから選ばせるか。
   - 確認画面で直せるので、手間が減る。
   - ただし、CLAUDE.md の出力項目にない追加になる。また Phase 0 では精度を試していない。追加する場合は、指示文とスキーマに `category` を足す。
   - 推奨：追加する。
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
