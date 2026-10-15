// 入力・確認フォーム。手動入力と、Phase 4 のレシート読み取り結果の確認で共通に使う。

import { CATEGORIES, PAYMENTS } from './options.js';

const MAX_AMOUNT = 100000000;

/** 端末のローカル時刻で今日の日付を YYYY-MM-DD で返す。 */
export function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 全角数字を半角にし、桁区切りや空白・「円」を取り除く。 */
export function normalizeAmount(text) {
  return String(text ?? '')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,，、\s円¥￥]/g, '');
}

function isValidDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function fillSelect(select, values) {
  select.replaceChildren(
    ...values.map((v) => {
      const option = document.createElement('option');
      option.value = v;
      option.textContent = v;
      return option;
    })
  );
}

/**
 * フォームを初期化して操作用のオブジェクトを返す。
 * onSubmit(values) は保存処理を行う async 関数。例外を投げると入力内容を残したままエラーを表示する。
 */
export function createEntryForm(form, { onSubmit, statusEl }) {
  const fields = form.elements;
  fillSelect(fields.category, CATEGORIES);
  fillSelect(fields.payment, PAYMENTS);
  const submitButton = form.querySelector('button[type="submit"]');

  function showFieldError(name, message) {
    const el = form.querySelector(`[data-error-for="${name}"]`);
    if (el) el.textContent = message;
    fields[name].setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function setStatus(message, kind) {
    statusEl.textContent = message;
    statusEl.dataset.kind = kind || '';
  }

  /** 入力値を検査し、正しければ送信用の値、誤りがあれば null を返す。 */
  function readValues() {
    const values = {
      date: fields.date.value,
      amount: normalizeAmount(fields.amount.value),
      store: fields.store.value.trim(),
      category: fields.category.value,
      payment: fields.payment.value,
      memo: fields.memo.value.trim(),
    };
    const errors = {
      date: isValidDate(values.date) ? '' : '日付を入力してください',
      amount:
        /^\d+$/.test(values.amount) && Number(values.amount) > 0 && Number(values.amount) <= MAX_AMOUNT
          ? ''
          : '1円以上の整数を入力してください',
      store: values.store.length <= 200 ? '' : '200文字以内で入力してください',
      memo: values.memo.length <= 1000 ? '' : '1000文字以内で入力してください',
    };
    Object.entries(errors).forEach(([name, message]) => showFieldError(name, message));
    const firstError = Object.keys(errors).find((name) => errors[name]);
    if (firstError) {
      fields[firstError].focus();
      return null;
    }
    return Object.assign(values, { amount: Number(values.amount) });
  }

  /** 値を流し込む（レシートの読み取り結果を表示するときに使う）。null と undefined の項目は変えない。 */
  function setValues(values) {
    ['date', 'amount', 'store', 'category', 'payment', 'memo'].forEach((name) => {
      if (values[name] !== undefined && values[name] !== null) {
        fields[name].value = String(values[name]);
      }
    });
  }

  /** 日付を残して入力欄を空にする。 */
  function clear() {
    const date = fields.date.value;
    form.reset();
    fields.date.value = date || today();
    ['date', 'amount', 'store', 'memo'].forEach((name) => showFieldError(name, ''));
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitButton.disabled) return;
    const values = readValues();
    if (!values) {
      setStatus('入力内容を確認してください', 'error');
      return;
    }
    submitButton.disabled = true;
    setStatus('保存しています…', 'busy');
    try {
      const message = await onSubmit(values);
      clear();
      setStatus(message, 'success');
      fields.amount.focus();
    } catch (err) {
      setStatus(err.message, 'error');
    } finally {
      submitButton.disabled = false;
    }
  });

  fields.date.value = today();
  return { setValues, clear, setStatus };
}
