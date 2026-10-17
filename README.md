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
├─ gas/        # Apps Script（clasp の rootDir）
└─ notes/      # 検証の手順と結果のまとめ（個人の家計データは置かない）
```

`docs/` は GitHub Pages で公開する画面、`gas/` は GAS のコードです。

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
     | `GEMINI_API_KEY` | 手順3で作る Gemini の API キー |
     | `GEMINI_MODEL` | `gemini-3.5-flash-lite`（読み取りの失敗が増えたら `gemini-3.8-flash`） |

### 3. Gemini の API キーを作る（レシート読み取り用）

手順は公式ドキュメント（https://ai.google.dev/gemini-api/docs/api-key ）に沿っています。画面の項目名は変わることがあります。

1. https://aistudio.google.com/apikey を開き、**Create API key** でキーを作る
2. 一覧で **Unrestricted** と表示されたキーにカーソルを合わせ、**Add restrictions** → **Restrict to Gemini API only** → **Restrict key** の順に押す
3. 作ったキーを、手順2のスクリプトプロパティ `GEMINI_API_KEY` に登録する

**キーを作ったプロジェクトに、請求先アカウント（課金）を設定しないでください。** 設定しなければ無料枠だけで動きます。
無料枠では、送った画像が Google の製品改善に使われ、人が確認する場合があります。そのため、アプリでは個人情報の部分を塗りつぶしてから送ります。

### 4. clasp でコードを反映する（PCで実施）

この手順は、すべて **PCに clone したフォルダ** で行います。

> **注意**：`.clasp.json` を GitHub の Web画面で作ったり、アップロードしたりしないでください。
> `.gitignore` が働くのは、PC上で `git add` するときだけです。Web画面から作ったファイルは、
> そのまま public リポジトリにコミットされます。

clasp は Node.js 22 以上が必要です。

Windows では、PowerShell を **通常の方法で** 開いてください（「管理者として実行」は使いません）。
管理者として開くと、最初の場所が `C:\Windows\System32` になる場合があります。そこで clone すると、
システムフォルダの中にリポジトリができてしまいます。

1. ホームフォルダに clone し、そのフォルダに移動する

   ```sh
   cd ~                # Windows の PowerShell では cd $HOME
   git clone https://github.com/ilheun70/kakeibo.git
   cd kakeibo
   ```

2. `gas/` があることを確認する

   ```sh
   ls                  # README.md と gas が表示されればOK
   ```

   `gas/` が表示されない場合、clone した `main` に GAS のコードがまだマージされていません。
   作業中のブランチに切り替えてください（ブランチ名は、対応するプルリクエストの画面で確認します）。

   ```sh
   git switch <ブランチ名>
   ```

   GitHub 側にだけある同名のブランチも、このコマンドで取得と切り替えが一度にできます。
   プルリクエストがマージされたあとは、`git switch main` と `git pull` で `main` に戻します。

3. https://script.google.com/home/usersettings で Google Apps Script API を有効にする
4. clasp をインストールしてログインする

   ```sh
   npm install -g @google/clasp
   clasp login
   ```

5. clone したフォルダの直下（`README.md` と同じ場所。`gas/` の中ではない）に、コマンドで `.clasp.json` を作る。
   `ここにID` は、「2. GASプロジェクトを作る」で控えたスクリプトIDに置き換えます（URL全体ではなくIDだけ。前後の `'` は残す）

   Mac / Linux / Git Bash:

   ```sh
   printf '{ "scriptId": "%s", "rootDir": "gas" }\n' 'ここにID' > .clasp.json
   ```

   Windows PowerShell:

   ```powershell
   Set-Content -Path .clasp.json -Value '{ "scriptId": "ここにID", "rootDir": "gas" }' -Encoding ascii
   ```

   メモ帳などのエディタで作ると、設定によっては `.txt` が付いたり、`"` が `“ ”` に変換されたりします。
   そのため、コマンドで作ることを勧めます。

