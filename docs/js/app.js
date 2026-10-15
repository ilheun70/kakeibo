// 画面の切り替えと初期化。

import { ApiError, callApi } from './api.js';
import { createEntryForm, today } from './form.js';
import { createMaskEditor, loadImage } from './receipt.js';
import { isConfigured, loadSettings, sanitize, saveSettings, validateSettings } from './settings.js';

const yen = new Intl.NumberFormat('ja-JP');

function showView(name) {
  document.querySelectorAll('.view').forEach((view) => {
    view.hidden = view.id !== `view-${name}`;
  });
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.setAttribute('aria-current', tab.dataset.view === name ? 'page' : 'false');
  });
}

function setStatus(el, message, kind) {
  el.textContent = message;
  el.dataset.kind = kind || '';
}

const RECEIPT_FIELD_LABELS = {
  date: '日付',
  amount: '金額',
  store: '店名',
  category: 'カテゴリ',
  payment: '支払方法',
};

/** 入力画面。レシートの読み取り結果も、このフォームで確認・修正してから保存する。 */
function setupEntry() {
  const form = document.getElementById('entry-form');
  const result = document.getElementById('receipt-result');
  const resultText = document.getElementById('receipt-result-text');
  const itemsBox = document.getElementById('receipt-items-box');
  const itemList = document.getElementById('receipt-items');
  let source = 'manual';

  function endReceipt() {
    source = 'manual';
    result.hidden = true;
    itemList.replaceChildren();
  }

  const entry = createEntryForm(form, {
    statusEl: document.getElementById('entry-status'),
    async onSubmit(values) {
      const { record } = await callApi('add', Object.assign({ source }, values));
      endReceipt();
      const store = record.store ? ` ${record.store}` : '';
      return `保存しました：${record.date}${store} ${yen.format(record.amount)}円`;
    },
  });

  document.getElementById('receipt-discard').addEventListener('click', () => {
    endReceipt();
    entry.clear();
    form.elements.date.value = today();
    entry.setStatus('読み取り結果を取り消しました', '');
  });

  return {
    setStatus: entry.setStatus,
    /** 読み取り結果をフォームに入れる。読めなかった項目は空欄（選択肢は既定のまま）にする。 */
    showReceipt(receipt) {
      entry.clear();
      entry.setValues({
        date: receipt.date ?? '',
        amount: receipt.amount ?? '',
        store: receipt.store ?? '',
        category: receipt.category,
        payment: receipt.payment,
      });
      source = 'receipt';

      const missing = Object.keys(RECEIPT_FIELD_LABELS)
        .filter((name) => receipt[name] === null || receipt[name] === undefined)
        .map((name) => RECEIPT_FIELD_LABELS[name]);
      resultText.textContent =
        'レシートから読み取りました。内容を確認・修正してから保存してください。' +
        (missing.length ? `読み取れなかった項目：${missing.join('、')}` : '');

      const items = Array.isArray(receipt.items) ? receipt.items : [];
      itemList.replaceChildren(
        ...items.map((item) => {
          const li = document.createElement('li');
          const price = document.createElement('span');
          price.className = 'price';
          price.textContent = `${yen.format(item.price)}円`;
          li.append(item.name, price);
          return li;
        })
      );
      itemsBox.hidden = items.length === 0;
      itemsBox.open = false;
      result.hidden = false;
      entry.setStatus('', '');
    },
  };
}

/** レシートを選ぶ → 塗りつぶす → 読み取る。 */
function setupReceipt(entry) {
  const input = document.getElementById('receipt-input');
  const canvas = document.getElementById('receipt-canvas');
  const undoButton = document.getElementById('receipt-undo');
  const clearButton = document.getElementById('receipt-clear');
  const cancelButton = document.getElementById('receipt-cancel');
  const sendButton = document.getElementById('receipt-send');
  const status = document.getElementById('receipt-status');
  let maskCount = 0;

  const editor = createMaskEditor(canvas, {
    onChange(count) {
      maskCount = count;
      undoButton.disabled = count === 0;
      clearButton.disabled = count === 0;
    },
  });

  function setBusy(busy) {
    [cancelButton, sendButton, ...document.querySelectorAll('.tab')].forEach((el) => {
      el.disabled = busy;
    });
    undoButton.disabled = busy || maskCount === 0;
    clearButton.disabled = busy || maskCount === 0;
    canvas.classList.toggle('busy', busy);
  }

  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.value = ''; // 同じ写真をもう一度選んでも change が起きるようにする
    if (!file) return;
    if (!isConfigured()) {
      entry.setStatus('設定画面で GAS の URL と合言葉を設定してください', 'error');
      return;
    }
    entry.setStatus('画像を読み込んでいます…', 'busy');
    let img;
    try {
      img = await loadImage(file);
    } catch (_) {
      entry.setStatus('画像を読み込めませんでした。別の写真で試してください', 'error');
      return;
    }
    entry.setStatus('', '');
    editor.load(img);
    setStatus(status, '', '');
    showView('receipt');
    window.scrollTo(0, 0);
  });

  undoButton.addEventListener('click', () => editor.undo());
  clearButton.addEventListener('click', () => editor.clearMasks());
  cancelButton.addEventListener('click', () => {
    editor.release();
    showView('entry');
  });

  sendButton.addEventListener('click', async () => {
    setBusy(true);
    setStatus(status, '読み取っています…', 'busy');
    try {
      const image = editor.toJpegBase64();
      const { receipt } = await callApi('readReceipt', { image });
      editor.release();
      entry.showReceipt(receipt);
      showView('entry');
      window.scrollTo(0, 0);
    } catch (err) {
      setStatus(status, err instanceof ApiError ? err.message : '読み取りに失敗しました', 'error');
    } finally {
      setBusy(false);
    }
  });
}

function setupSettings() {
  const form = document.getElementById('settings-form');
  const status = document.getElementById('settings-status');
  const testButton = document.getElementById('settings-test');
  const current = loadSettings();
  form.elements.url.value = current.url;
  form.elements.token.value = current.token;

  function readForm() {
    const values = {
      url: sanitize(form.elements.url.value),
      token: sanitize(form.elements.token.value),
    };
    form.elements.url.value = values.url;
    form.elements.token.value = values.token;
    return values;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = readForm();
    const error = validateSettings(values);
    if (error) {
      setStatus(status, error, 'error');
      return;
    }
    try {
      saveSettings(values);
    } catch (_) {
      setStatus(status, 'この端末に保存できませんでした（プライベートブラウズでは保存できない場合があります）', 'error');
      return;
    }
    document.getElementById('settings-notice').hidden = true;
    setStatus(status, '保存しました', 'success');
  });

  testButton.addEventListener('click', async () => {
    const values = readForm();
    const error = validateSettings(values);
    if (error) {
      setStatus(status, error, 'error');
      return;
    }
    testButton.disabled = true;
    setStatus(status, '接続しています…', 'busy');
    try {
      await callApi('ping', {}, values);
      setStatus(status, '接続できました（まだ保存していない場合は「保存」を押してください）', 'success');
    } catch (err) {
      setStatus(status, err instanceof ApiError ? err.message : '接続テストに失敗しました', 'error');
    } finally {
      testButton.disabled = false;
    }
  });
}

function init() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => showView(tab.dataset.view));
  });
  const entry = setupEntry();
  setupReceipt(entry);
  setupSettings();

  if (isConfigured()) {
    showView('entry');
  } else {
    document.getElementById('settings-notice').hidden = false;
    showView('settings');
  }
}

init();
