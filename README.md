# kakeibo

個人用の家計簿Webアプリです。レシート撮影による自動入力と手動入力に対応し、データはGoogleスプレッドシートに保存します。

販売・配布はしません。利用者は作者1人で、iPhone・iPadなど複数端末から使います。

## 構成

```
iPhone / iPad（Safari、ホーム画面のWebアプリ）
   │  画面・撮影・確認編集      ← GitHub Pages（/docs を公開）
   ▼  fetch POST
Google Apps Script Webアプリ（gas/）
   ├─ レシート画像 → Gemini API → JSON
   └─ スプレッドシートへの追記・読み出し
```

- フロントエンド：素のHTML / CSS / JavaScript（ビルド工程なし）
- バックエンド：Google Apps Script（clasp でローカルと同期）
- データ保存先：Googleスプレッドシートのみ

## ディレクトリ構成

```
/
├─ CLAUDE.md   # 開発方針・制約（Claude Code 向け）
├─ README.md
├─ docs/       # GitHub Pagesで公開されるフロントエンド
└─ gas/        # Apps Script（clasp の rootDir）
```

`docs/` と `gas/` は Phase 2 以降で作成します。

## 注意事項

このリポジトリは public です。以下は絶対にコミットしないでください。

- APIキー（`GEMINI_API_KEY`）、合言葉（`APP_TOKEN`）
- GASのデプロイURL、スプレッドシートID
- 個人の家計データ
- `.clasp.json`、`.clasprc.json`（`.gitignore` で除外済み）

秘密情報は、GASのスクリプトプロパティにのみ保存します。

## セットアップ

Phase 2 以降で追記します。

## 開発状況

- [ ] Phase 0：レシート読み取り精度の検証
- [x] Phase 1：リポジトリ初期化
- [ ] Phase 2：スプレッドシートとGASの土台
- [ ] Phase 3：手動入力でフロント→GAS→シートを一周させる
- [ ] Phase 4：レシート読み取り
- [ ] Phase 5：一覧・月次集計画面、仕上げ

詳細は [CLAUDE.md](CLAUDE.md) を参照してください。