6. `.clasp.json` を確認する

   ```sh
   cat .clasp.json                   # Windows は Get-Content .clasp.json。IDと gas が入っていればOK
   node -e "const c=JSON.parse(require('fs').readFileSync('.clasp.json','utf8')); console.log(c.scriptId, c.rootDir)"
                                     # IDと gas が表示されればOK。エラーなら作り直す
   git check-ignore -v .clasp.json   # 「.gitignore:2:.clasp.json」のように表示されればOK
   git status                        # 一覧に .clasp.json が出ないことを確認
   clasp show-file-status            # gas/ の6ファイル（appsscript.json と .js 5つ）が出ればOK
   ```

   `git check-ignore` で何も表示されない場合は、ファイル名か置き場所が間違っています。
   `ls -a`（Windows は `ls -Force`）で確認してください。

7. 同じフォルダで反映する。リモートのプロジェクトは丸ごと `gas/` の内容に置き換わります

   ```sh
   clasp push
   ```

### 5. シートを初期化する

1. GASのエディタで `setupSheet` を選んで実行する（初回は権限の承認画面が出るので許可する）
2. スプレッドシートに `transactions` シートと見出し行ができたことを確認する
3. 同じく `checkGeminiSetup` を実行し、実行ログに `OK：モデル … を使えます` と出ることを確認する
   （API キーとモデル名の確認だけで、画像は送りません）

### 6. Webアプリとしてデプロイする

1. エディタの **Deploy > New deployment** で種類に **Web app** を選ぶ
2. 実行するユーザーを「自分」、アクセスできるユーザーを「全員（ログインしていない人を含む）」にする
   （`gas/appsscript.json` の `executeAs: USER_DEPLOYING`、`access: ANYONE_ANONYMOUS` に相当）
3. 発行された `/exec` で終わるURLを控える（コミットしない）

コードを変更したあとは、`clasp push` のあと、デプロイの管理画面で既存のデプロイを新しいバージョンに更新します。URLは変わりません。
デプロイが複数あるときは、**アプリの「設定」に入れた URL のデプロイ**を更新してください（`/exec` の直前の数文字で見分けられます）。別のデプロイを更新すると、アプリには古いコードが応答し、「不明なactionです」などのエラーになります。
使っていないデプロイは、デプロイの管理画面でアーカイブしておくと迷いません。
`appsscript.json` の権限（`oauthScopes`）が増えたときは、デプロイを更新する前に、エディタで関数（`checkGeminiSetup` など）を1回実行して権限を承認し直します。

### 7. 動作確認（curl）

bash で実行します。Windows では PowerShell ではなく **Git Bash** を使います（Git for Windows に curl が同梱されています）。

> **Git Bash での貼り付けは Shift+Insert か右クリックのメニューで行う**
> Git Bash の端末（mintty）では、初期設定の Ctrl+V は貼り付けになりません。
> 押すと制御文字（`\026`）が入力され、curl が `(3) URL rejected: Malformed input to a URL function` で失敗します。

トークンをコマンド履歴に残さないよう、`read -s` で入力します。
`read` の行は、コピーせずに日本語入力オフで手入力すると確実です。

```sh
read -rs APP_TOKEN        # トークンを入力（画面には表示されない）
read -r GAS_URL           # /exec で終わるURLを入力

# 貼り付け時に混じった制御文字・空白を取り除く
APP_TOKEN=${APP_TOKEN//[[:cntrl:][:space:]]/}
GAS_URL=${GAS_URL//[[:cntrl:][:space:]]/}

# 値を表示せずに確認する（どちらも何も表示されなければOK）
printf '%s' "$APP_TOKEN" | LC_ALL=C tr -d 'A-Za-z0-9' | od -An -c
printf '%s' "$GAS_URL" | LC_ALL=C tr -d 'A-Za-z0-9:/._-' | od -An -c

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

### 8. 画面を GitHub Pages で公開する

1. GitHub のリポジトリで **Settings > Pages** を開く
2. 「Build and deployment」の「Source」で **Deploy from a branch** を選ぶ
3. ブランチに `main`、フォルダに `/docs` を選んで **Save** を押す
   （未マージの変更を実機で確かめるときは、一時的にそのブランチを選ぶ）
4. しばらくすると `https://ilheun70.github.io/kakeibo/` で開けるようになる

