/**
 * action "readReceipt" の処理。レシート画像を Gemini で読み取り、確認画面に入れる値を返す。
 * シートには書き込まない（保存は確認・修正のあとに action "add" で行う）。
 */

// 選択肢は docs/js/options.js と同じにする。
const RECEIPT_CATEGORIES = [
  '食費',
  '外食',
  '日用品',
  '交通',
  '衣服・美容',
  '医療',
  '趣味・娯楽',
  '通信',
  '住居・光熱',
  'その他',
];
const RECEIPT_PAYMENTS = ['現金', 'クレジットカード', '電子マネー', 'QRコード決済', '口座振替・振込'];

// 画面側で長い辺 2000px の JPEG にしてから送るので、通常は 1MB を大きく下回る（推定）。
const MAX_IMAGE_BASE64_LENGTH = 5 * 1024 * 1024;
const MAX_RECEIPT_ITEMS = 100;

// 指示文は notes/phase0.md のものに、category の行を足したもの。
const RECEIPT_PROMPT = [
  'あなたは日本のレシートを読み取るアシスタントです。',
  '添付のレシート画像から次の項目を読み取り、JSON だけを出力してください。説明文やコードブロックの記号（```）は付けないでください。',
  '',
  '- date: 支払日。YYYY-MM-DD 形式。和暦は西暦に直す。読めなければ null',
  '- store: 店名。支店名があれば含める。読めなければ null',
  '- total: レシートの「合計」欄の税込金額（円、整数）。お預かり・お釣りの金額ではない。読めなければ null',
  '- items: 明細の配列。各要素は {"name": 商品名, "price": 金額（円、整数）}。値引きの行は price を負の数にする。読めなければ空の配列',
  '- payment: 支払方法。次のどれか1つ：' + RECEIPT_PAYMENTS.join('、') + '。判断できなければ null',
  '- category: 支出のカテゴリ。次のどれか1つ：' +
    RECEIPT_CATEGORIES.join('、') +
    '。食料品の購入は食費、飲食店での食事は外食とする。判断できなければ null',
  '',
  '推測で値を作らないでください。読めない項目、写っていない項目は null にしてください。',
  'カード番号、会員番号、氏名などの個人情報は出力しないでください。',
].join('\n');

const RECEIPT_SCHEMA = {
  type: 'object',
  properties: {
    date: { type: ['string', 'null'], description: '支払日 YYYY-MM-DD' },
    store: { type: ['string', 'null'] },
    total: { type: ['integer', 'null'], description: '合計（税込、円）' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, price: { type: 'integer' } },
        required: ['name', 'price'],
      },
    },
    payment: { anyOf: [{ type: 'string', enum: RECEIPT_PAYMENTS }, { type: 'null' }] },
    category: { anyOf: [{ type: 'string', enum: RECEIPT_CATEGORIES }, { type: 'null' }] },
  },
  required: ['date', 'store', 'total', 'items', 'payment', 'category'],
};

/**
 * data: { image: JPEG の base64（data: URL の接頭辞なし） }
 * 戻り値: { date, store, amount, category, payment, items[{name, price}] }
 *   読み取れなかった項目は null（items は空の配列）。
 */
function readReceipt(data) {
  const image = data.image;
  if (typeof image !== 'string' || image === '') {
    throw new ClientError('画像がありません');
  }
  if (image.length > MAX_IMAGE_BASE64_LENGTH) {
    throw new ClientError('画像が大きすぎます');
  }
  // JPEG のファイルは FF D8 FF で始まり、base64 では "/9j/" になる。
  if (image.indexOf('/9j/') !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) {
    throw new ClientError('JPEG 画像を送ってください');
  }

  const raw = generateJson(image, RECEIPT_PROMPT, RECEIPT_SCHEMA);
  if (!raw) {
    throw new ClientError('レシートを読み取れませんでした。手で入力してください');
  }
  return normalizeReceipt(raw);
}

/** Gemini の出力を、確認画面に入れてよい値だけに整える。条件に合わない値は null にする。 */
function normalizeReceipt(raw) {
  return {
    date: isValidDate(raw.date) ? raw.date : null,
    store: textOrNull(raw.store),
    amount: isReceiptAmount(raw.total) ? raw.total : null,
    category: RECEIPT_CATEGORIES.indexOf(raw.category) !== -1 ? raw.category : null,
    payment: RECEIPT_PAYMENTS.indexOf(raw.payment) !== -1 ? raw.payment : null,
    items: normalizeItems(raw.items),
  };
}

/** 手動入力と同じ条件（1円以上、1億円以下の整数）。 */
function isReceiptAmount(value) {
  return Number.isInteger(value) && value > 0 && value <= MAX_ABS_AMOUNT;
}

function textOrNull(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.trim().slice(0, MAX_TEXT_LENGTH);
  return text === '' ? null : text;
}

/** 明細は確認画面に参考として表示するだけで、保存しない。 */
function normalizeItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      name: textOrNull(item.name),
      price: Number.isInteger(item.price) && Math.abs(item.price) <= MAX_ABS_AMOUNT ? item.price : null,
    }))
    .filter((item) => item.name !== null && item.price !== null)
    .slice(0, MAX_RECEIPT_ITEMS);
}
