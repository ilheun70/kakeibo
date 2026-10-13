/**
 * Webアプリの入口。
 *
 * リクエスト（POST、本文はJSON文字列）:
 *   { "token": "...", "action": "ping" | "add" | "list", "data": { ... } }
 * レスポンス:
 *   成功 { "ok": true, ... } / 失敗 { "ok": false, "error": "..." }
 *
 * トークンをURLに載せないよう、読み出しも含めてすべてPOSTで受け付ける。
 */

/** action名 → 処理関数。各関数は data を受け取り、レスポンスに足すオブジェクトを返す。 */
const ACTIONS = {
  ping: () => ({ message: 'pong' }),
  add: (data) => ({ record: addTransaction(data) }),
  list: (data) => ({ records: listTransactions(data) }),
};

/** 利用者の入力ミスなど、内容をそのまま返してよいエラー。 */
class ClientError extends Error {}

function doGet() {
  return jsonResponse({ ok: false, error: 'POSTを使用してください' });
}

function doPost(e) {
  try {
    const req = parseRequest(e);
    verifyToken(req.token);
    const handler = Object.prototype.hasOwnProperty.call(ACTIONS, req.action)
      ? ACTIONS[req.action]
      : null;
    if (!handler) {
      throw new ClientError('不明なactionです');
    }
    return jsonResponse(Object.assign({ ok: true }, handler(req.data || {})));
  } catch (err) {
    if (err instanceof ClientError) {
      return jsonResponse({ ok: false, error: err.message });
    }
    // 想定外のエラーは詳細を返さず、実行ログにだけ残す（リクエスト本文は記録しない）。
    console.error(err && err.stack ? err.stack : String(err));
    return jsonResponse({ ok: false, error: 'サーバーでエラーが発生しました' });
  }
}

function parseRequest(e) {
  const body = e && e.postData ? e.postData.contents : '';
  let req;
  try {
    req = JSON.parse(body);
  } catch (_) {
    throw new ClientError('リクエストがJSONではありません');
  }
  if (!req || typeof req !== 'object' || Array.isArray(req)) {
    throw new ClientError('リクエストの形式が不正です');
  }
  return req;
}

function verifyToken(token) {
  const expected = getRequiredProperty('APP_TOKEN');
  if (typeof token !== 'string' || token === '' || token !== expected) {
    throw new ClientError('認証に失敗しました');
  }
}

/** スクリプトプロパティを読む。未設定なら設定漏れとして例外にする。 */
function getRequiredProperty(key) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) {
    throw new Error('スクリプトプロパティ ' + key + ' が未設定です');
  }
  return value;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