公開されるのは画面のファイルだけです。GAS の URL と合言葉は各端末で入力し、その端末にだけ保存されます。

### 9. iPhone / iPad で使う

1. Safari で上記の URL を開き、共有メニューから **ホーム画面に追加** する
2. **ホーム画面のアイコンから開いて**、「設定」で GAS の URL と合言葉を入力し、「接続テスト」→「保存」の順に押す
   - ホーム画面から開いたアプリと Safari は保存先が別です。Safari で設定しても、ホーム画面のアプリには引き継がれません
3. 「入力」で保存し、スプレッドシートに1行追加されることを確認する
4. 「入力」の「レシートを読み取る」で撮影するか写真を選び、カード番号などの部分を指でなぞって塗りつぶしてから「読み取る」を押す。
   読み取った内容がフォームに入るので、確認・修正してから「保存」を押す
5. 「月別」で、月ごとの合計、カテゴリ別・支払方法別の合計、一覧を見る。一覧の行を押すと、その記録を修正・削除できる
6. 1回の支払いに複数のカテゴリが含まれるときは、入力画面の「カテゴリ別に分ける」で、カテゴリごとの行に分けて保存できる。
   レシートの明細が複数のカテゴリにまたがるときは、読み取った時点で分けた状態になる（金額は明細の比率で配分）

## API

`doPost` に、JSON文字列を `Content-Type: text/plain` で送ります。

```json
{ "token": "<APP_TOKEN>", "action": "ping | add | list | update | delete | readReceipt", "data": { } }
```

| action | data | 成功時のレスポンス |
|---|---|---|
| `ping` | なし | `{ "ok": true, "message": "pong" }` |
| `add` | `date`（YYYY-MM-DD、必須）、`amount`（整数、必須）、`source`（`manual` / `receipt`、必須）、`store`・`category`・`payment`・`memo`（文字列、省略可） | `{ "ok": true, "record": { ... } }` |
| `addMany` | `date`・`source`（必須）、`store`・`payment`・`memo`（省略可）、`splits`（`[{ "category", "amount" }]`、2〜10件） | `{ "ok": true, "records": [ ... ] }`（全行の登録日時が同じ） |
| `list` | `month`（YYYY-MM、省略可） | `{ "ok": true, "records": [ ... ] }`（日付の新しい順） |
| `update` | `id`（必須）、ほかは `add` と同じ（`source` を除く） | `{ "ok": true, "record": { ... } }`（id・source・created_at は変わらない） |
| `delete` | `id`（必須） | `{ "ok": true, "deleted": "<id>" }` |
| `readReceipt` | `image`（JPEG の base64。`data:` の接頭辞なし、必須） | `{ "ok": true, "receipt": { "date", "store", "amount", "category", "payment", "items": [{ "name", "price" }] } }`（読み取れなかった項目は `null`。シートには保存しない） |

失敗時は `{ "ok": false, "error": "..." }` を返します。HTTPステータスでは成否を区別しません。

## 開発状況

- [x] Phase 0：レシート読み取り精度の検証
- [x] Phase 1：リポジトリ初期化
- [x] Phase 2：スプレッドシートとGASの土台
- [x] Phase 3：手動入力でフロント→GAS→シートを一周させる
- [x] Phase 4：レシート読み取り
- [ ] Phase 5：一覧・月次集計画面、仕上げ

詳細は [CLAUDE.md](CLAUDE.md) を参照してください。
