// 画面の切り替えと初期化。

import { ApiError, callApi } from './api.js';
import { createEntryForm } from './form.js';
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

function setupEntry() {
  createEntryForm(document.getElementById('entry-form'), {
    statusEl: document.getElementById('entry-status'),
    async onSubmit(values) {
      const { record } = await callApi('add', Object.assign({ source: 'manual' }, values));
      const store = record.store ? ` ${record.store}` : '';
      return `保存しました：${record.date}${store} ${yen.format(record.amount)}円`;
    },
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

function setupCamera() {
  const input = document.getElementById('camera-input');
  const preview = document.getElementById('camera-preview');
  const status = document.getElementById('camera-status');
  let objectUrl = null;

  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    if (!file) {
      preview.hidden = true;
      setStatus(status, '画像が選ばれませんでした', 'error');
      return;
    }
    objectUrl = URL.createObjectURL(file);
    preview.src = objectUrl;
    preview.hidden = false;
    const kb = Math.round(file.size / 1024);
    setStatus(status, `読み込めました（${file.type || '形式不明'}、${yen.format(kb)} KB）`, 'success');
  });
}

function init() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => showView(tab.dataset.view));
  });
  setupEntry();
  setupSettings();
  setupCamera();

  if (isConfigured()) {
    showView('entry');
  } else {
    document.getElementById('settings-notice').hidden = false;
    showView('settings');
  }
}

init();
