// 月別の画面：月の合計、カテゴリ別・支払方法別の合計、一覧。
// 家計データは端末に保存しない。表示のたびに GAS から取得し、メモリにだけ持つ。

import { ApiError, callApi } from './api.js';

const yen = new Intl.NumberFormat('ja-JP');
const weekdayFormat = new Intl.DateTimeFormat('ja-JP', { weekday: 'short' });

/** 年と月から "YYYY-MM" を作る。 */
export function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** key（category / payment）ごとの合計を、金額の大きい順に返す。空の値は emptyLabel にまとめる。 */
export function summarize(records, key, emptyLabel) {
  const totals = new Map();
  records.forEach((r) => {
    const label = r[key] || emptyLabel;
    totals.set(label, (totals.get(label) || 0) + r.amount);
  });
  return [...totals.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** 日付ごとにまとめる。records は日付の新しい順に並んでいる前提（GAS の list の並び）。 */
export function groupByDate(records) {
  const groups = [];
  records.forEach((r) => {
    let group = groups[groups.length - 1];
    if (!group || group.date !== r.date) {
      group = { date: r.date, total: 0, records: [] };
      groups.push(group);
    }
    group.total += r.amount;
    group.records.push(r);
  });
  return groups;
}

function dayLabel(date) {
  const [y, m, d] = date.split('-').map(Number);
  return `${m}月${d}日（${weekdayFormat.format(new Date(y, m - 1, d))}）`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** 横棒の一覧。棒は1色で、金額と割合は文字で示す（色だけに頼らない）。 */
function renderBars(list, items, total) {
  const max = Math.max(0, ...items.map((i) => i.amount));
  list.replaceChildren(
    ...items.map((item) => {
      const li = el('li', 'bar-item');
      const head = el('div', 'bar-head');
      const percent = total > 0 ? `（${Math.round((item.amount / total) * 100)}%）` : '';
      head.append(el('span', 'bar-label', item.label), el('span', 'bar-value', `${yen.format(item.amount)}円${percent}`));
      const track = el('div', 'bar-track');
      track.setAttribute('aria-hidden', 'true');
      const bar = el('div', 'bar');
      bar.style.width = max > 0 && item.amount > 0 ? `${(item.amount / max) * 100}%` : '0';
      track.append(bar);
      li.append(head, track);
      return li;
    })
  );
}

/**
 * 月別の画面を初期化する。onSelect(record) は一覧の行が押されたときに呼ばれる。
 */
export function createMonthlyView({ onSelect }) {
  const label = document.getElementById('month-label');
  const prevButton = document.getElementById('month-prev');
  const nextButton = document.getElementById('month-next');
  const status = document.getElementById('monthly-status');
  const retryButton = document.getElementById('monthly-retry');
  const content = document.getElementById('monthly-content');
  const totalEl = document.getElementById('month-total');
  const countEl = document.getElementById('month-count');
  const categoryList = document.getElementById('summary-category');
  const paymentList = document.getElementById('summary-payment');
  const recordList = document.getElementById('monthly-list');

  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  let requestId = 0; // 月を素早く切り替えたとき、古い応答で上書きしないため

  function setStatus(message, kind) {
    status.textContent = message;
    status.dataset.kind = kind || '';
  }

  function render(records) {
    const total = records.reduce((sum, r) => sum + r.amount, 0);
    totalEl.textContent = `${yen.format(total)}円`;
    countEl.textContent = `${records.length}件`;
    renderBars(categoryList, summarize(records, 'category', '未分類'), total);
    renderBars(paymentList, summarize(records, 'payment', '未設定'), total);

    if (records.length === 0) {
      recordList.replaceChildren(el('p', 'hint', 'この月の記録はありません'));
    } else {
      recordList.replaceChildren(
        ...groupByDate(records).map((group) => {
          const section = el('section', 'day');
          const head = el('h4', 'day-head');
          head.append(el('span', '', dayLabel(group.date)), el('span', 'day-total', `${yen.format(group.total)}円`));
          const ul = el('ul', 'records');
          group.records.forEach((r) => {
            const button = el('button', 'record');
            button.type = 'button';
            const main = el('span', 'record-main');
            main.append(el('span', 'record-title', r.store || r.category || '（店名なし）'));
            const meta = [r.category, r.payment, r.source === 'receipt' ? 'レシート' : ''].filter(Boolean).join('・');
            main.append(el('span', 'record-meta', meta));
            button.append(main, el('span', 'record-amount', `${yen.format(r.amount)}円`));
            button.addEventListener('click', () => onSelect(r));
            const li = el('li');
            li.append(button);
            ul.append(li);
          });
          section.append(head, ul);
          return section;
        })
      );
    }
    content.hidden = false;
  }

  /** 表示中の月を読み込む。message を渡すと、読み込み後にそれを表示する（保存・削除の結果など）。 */
  async function load(message) {
    const id = ++requestId;
    label.textContent = `${year}年${month}月`;
    content.hidden = true;
    retryButton.hidden = true;
    setStatus('読み込んでいます…', 'busy');
    try {
      const { records } = await callApi('list', { month: monthKey(year, month) });
      if (id !== requestId) return;
      render(records);
      setStatus(message || '', message ? 'success' : '');
    } catch (err) {
      if (id !== requestId) return;
      setStatus(err instanceof ApiError ? err.message : '読み込みに失敗しました', 'error');
      retryButton.hidden = false;
    }
  }

  function moveMonth(delta) {
    const d = new Date(year, month - 1 + delta, 1);
    year = d.getFullYear();
    month = d.getMonth() + 1;
    load();
  }

  prevButton.addEventListener('click', () => moveMonth(-1));
  nextButton.addEventListener('click', () => moveMonth(1));
  retryButton.addEventListener('click', () => load());

  return { load };
}
