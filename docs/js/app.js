// 画面の切り替えと初期化。

import { ApiError, callApi } from './api.js';
import { createEntryForm, today } from './form.js';
import { createMonthlyView } from './monthly.js';
import { createMaskEditor, loadImage } from './receipt.js';
import { allocateSplits } from './split.js';
import { isConfigured, loadSettings, sanitize, saveSettings, validateSettings } from './settings.js';

const yen = new Intl.NumberFormat('ja-JP');

// 画面を切り替える直前に呼ばれる（init で設定する）。
let beforeShowView = () => {};

function showView(name) {
  beforeShowView(name);
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

function describeRecord(record) {
  const store = record.store ? ` ${record.store}` : '';
  return `${record.date}${store} ${yen.format(record.amount)}円`;
}

/**
 * 入力画面。レシートの読み取り結果の確認と、月別の画面から選んだ記録の修正にも使う。
 * onEditEnd(message) は修正・削除・修正のとりやめのあとに呼ばれる（とりやめは message が null）。
 */
function setupEntry({ onEditEnd }) {
  const form = document.getElementById('entry-form');
  const submitButton = form.querySelector('button[type="submit"]');
  const receiptButton = document.getElementById('receipt-button');
  const editBanner = document.getElementById('edit-banner');
  const deleteButton = document.getElementById('edit-delete');
  const DELETE_LABEL = deleteButton.textContent;
  let editing = null; // 修正中の記録
  let deleteTimer = null;
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
      if (editing) {
        const { record } = await callApi('update', Object.assign({ id: editing.id }, values));
        endEdit();
        onEditEnd(`修正しました：${describeRecord(record)}`);
        return null;
      }
      if (values.splits) {
        const { date, store, payment, memo, splits } = values;
        const { records } = await callApi('addMany', { date, store, payment, memo, source, splits });
        endReceipt();
        return `保存しました：${describeRecord(values)}（${records.length}行に分けて保存）`;
      }
      const { record } = await callApi('add', Object.assign({ source }, values));
      endReceipt();
      return `保存しました：${describeRecord(record)}`;
    },
  });

  /** 削除ボタンを、1回目の押下前の状態に戻す。 */
  function disarmDelete() {
    clearTimeout(deleteTimer);
    deleteTimer = null;
    deleteButton.textContent = DELETE_LABEL;
    deleteButton.classList.remove('armed');
  }

  function endEdit() {
    editing = null;
    disarmDelete();
    editBanner.hidden = true;
    receiptButton.hidden = false;
    submitButton.textContent = '保存';
    entry.setSplitAllowed(true);
    entry.clear();
    form.elements.date.value = today();
    entry.setStatus('', '');
  }

  document.getElementById('edit-cancel').addEventListener('click', () => {
    endEdit();
    onEditEnd(null);
  });

  // 誤って消さないよう、2回押したときだけ削除する（confirm() は使わない）。
  deleteButton.addEventListener('click', async () => {
    if (!editing) return;
    if (!deleteTimer) {
      deleteButton.textContent = 'もう一度押すと削除します';
      deleteButton.classList.add('armed');
      deleteTimer = setTimeout(disarmDelete, 4000);
      return;
    }
    disarmDelete();
    const target = editing;
    deleteButton.disabled = true;
    submitButton.disabled = true;
    entry.setStatus('削除しています…', 'busy');
    try {
      await callApi('delete', { id: target.id });
      endEdit();
      onEditEnd(`削除しました：${describeRecord(target)}`);
    } catch (err) {
      entry.setStatus(err instanceof ApiError ? err.message : '削除に失敗しました', 'error');
    } finally {
      deleteButton.disabled = false;
      submitButton.disabled = false;
    }
  });

  document.getElementById('receipt-discard').addEventListener('click', () => {
    endReceipt();
    entry.clear();
    form.elements.date.value = today();
    entry.setStatus('読み取り結果を取り消しました', '');
  });

  return {
    setStatus: entry.setStatus,
    /** 月別の画面で選んだ記録を、修正できる状態でフォームに入れる。 */
    startEdit(record) {
      endReceipt();
      entry.clear();
      entry.setValues({
        date: record.date,
        amount: record.amount,
        store: record.store,
        category: record.category,
        payment: record.payment,
        memo: record.memo,
      });
      editing = record;
      entry.setSplitAllowed(false);
      disarmDelete();
      editBanner.hidden = false;
      receiptButton.hidden = true;
      submitButton.textContent = '修正を保存';
      entry.setStatus('', '');
    },
    /** 修正中なら、修正をとりやめる（ほかの画面に移るとき）。 */
    cancelEdit() {
      if (editing) endEdit();
    },
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
      // 明細が複数のカテゴリにまたがるときは、カテゴリ別に分けた状態にする（金額は明細の比率で配分）。
      const splits = allocateSplits(receipt.items, receipt.amount, receipt.category);
      if (splits.length) entry.setValues({ splits });

      const missing = Object.keys(RECEIPT_FIELD_LABELS)
        .filter((name) => receipt[name] === null || receipt[name] === undefined)
        .map((name) => RECEIPT_FIELD_LABELS[name]);
      resultText.textContent =
        'レシートから読み取りました。内容を確認・修正してから保存してください。' +
        (splits.length ? '明細のカテゴリが複数あったので、カテゴリ別に分けました（金額は明細の比率で配分しています）。' : '') +
        (missing.length ? `読み取れなかった項目：${missing.join('、')}` : '');

      const items = Array.isArray(receipt.items) ? receipt.items : [];
      itemList.replaceChildren(
        ...items.map((item) => {
          const li = document.createElement('li');
          const price = document.createElement('span');
          price.className = 'price';
          price.textContent = `${yen.format(item.price)}円${item.category ? `・${item.category}` : ''}`;
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
  // 撮影用と、写真ライブラリから選ぶ用（予備）
  const inputs = ['receipt-input', 'receipt-library-input'].map((id) => document.getElementById(id));
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

  async function onFileChange(input) {
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
  }

  inputs.forEach((input) => input.addEventListener('change', () => onFileChange(input)));

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
  let monthly = null;
  const entry = setupEntry({
    onEditEnd(message) {
      showView('monthly');
      if (message) monthly.load(message);
    },
  });
  monthly = createMonthlyView({
    onSelect(record) {
      showView('entry');
      entry.startEdit(record);
      window.scrollTo(0, 0);
    },
  });
  beforeShowView = (name) => {
    if (name !== 'entry') entry.cancelEdit();
  };
  document.querySelector('.tab[data-view="monthly"]').addEventListener('click', () => monthly.load());
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
