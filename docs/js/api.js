// GAS Webアプリとの通信。
// CORS のプリフライトを避けるため、JSON 文字列を Content-Type: text/plain で送る。
// GAS の応答は別URLへのリダイレクトを経由するが、fetch は既定でリダイレクトを追う。

import { loadSettings } from './settings.js';

const TIMEOUT_MS = 30000;
// レシートの読み取りは Gemini の応答待ちと、失敗時の1回のやり直しがあるため長めにする。
const TIMEOUT_MS_BY_ACTION = { readReceipt: 60000 };

/** サーバーが ok:false を返した、または通信に失敗したときのエラー。message は利用者向け。 */
export class ApiError extends Error {}

/**
 * action を呼び出し、成功時のレスポンス（ok:true のオブジェクト）を返す。
 * settings を渡すと、保存済みの設定の代わりにそれを使う（接続テスト用）。
 */
export async function callApi(action, data = {}, settings = loadSettings()) {
  const { url, token } = settings;
  if (!url || !token) {
    throw new ApiError('設定画面で GAS の URL と合言葉を設定してください');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS_BY_ACTION[action] ?? TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token, action, data }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ApiError('応答がありません（タイムアウト）。通信環境を確認してください');
    }
    throw new ApiError('GAS に接続できませんでした。URL と通信環境を確認してください');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new ApiError(`GAS からエラーが返りました（HTTP ${res.status}）`);
  }
  let body;
  try {
    body = await res.json();
  } catch (_) {
    throw new ApiError('GAS の応答を読み取れませんでした。URL とデプロイの公開設定を確認してください');
  }
  if (!body || body.ok !== true) {
    throw new ApiError((body && body.error) || '不明なエラーが発生しました');
  }
  return body;
}
