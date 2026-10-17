// カテゴリ別の分割：1回の支払いを、カテゴリごとの行に分けて保存する。
// シートの列は変えず、分けた行は日付・店名・支払方法・登録日時が同じ別々の行になる。

import { CATEGORIES } from './options.js';

export const MAX_SPLITS = CATEGORIES.length;

/**
 * 明細をカテゴリごとに合計し、合計金額（total）を金額の比率で配分する。端数は一番大きいカテゴリに入れる。
 * カテゴリが分からない明細は fallbackCategory（なければ「その他」）に入れる。
 * 値引きだけのカテゴリなど、合計が0円以下になったものは一番大きいカテゴリにまとめる。
 * 2つ以上のカテゴリに分けられないときは [] を返す。
 */
export function allocateSplits(items, total, fallbackCategory) {
  if (!Number.isInteger(total) || total <= 0 || !Array.isArray(items)) return [];
  const fallback = CATEGORIES.includes(fallbackCategory) ? fallbackCategory : 'その他';
  const sums = new Map();
  items.forEach((item) => {
    if (!item || !Number.isInteger(item.price)) return;
    const category = CATEGORIES.includes(item.category) ? item.category : fallback;
    sums.set(category, (sums.get(category) || 0) + item.price);
  });

  const byAmount = (a, b) => b.sum - a.sum;
  const groups = [...sums].map(([category, sum]) => ({ category, sum })).sort(byAmount);
  const positive = groups.filter((g) => g.sum > 0);
  if (positive.length < 2) return [];
  positive[0].sum += groups.filter((g) => g.sum <= 0).reduce((s, g) => s + g.sum, 0);
  positive.sort(byAmount);
  const kept = positive.filter((g) => g.sum > 0);
  const base = kept.reduce((s, g) => s + g.sum, 0);
  if (kept.length < 2 || base <= 0) return [];

  const splits = kept.map((g) => ({ category: g.category, amount: Math.floor((total / base) * g.sum) }));
  splits[0].amount += total - splits.reduce((s, x) => s + x.amount, 0);
  const result = splits.filter((x) => x.amount > 0);
  return result.length >= 2 ? result : [];
}

/**
 * 分割の編集欄。normalize は金額の文字列を整える関数（form.js の normalizeAmount）。
 * getTotal() は合計金額（数値、未入力なら NaN）を返す。
 */
export function createSplitEditor({ normalize, getTotal, onChange = () => {} }) {
  const toggle = document.getElementById('split-on');
  const editor = document.getElementById('split-editor');
  const list = document.getElementById('split-rows');
  const addButton = document.getElementById('split-add');
  const offButton = document.getElementById('split-off');
  const diff = document.getElementById('split-diff');
  const yen = new Intl.NumberFormat('ja-JP');
  let active = false;
  let allowed = true;

  function rows() {
    return [...list.querySelectorAll('.split-row')];
  }

  function makeRow(category, amount) {
    const li = document.createElement('li');
    li.className = 'split-row';
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'カテゴリ');
    CATEGORIES.forEach((c) => select.append(new Option(c, c)));
    if (category && !CATEGORIES.includes(category)) select.append(new Option(category, category));
    select.value = category || CATEGORIES[0];
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.setAttribute('aria-label', '金額（円）');
    input.placeholder = '0';
    input.value = amount === undefined || amount === null ? '' : String(amount);
    input.addEventListener('input', update);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'split-remove';
    remove.textContent = '×';
    remove.setAttribute('aria-label', 'この行を削除');
    remove.addEventListener('click', () => {
      li.remove();
      update();
    });
    li.append(select, input, remove);
    return li;
  }

  /** 差額の表示と、ボタンの有効・無効を更新する。 */
  function update() {
    const count = rows().length;
    rows().forEach((li) => {
      li.querySelector('.split-remove').disabled = count <= 2;
    });
    addButton.disabled = count >= MAX_SPLITS;
    const total = getTotal();
    const sum = rows().reduce((s, li) => s + (Number(normalize(li.querySelector('input').value)) || 0), 0);
    if (!Number.isFinite(total)) {
      diff.textContent = `分けた金額の合計：${yen.format(sum)}円`;
      diff.dataset.kind = '';
    } else if (sum === total) {
      diff.textContent = '分けた金額の合計が、合計金額と一致しています';
      diff.dataset.kind = 'success';
    } else {
      const rest = total - sum;
      diff.textContent = `合計金額まで あと ${rest > 0 ? '' : '−'}${yen.format(Math.abs(rest))}円${rest > 0 ? '' : '（多すぎます）'}`;
      diff.dataset.kind = 'error';
    }
    onChange();
  }

  function setActive(on) {
    active = on;
    editor.hidden = !on;
    toggle.hidden = on || !allowed;
    if (!on) list.replaceChildren();
    onChange();
  }

  /** 分けた行を設定して、分割を有効にする。 */
  function set(splits) {
    list.replaceChildren(...splits.map((s) => makeRow(s.category, s.amount)));
    setActive(true);
    update();
  }

  toggle.addEventListener('click', () => {
    const total = getTotal();
    set([
      { category: CATEGORIES[0], amount: Number.isFinite(total) && total > 0 ? total : '' },
      { category: CATEGORIES[1], amount: '' },
    ]);
    list.querySelector('.split-row:last-child input').focus();
  });
  addButton.addEventListener('click', () => {
    list.append(makeRow(CATEGORIES.find((c) => !rows().some((li) => li.querySelector('select').value === c)), ''));
    update();
  });
  offButton.addEventListener('click', () => setActive(false));

  return {
    isActive: () => active,
    set,
    update,
    reset: () => setActive(false),
    /** 修正中など、分割を使わせないときは false にする。 */
    setAllowed(value) {
      allowed = value;
      if (!value) setActive(false);
      toggle.hidden = active || !allowed;
    },
    /** 入力値を検査し、{ splits } か { error } を返す。 */
    read(total) {
      const splits = rows().map((li) => ({
        category: li.querySelector('select').value,
        amount: normalize(li.querySelector('input').value),
      }));
      if (splits.some((s) => !/^\d+$/.test(s.amount) || Number(s.amount) <= 0)) {
        return { error: '分けた金額は、すべて1円以上の整数で入力してください' };
      }
      if (new Set(splits.map((s) => s.category)).size !== splits.length) {
        return { error: '同じカテゴリの行が2つあります。1つにまとめてください' };
      }
      const sum = splits.reduce((s, x) => s + Number(x.amount), 0);
      if (sum !== total) {
        return { error: '分けた金額の合計が、合計金額と一致していません' };
      }
      return { splits: splits.map((s) => ({ category: s.category, amount: Number(s.amount) })) };
    },
  };
}
