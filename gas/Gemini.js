/**
 * Gemini API（generateContent）の呼び出し。
 *
 * 仕様：https://ai.google.dev/api/generate-content
 * API キーとモデル名はスクリプトプロパティ（GEMINI_API_KEY、GEMINI_MODEL）から読む。
 * 画像・API キー・応答の中身（レシートの内容）はログに残さない。
 */

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';
const GEMINI_RETRY_WAIT_MS = 2000;

/** 一時的なエラーとして、1回だけやり直す HTTP の状態コード。 */
const GEMINI_RETRYABLE_CODES = [500, 503, 504];

/**
 * 画像（JPEG の base64）と指示文を送り、応答の JSON をオブジェクトで返す。
 * 応答に読み取り結果がない、または JSON として読めない場合は null を返す。
 */
function generateJson(imageBase64, prompt, schema) {
  const apiKey = getRequiredProperty('GEMINI_API_KEY');
  const model = getGeminiModel();

  const request = {
    contents: [
      {
        role: 'user',
        parts: [{ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }, { text: prompt }],
      },
    ],
    generationConfig: {
      responseFormat: { text: { mimeType: 'APPLICATION_JSON', schema: schema } },
    },
  };
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': apiKey },
    payload: JSON.stringify(request),
    muteHttpExceptions: true,
  };
  const url = GEMINI_ENDPOINT + model + ':generateContent';

  let res = UrlFetchApp.fetch(url, options);
  if (GEMINI_RETRYABLE_CODES.indexOf(res.getResponseCode()) !== -1) {
    Utilities.sleep(GEMINI_RETRY_WAIT_MS);
    res = UrlFetchApp.fetch(url, options);
  }

  const code = res.getResponseCode();
  if (code !== 200) {
    throw geminiHttpError(code, res.getContentText());
  }
  return parseGeminiResponse(res.getContentText());
}

/**
 * 設定の確認用。GAS のエディタから実行する（初回は外部への通信の権限を承認する）。
 * モデルの情報を取得するだけで、画像は送らない（https://ai.google.dev/api/models ）。
 */
function checkGeminiSetup() {
  const apiKey = getRequiredProperty('GEMINI_API_KEY');
  const model = getGeminiModel();
  const res = UrlFetchApp.fetch(GEMINI_ENDPOINT + model, {
    headers: { 'x-goog-api-key': apiKey },
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code !== 200) {
    throw geminiHttpError(code, res.getContentText());
  }
  console.log('OK：モデル ' + model + ' を使えます');
}

/** スクリプトプロパティのモデル名。URL の一部になるため、想定外の文字を含む値は使わない。 */
function getGeminiModel() {
  const model = getRequiredProperty('GEMINI_MODEL');
  if (!/^[a-z0-9.-]+$/.test(model)) {
    throw new Error('スクリプトプロパティ GEMINI_MODEL の値が不正です');
  }
  return model;
}

/** 状態コードに応じた、利用者向けのエラーを作る。 */
function geminiHttpError(code, bodyText) {
  // エラーの応答にはレシートの内容は含まれない想定なので、原因の調査用に種類と説明だけを残す。
  const info = parseGeminiError(bodyText);
  console.error('Gemini API: HTTP ' + code + ' ' + info.status + ' ' + info.message);

  if (code === 429) {
    return new ClientError(
      'Gemini の読み取り回数の上限に達した可能性があります。1分ほど待ってから試してください。' +
        '1日の上限の場合は、日本時間の16時（夏時間の期間）または17時に回復します'
    );
  }
  if (code === 401 || code === 403) {
    return new ClientError('Gemini の API キーの設定を確認してください（スクリプトプロパティ GEMINI_API_KEY）');
  }
  if (code === 404) {
    return new ClientError('Gemini のモデルが見つかりません。スクリプトプロパティ GEMINI_MODEL を確認してください');
  }
  if (GEMINI_RETRYABLE_CODES.indexOf(code) !== -1) {
    return new ClientError('Gemini が一時的に使えません。しばらくしてから試してください');
  }
  return new ClientError(
    'Gemini の呼び出しに失敗しました（HTTP ' + code + (info.status ? ' ' + info.status : '') + '）'
  );
}

/** エラーの応答から、種類（status）と説明（message）を取り出す。 */
function parseGeminiError(bodyText) {
  try {
    const error = JSON.parse(bodyText).error || {};
    return {
      status: typeof error.status === 'string' ? error.status : '',
      // 説明に送った値が引用される場合に備え、base64 のような長い英数字の並びは伏せる。
      message:
        typeof error.message === 'string'
          ? error.message.replace(/[A-Za-z0-9+/=_-]{40,}/g, '…').slice(0, 300)
          : '',
    };
  } catch (_) {
    return { status: '', message: '' };
  }
}

/** 成功時の応答から、モデルが出力した JSON を取り出す。 */
function parseGeminiResponse(bodyText) {
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch (_) {
    console.error('Gemini API: 応答が JSON ではありません');
    return null;
  }
  if (body.promptFeedback && body.promptFeedback.blockReason) {
    console.error('Gemini API: 入力が止められました blockReason=' + body.promptFeedback.blockReason);
    return null;
  }
  const candidate = body.candidates && body.candidates[0];
  if (!candidate) {
    console.error('Gemini API: 候補がありません');
    return null;
  }
  if (candidate.finishReason && candidate.finishReason !== 'STOP') {
    console.error('Gemini API: finishReason=' + candidate.finishReason);
    return null;
  }
  const parts = (candidate.content && candidate.content.parts) || [];
  const text = parts
    .filter((p) => typeof p.text === 'string' && !p.thought)
    .map((p) => p.text)
    .join('');
  return parseJsonText(text);
}

/** JSON 文字列をオブジェクトにする。前後のコードブロックの記号（```）は取り除く。 */
function parseJsonText(text) {
  const trimmed = String(text)
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    const value = JSON.parse(trimmed);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value;
    }
  } catch (_) {
    // 下でまとめて扱う
  }
  console.error('Gemini API: 出力が JSON のオブジェクトではありません');
  return null;
}
