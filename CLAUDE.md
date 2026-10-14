# CLAUDE.md

個人用の家計簿Webアプリ。レシート撮影による自動入力と手動入力に対応し、データはGoogleスプレッドシートに保存する。
販売・配布はしない。利用者は自分1人で、iPhone・iPadなど複数端末から（同時ではなく）使う。

## 最優先の制約

- **運用費は0円**。有料サービス、有料プラン、課金が発生しうる設定は導入しない。必要になりそうな場合は実装前に必ず相談すること。
- **このリポジトリはpublic**（GitHub Freeでは、GitHub Pagesを公開リポジトリでしか使えないため）。APIキー、合言葉（トークン）、GASのデプロイURL、スプレッドシートID、個人の家計データをコミットしない。
- **家計データの保存先はGoogleスプレッドシートのみ**。端末側（localStorage等）には設定値だけを置く。

## 構成

```
iPhone / iPad（Safari、ホーム画面のWebアプリ）
   │  画面・撮影・確認編集      ← GitHub Pages（/docs を公開）
   ▼  fetch POST（Content-Type: text/plain）
Google Apps Script Webアプリ（gas/）
   ├─ レシート画像 → Gemini API（無料枠）→ JSON
   └─ スプレッドシートへの追記・読み出し
```

- フロントエンド：素のHTML / CSS / JavaScript（ESモジュール）。ビルド工程やフレームワークは使わず、`/docs` をそのまま公開する。
- バックエンド：Google Apps Script（GAS）。claspでローカルの `gas/` と同期する。
- 秘密情報（`GEMINI_API_KEY`、`APP_TOKEN`、`GEMINI_MODEL`、`SPREADSHEET_ID`）は、GASのスクリプトプロパティにのみ保存する。
  - `SPREADSHEET_ID` が必要なのは、Webアプリとして実行中は `SpreadsheetApp.getActiveSpreadsheet()` が使えず、`openById()` で開くため（https://developers.google.com/apps-script/guides/bound）。
- 認証：GASはWebアプリとして「自分として実行／全員アクセス可」で公開する。そのため、すべてのリクエストで `APP_TOKEN` を照合する。トークンは各端末で初回に手入力し、localStorageに保存する。

## ディレクトリ構成

```
/
├─ CLAUDE.md
├─ README.md
├─ docs/            # GitHub Pagesで公開されるフロントエンド
│  ├─ index.html
│  ├─ manifest.json # "display": "standalone"
│  ├─ icons/
│  ├─ css/
│  └─ js/
└─ gas/             # Apps Script（clasp の rootDir）
   ├─ appsscript.json
   └─ *.js
```

`.clasp.json` と `.clasprc.json` はコミットしない（`.gitignore` に入れる）。

## UI方針

- スマホ優先で、iPadでも崩れないレスポンシブ設計にする。UIは日本語。
- ホーム画面に追加してWebアプリとして使う前提で、`manifest.json` とアイコンは最初の画面と同時に用意する。
- 撮影は `<input type="file" accept="image/*">` を使う。ホーム画面から起動したWebアプリで撮影できない不具合が過去に報告されていた。
  - 2026-10-14、iPhone・iPad のホーム画面Webアプリで、撮影と写真ライブラリからの選択の両方ができることを実機で確認した（iOS のバージョンは未記録）。
  - OS の更新で挙動が変わる可能性があるため、「写真ライブラリから選ぶ」でも運用できる作りは維持する。
- レシート読み取りの結果は、必ず確認・修正画面を経てから保存する。この確認画面は手動入力フォームと共通にする。

## GAS実装の注意

- フロントからのPOSTは `Content-Type: text/plain` でJSON文字列を送る。`application/json` を付けるとCORSエラーになると報告されているため（公式ドキュメントでは未確認）。
  - `text/plain` の POST はブラウザの事前確認リクエスト（プリフライト）の対象外で、`application/json` は対象になる（https://developer.mozilla.org/en-US/docs/Glossary/CORS-safelisted_request_header）。
  - 2026-10-14、GitHub Pages の画面から `text/plain` で送る方式が実機で動作することを確認した。`application/json` で送った場合の挙動は試していない。
  - GAS の応答はリダイレクト（302）を経由する。ブラウザ（Chromium で確認）はリダイレクトの応答にも CORS の許可を求めるため、GAS 側の仕様が変わると失敗しうる。
- レスポンスは `ContentService` でJSONを返す。エラー時も `{ ok: false, error: "..." }` の形で返す。
- 割り当て上限（一般アカウント）の目安：URL Fetchは1日20,000回。

## Gemini API（レシート読み取り）

- 無料枠（課金アカウントを紐づけないプロジェクト）のみを使う。モデル名はハードコードせず、スクリプトプロパティの `GEMINI_MODEL` から読む。
  - 2026年10月時点で無料枠の対象：Flash系・Flash-Lite系（例：gemini-3.5-flash-lite、gemini-3.1-flash-lite、gemini-2.5-flash）。採用する前に公式の料金ページで現状を確認すること。
- 規約上、無料枠に送った内容は製品改善に使われ、人間がレビューする場合がある。また、個人情報を送らないよう求められている。
  - 送信前に画像を縮小し、カード番号・会員番号など個人情報を含む部分を送らない設計にする（トリミング等）。
- 出力は構造化JSONで受け取る：`date`、`store`、`total`、`items[{name, price}]`、`payment`。
- 読み取り方式（Gemini か 端末内OCR か）は Phase 0 の検証結果で最終決定する。

## スプレッドシート（シート名：`transactions`）

| 列 | 内容 |
|---|---|
| id | UUID |
| date | 支払日（YYYY-MM-DD） |
| store | 店名 |
| category | カテゴリ |
| amount | 金額（円、整数） |
| payment | 支払方法 |
| memo | メモ |
| source | `manual` または `receipt` |
| created_at | 登録日時（ISO 8601） |

列の追加・変更は、既存データへの影響を説明し、承認を得てから行う。

## 開発フェーズ

- [ ] Phase 0：レシート読み取り精度の検証（コードは書かない）
- [x] Phase 1：リポジトリ初期化（本ファイル、README、.gitignore）
- [x] Phase 2：スプレッドシートとGASの土台（doGet / doPost、トークン認証）
- [x] Phase 3：手動入力でフロント→GAS→シートを一周させる。ホーム画面からのカメラ動作もここで実機確認する
- [ ] Phase 4：レシート読み取り（縮小→Gemini→確認画面→保存）
- [ ] Phase 5：一覧・月次集計画面、仕上げ

## 作業ルール

- 回答とコメントは日本語で書く。
- 実装前に計画を提示し、承認を得てから着手する。変更はフェーズ・機能単位で小さくコミットする。
- 新しいライブラリや外部サービスを追加する前に相談する。CDNから読み込む場合も同様。
- 外部APIやサービスの仕様・制限・料金を前提にするときは、記憶ではなく公式ドキュメントで確認し、出典URLを示す。確認できなければ「未確認」と明記する。
- 秘密情報をコード・コミット・ログに出さない。コミット前に `git diff` で確認する。
