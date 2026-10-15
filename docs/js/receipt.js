// レシート画像の読み込み・縮小・塗りつぶし・JPEG への変換。
// - 先に縮小してから canvas に描く。iOS では大きすぎる canvas を使えないという報告があるため。
// - 送るのは canvas から作り直した JPEG だけで、元のファイル（位置情報などを含みうる）は送らない。
// - 塗りつぶしは不透明の単色にする。ぼかしは元に戻せる場合があるため使わない。

export const MAX_EDGE = 2000;
export const JPEG_QUALITY = 0.85;
const MASK_COLOR = '#000000';
// 誤ってタップしただけで小さな四角ができないようにする（画像の画素単位）。
const MIN_MASK_SIZE = 8;

/** 長い辺を maxEdge 以下にした大きさを返す（拡大はしない）。 */
export function fitSize(width, height, maxEdge = MAX_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * 画像ファイルを読み込む。
 * img 要素で読み込むのは、canvas に描くときに撮影時の向きの情報が反映されるようにするため
 * （Safari では ImageBitmap だと反映されないという不具合の報告があった）。
 */
export async function loadImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 隠す範囲を指でなぞって指定する編集画面。onChange は塗りつぶしの数が変わるたびに呼ばれる。 */
export function createMaskEditor(canvas, { onChange = () => {} } = {}) {
  const ctx = canvas.getContext('2d');
  const base = document.createElement('canvas'); // 縮小しただけの画像（塗りつぶし前）
  let masks = []; // { x, y, w, h }（canvas の画素単位）
  let drag = null; // { id, x0, y0, x1, y1 }

  function rectOf(d) {
    return {
      x: Math.min(d.x0, d.x1),
      y: Math.min(d.y0, d.y1),
      w: Math.abs(d.x1 - d.x0),
      h: Math.abs(d.y1 - d.y0),
    };
  }

  function render() {
    ctx.drawImage(base, 0, 0);
    ctx.fillStyle = MASK_COLOR;
    const rects = drag ? masks.concat(rectOf(drag)) : masks;
    rects.forEach((r) => ctx.fillRect(r.x, r.y, r.w, r.h));
  }

  /** 画面上の位置を、canvas の画素の位置に直す。 */
  function toCanvasPoint(event) {
    const box = canvas.getBoundingClientRect();
    const clamp = (v, max) => Math.min(max, Math.max(0, v));
    return {
      x: clamp(((event.clientX - box.left) * canvas.width) / box.width, canvas.width),
      y: clamp(((event.clientY - box.top) * canvas.height) / box.height, canvas.height),
    };
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (drag || !base.width) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    const p = toCanvasPoint(event);
    drag = { id: event.pointerId, x0: p.x, y0: p.y, x1: p.x, y1: p.y };
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const p = toCanvasPoint(event);
    drag.x1 = p.x;
    drag.y1 = p.y;
    render();
  });

  canvas.addEventListener('pointerup', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const r = rectOf(drag);
    drag = null;
    if (r.w >= MIN_MASK_SIZE && r.h >= MIN_MASK_SIZE) {
      masks.push(r);
      onChange(masks.length);
    }
    render();
  });

  canvas.addEventListener('pointercancel', () => {
    drag = null;
    render();
  });

  return {
    /** 画像を縮小して描き、塗りつぶしを消す。 */
    load(img) {
      const size = fitSize(img.naturalWidth, img.naturalHeight);
      [base, canvas].forEach((c) => {
        c.width = size.width;
        c.height = size.height;
      });
      const baseCtx = base.getContext('2d');
      baseCtx.imageSmoothingEnabled = true;
      baseCtx.imageSmoothingQuality = 'high';
      baseCtx.drawImage(img, 0, 0, size.width, size.height);
      masks = [];
      drag = null;
      render();
      onChange(0);
    },
    undo() {
      masks.pop();
      render();
      onChange(masks.length);
    },
    clearMasks() {
      masks = [];
      render();
      onChange(0);
    },
    /** 塗りつぶし後の画像を JPEG の base64（data: URL の接頭辞なし）で返す。 */
    toJpegBase64() {
      drag = null;
      render();
      const prefix = 'data:image/jpeg;base64,';
      const url = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
      if (!url.startsWith(prefix)) {
        throw new Error('JPEG に変換できませんでした');
      }
      return url.slice(prefix.length);
    },
    /** 画像を手放す（メモリを空ける）。 */
    release() {
      [base, canvas].forEach((c) => {
        c.width = 0;
        c.height = 0;
      });
      masks = [];
      drag = null;
    },
  };
}
