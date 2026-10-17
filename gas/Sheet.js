/**
 * スプレッドシート（シート名 transactions）の読み書き。
 * スプレッドシートIDはスクリプトプロパティ SPREADSHEET_ID から読む。
 */

const SHEET_NAME = 'transactions';
const COLUMNS = [
  'id',
  'date',
  'store',
  'category',
  'amount',
  'payment',
  'memo',
  'source',
  'created_at',
];
// 修正できる列。COLUMNS の中で連続している必要がある（まとめて書き換えるため）。
const EDITABLE_COLUMNS = ['date', 'store', 'category', 'amount', 'payment', 'memo'];

/**
 * 初回に1度だけ、エディタから手動で実行する。
 * transactions シートと見出し行を作り、amount 以外の列を書式なしテキストにする
 * （"2026-10-13" などの文字列が日付型に変換されないようにするため）。
 */
function setupSheet() {
  const ss = openSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() > 0) {
    checkHeader(sheet);
    console.log('transactions シートは設定済みです');
    return;
  }
  COLUMNS.forEach((name, i) => {
    if (name !== 'amount') {
      sheet.getRange(1, i + 1, sheet.getMaxRows(), 1).setNumberFormat('@');
    }
  });
  sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
  sheet.setFrozenRows(1);
  console.log('transactions シートを作成しました');
}

function openSpreadsheet() {
  return SpreadsheetApp.openById(getRequiredProperty('SPREADSHEET_ID'));
}

/** 見出し行を確認したうえで transactions シートを返す。 */
function getTransactionsSheet() {
  const sheet = openSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet || sheet.getLastRow() === 0) {
    throw new Error('transactions シートがありません。setupSheet を実行してください');
  }
  checkHeader(sheet);
  return sheet;
}

function checkHeader(sheet) {
  const header = sheet.getRange(1, 1, 1, COLUMNS.length).getValues()[0];
  if (header.join(',') !== COLUMNS.join(',')) {
    throw new Error('transactions シートの見出し行が想定と異なります');
  }
}

/** 1行追記する。record は COLUMNS のキーを持つオブジェクト。 */
function appendRecord(record) {
  appendRecords([record]);
}

/** 複数行を、1回のロックの中で続けて追記する。 */
function appendRecords(records) {
  const rows = records.map((record) => COLUMNS.map((name) => toCellValue(record[name])));
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getTransactionsSheet();
    rows.forEach((row) => sheet.appendRow(row));
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}

/**
 * id の行の、修正できる列（date〜memo）を書き換え、書き換え後の1行を返す。
 * 見つからなければ null を返す。id・source・created_at の列には触れない。
 */
function updateRecord(id, fields) {
  const first = COLUMNS.indexOf(EDITABLE_COLUMNS[0]);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getTransactionsSheet();
    const row = findRowById(sheet, id);
    if (!row) {
      return null;
    }
    const values = EDITABLE_COLUMNS.map((name) => toCellValue(fields[name]));
    sheet.getRange(row, first + 1, 1, values.length).setValues([values]);
    SpreadsheetApp.flush();
    return readRow(sheet, row);
  } finally {
    lock.releaseLock();
  }
}

/** id の行を削除する。見つからなければ false を返す。 */
function deleteRecord(id) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getTransactionsSheet();
    const row = findRowById(sheet, id);
    if (!row) {
      return false;
    }
    sheet.deleteRow(row);
    SpreadsheetApp.flush();
    return true;
  } finally {
    lock.releaseLock();
  }
}

/** id の列から行を探し、行番号（2以上）を返す。見つからなければ 0。ロックの中で呼ぶ。 */
function findRowById(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return 0;
  }
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) {
      return i + 2;
    }
  }
  return 0;
}

function readRow(sheet, row) {
  const timeZone = sheet.getParent().getSpreadsheetTimeZone();
  return toRecord(sheet.getRange(row, 1, 1, COLUMNS.length).getValues()[0], timeZone);
}

function toRecord(row, timeZone) {
  const record = {};
  COLUMNS.forEach((name, i) => {
    record[name] = fromCellValue(name, row[i], timeZone);
  });
  return record;
}

/** 見出し行を除く全行を、COLUMNS のキーを持つオブジェクトの配列で返す。 */
function readRecords() {
  const sheet = getTransactionsSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }
  const timeZone = sheet.getParent().getSpreadsheetTimeZone();
  const values = sheet.getRange(2, 1, lastRow - 1, COLUMNS.length).getValues();
  return values.map((row) => toRecord(row, timeZone));
}

/**
 * setValue(s) は "=" で始まる値を数式として解釈するため（appendRow も同様と想定）、
 * 先頭が数式になりうる記号の文字列は ' を前置して文字列として保存する。
 */
function toCellValue(value) {
  if (typeof value === 'string' && /^[=+\-@]/.test(value)) {
    return "'" + value;
  }
  return value;
}

function fromCellValue(name, value, timeZone) {
  if (name === 'amount') {
    return Number(value);
  }
  // 書式なしテキストにしていても、手で編集した場合などに日付型で返ってくることがある。
  if (value instanceof Date) {
    return name === 'date'
      ? Utilities.formatDate(value, timeZone, 'yyyy-MM-dd')
      : value.toISOString();
  }
  return String(value);
}
