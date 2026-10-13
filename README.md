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

`docs/` は Phase 3 以降で作成します。

## 注意事項

このリポジトリは public です。以下は絶対にコミットしないでください。

- APIキー（`GEMINI_API_KEY`）、合言葉（`APP_TOKEN`）
- GASのデプロイURL、スプレッドシートID
- 個人の家計データ
- `.clasp.json`、`.clasprc.json`（`.gitignore` で除外済み）

秘密情報は、GASのスクリプトプロパティにのみ保存します。

## セットアップ

画面の項目名は、Googleの公式ドキュメントの英語表記に合わせています。日本語の画面では表記が異なる場合があります。

### 1. スプレッドシートを作る

1. Googleスプレッドシートで空のスプレッドシートを作る
2. URL の `https://docs.google.com/spreadsheets/d/<ここ>/edit` の部分を控える（スプレッドシートID）

### 2. GASプロジェクトを作る（スタンドアロン）

1. https://script.google.com で新しいプロジェクトを作る
2. **Project Settings**（歯車アイコン）で次の2つを確認・設定する
   - スクリプトID を控える
   - **Script Properties** に次を追加する

     | プロパティ | 値 |
     |---|---|
     | `APP_TOKEN` | 英数字だけの長いランダムな文字列（各端末で入力する合言葉） |
     | `SPREADSHEET_ID` | 手順1で控えたID |

### 3. clasp でコードを反映する（PCで実施）

clasp は Node.js 22 以上が必要です。

1. https://script.google.com/home/usersettings で Google Apps Script API を有効にする
2. clasp をインストールしてログインする

   ```sh
   npm install -g @google/clasp
   clasp login
   ```

3. リポジトリ直下に `.clasp.json` を作る（`.gitignore` で除外済み。コミットしない）

   ```json
   { "scriptId": "<スクリプトID>", "rootDir": "gas" }
   ```

4. リポジトリ直下で反映する。リモートのプロジェクトは丸ごと `gas/` の内容に置き換わります

   ```sh
   clasp push
   ```

### 4. シートを初期化する

1. GASのエディタで `setupSheet` を選んで実行する（初回は権限の承認画面が出るので許可する）
2. スプレッドシートに `transactions` シートと見出し行ができたことを確認する

### 5. Webアプリとしてデプロイする

1. エディタの **Deploy > New deployment** で種類に **Web app** を選ぶ
2. 実行するユーザーを「自分」、アクセスできるユーザーを「全員（ログインしていない人を含む）」にする
   （`gas/appsscript.json` の `executeAs: USER_DEPLOYING`、`access: ANYONE_ANONYMOUS` に相当）
3. 発行された `/exec` で終わるURLを控える（コミットしない）

コードを変更したあとは、`clasp push` のあと、デプロイの管理画面で既存のデプロイを新しいバージョンに更新します。URLは変わりません。

### 6. 動作確認（curl）

トークンをコマンド履歴に残さないよう、`read -s` で入力します。

```sh
read -rs APP_TOKEN        # トークンを入力（画面には表示されない）
read -r GAS_URL           # /exec で終わるURLを入力

# 応答確認 → {"ok":true,"message":"pong"}
curl -sSL -H 'Content-Type: text/plain' \
  -d "{\"token\":\"$APP_TOKEN\",\"action\":\"ping\"}" "$GAS_URL"

# 追加 → {"ok":true,"record":{...}}
curl -sSL -H 'Content-Type: text/plain' \
  -d "{\"token\":\"$APP_TOKEN\",\"action\":\"add\",\"data\":{\"date\":\"2026-10-13\",\"store\":\"テスト\",\"category\":\"食費\",\"amount\":100,\"payment\":\"現金\",\"memo\":\"=1+1\",\"source\":\"manual\"}}" "$GAS_URL"

# 一覧（月で絞り込み）→ {"ok":true,"records":[...]}
curl -sSL -H 'Content-Type: text/plain' \
  -d "{\"token\":\"$APP_TOKEN\",\"action\":\"list\",\"data\":{\"month\":\"2026-10\"}}" "$GAS_URL"

# 誤ったトークン → {"ok":false,"error":"認証に失敗しました"}
curl -sSL -H 'Content-Type: text/plain' -d '{"token":"x","action":"ping"}' "$GAS_URL"

# GET → {"ok":false,"error":"POSTを使用してください"}
curl -sSL "$GAS_URL"
```

`-X POST` は付けないでください。GASは応答を別URLへリダイレクトします。`-L` だけなら、curl はリダイレクト先を GET で取得します。

`memo` に `=1+1` を入れた行は、シート上で数式として計算されず、`=1+1` という文字列のまま表示されることを確認してください。

## API

`doPost` に、JSON文字列を `Content-Type: text/plain` で送ります。

```json
{ "token": "<APP_TOKEN>", "action": "ping | add | list", "data": { } }
```

| action | data | 成功時のレスポンス |
|---|---|---|
| `ping` | なし | `{ "ok": true, "message": "pong" }` |
| `add` | `date`（YYYY-MM-DD、必須）、`amount`（整数、必須）、`source`（`manual` / `receipt`、必須）、`store`・`category`・`payment`・`memo`（文字列、省略可） | `{ "ok": true, "record": { ... } }` |
| `list` | `month`（YYYY-MM、省略可） | `{ "ok": true, "records": [ ... ] }`（日付の新しい順） |

失敗時は `{ "ok": false, "error": "..." }` を返します。HTTPステータスでは成否を区別しません。

## 開発状況

- [ ] Phase 0：レシート読み取り精度の検証
- [x] Phase 1：リポジトリ初期化
- [ ] Phase 2：スプレッドシートとGASの土台
- [ ] Phase 3：手動入力でフロント→GAS→シートを一周させる
- [ ] Phase 4：レシート読み取り
- [ ] Phase 5：一覧・月次集計画面、仕上げ

詳細は [CLAUDE.md](CLAUDE.md) を参照してください。
