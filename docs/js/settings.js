// GAS の URL とトークンを、この端末の localStorage に保存する（家計データは置かない）。

const KEY_URL = 'kakeibo.gasUrl';
const KEY_TOKEN = 'kakeibo.token';

/** 貼り付け時に混じる制御文字・空白を取り除く。 */
export function sanitize(value) {
  return String(value ?? '').replace(/[\p{Cc}\p{Cf}\s]/gu, '');
}

export function loadSettings() {
  try {
    return {
      url: localStorage.getItem(KEY_URL) || '',
      token: localStorage.getItem(KEY_TOKEN) || '',
    };
  } catch (_) {
    return { url: '', token: '' };
  }
}

export function isConfigured() {
  const { url, token } = loadSettings();
  return url !== '' && token !== '';
}

/** 入力値を検査する。問題があればメッセージ、なければ null を返す。 */
export function validateSettings({ url, token }) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    return 'URL の形式が正しくありません';
  }
  if (parsed.protocol !== 'https:' || !parsed.pathname.endsWith('/exec')) {
    return 'URL は https:// で始まり /exec で終わるものを入力してください';
  }
  if (token === '') {
    return '合言葉（トークン）を入力してください';
  }
  return null;
}

/** 保存できなければ例外を投げる。 */
export function saveSettings({ url, token }) {
  localStorage.setItem(KEY_URL, url);
  localStorage.setItem(KEY_TOKEN, token);
}
