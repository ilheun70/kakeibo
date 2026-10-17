/**
 * action "add" / "list" / "update" / "delete" の処理と入力チェック。
 */

const SOURCES = ['manual', 'receipt'];
const MAX_TEXT_LENGTH = 200;
const MAX_MEMO_LENGTH = 1000;
const MAX_ABS_AMOUNT = 100000000;
const NOT_FOUND_MESSAGE = '指定された記録が見つかりません（ほかの端末で削除された可能性があります）';

/**
 * 1件追加し、保存した内容を返す。
 * data: { date, store, category, amount, payment, memo, source }
 */
function addTransaction(data) {
  const record = Object.assign({ id: Utilities.getUuid() }, readEditableFields(data), {
    source: requireSource(data.source),
    created_at: new Date().toISOString(),
  });
  appendRecord(record);
  return record;
}

/** 追加と修正で共通の項目（date〜memo）を検査して返す。 */
function readEditableFields(data) {
  return {
    date: requireDate(data.date),
    store: optionalText(data.store, 'store', MAX_TEXT_LENGTH),
    category: optionalText(data.category, 'category', MAX_TEXT_LENGTH),
    amount: requireAmount(data.amount),
    payment: optionalText(data.payment, 'payment', MAX_TEXT_LENGTH),
    memo: optionalText(data.memo, 'memo', MAX_MEMO_LENGTH),
  };
}

/**
 * id を指定して1件を修正し、修正後の内容を返す。id・source・created_at は変えない。
 * data: { id, date, store, category, amount, payment, memo }
 */
function updateTransaction(data) {
  const id = requireId(data.id);
  const record = updateRecord(id, readEditableFields(data));
  if (!record) {
    throw new ClientError(NOT_FOUND_MESSAGE);
  }
  return record;
}

/** id を指定して1件を削除する。 */
function deleteTransaction(data) {
  const id = requireId(data.id);
  if (!deleteRecord(id)) {
    throw new ClientError(NOT_FOUND_MESSAGE);
  }
  return id;
}

/**
 * 一覧を返す。date の新しい順（同じ日は登録の新しい順）。
 * data: { month?: "YYYY-MM" } 指定した月だけに絞り込む。
 */
function listTransactions(data) {
  let records = readRecords();
  if (data.month !== undefined) {
    if (typeof data.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(data.month)) {
      throw new ClientError('month は YYYY-MM 形式で指定してください');
    }
    records = records.filter((r) => r.date.indexOf(data.month + '-') === 0);
  }
  return records.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
    return 0;
  });
}

function requireDate(value) {
  if (isValidDate(value)) {
    return value;
  }
  throw new ClientError('date は実在する日付を YYYY-MM-DD 形式で指定してください');
}

/** 実在する日付を YYYY-MM-DD 形式で表した文字列なら true。 */
function isValidDate(value) {
  const m = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) {
    return false;
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function requireAmount(value) {
  if (!Number.isInteger(value) || Math.abs(value) > MAX_ABS_AMOUNT) {
    throw new ClientError('amount は整数（円）で指定してください');
  }
  return value;
}

function requireId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ClientError('id が不正です');
  }
  return value;
}

function requireSource(value) {
  if (SOURCES.indexOf(value) === -1) {
    throw new ClientError('source は manual または receipt を指定してください');
  }
  return value;
}

/** 省略可能な文字列。未指定は空文字にし、前後の空白を取り除く。 */
function optionalText(value, name, maxLength) {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value !== 'string') {
    throw new ClientError(name + ' は文字列で指定してください');
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw new ClientError(name + ' は' + maxLength + '文字以内で指定してください');
  }
  return text;
}
