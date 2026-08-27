// sandbox.js — принимает модель и PCM от content-скрипта, возвращает
// распознанные слова с таймкодами (start/end в секундах аудиопотока).
//
// Протокол:
//   init  {model: ArrayBuffer}      — загрузить модель (заранее, без жеста)
//   start {sampleRate}              — создать распознаватель
//   audio {pcm: ArrayBuffer}        — кусок mono Float32
//
// Диагностика: все стадии и любые ошибки пробрасываются наружу
// сообщениями {type:'log'|'model-error'}, чтобы их было видно
// в консоли вкладки YouTube, а не только в консоли iframe.

(function () {
  'use strict';

  let model = null;
  let recognizer = null;
  let sampleRate = 48000;

  function post(msg) {
    window.parent.postMessage(Object.assign({ source: 'bleep-sandbox' }, msg), '*');
  }
  function log(text) {
    console.log('[Бип·sandbox]', text);
    post({ type: 'log', text: text });
  }

  // Любая непойманная ошибка в песочнице → наружу
  window.addEventListener('error', (e) => {
    post({
      type: 'log',
      text: 'window.onerror: ' + e.message + ' @ ' + (e.filename || '') + ':' + (e.lineno || ''),
    });
  });
  window.addEventListener('unhandledrejection', (e) => {
    post({ type: 'log', text: 'unhandledrejection: ' + String(e.reason) });
  });

  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error(label + ': таймаут ' + ms / 1000 + ' с')), ms),
      ),
    ]);
  }

  // План А: blob-URL (быстро, без копий). План Б: data:-URL — работает из
  // любого origin, если fetch blob:null/... внутри воркера окажется запрещён.
  async function createModelRobust(buf) {
    const blob = new Blob([buf], { type: 'application/gzip' });

    try {
      const blobUrl = URL.createObjectURL(blob);
      log('createModel через blob-URL (распаковка + WASM, 10–60 с)...');
      return await withTimeout(Vosk.createModel(blobUrl), 90000, 'blob-URL');
    } catch (e) {
      log('blob-URL не сработал: ' + e + ' — пробую data:-URL (base64, будет медленнее)...');
    }

    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('FileReader failed'));
      r.readAsDataURL(blob);
    });
    log('createModel через data:-URL...');
    return await withTimeout(Vosk.createModel(dataUrl), 180000, 'data-URL');
  }

  window.addEventListener('message', async (e) => {
    const msg = e.data;
    if (!msg || msg.target !== 'bleep-sandbox') return;

    if (msg.type === 'init') {
      try {
        if (typeof Vosk === 'undefined') {
          throw new Error(
            'lib/vosk.js не загрузился (Vosk is undefined) — смотрите консоль фрейма sandbox.html',
          );
        }
        log('модель получена: ' + (msg.model.byteLength / 1048576).toFixed(1) + ' МБ');
        const t0 = performance.now();
        model = await createModelRobust(msg.model);
        log('модель готова за ' + ((performance.now() - t0) / 1000).toFixed(1) + ' с');
        post({ type: 'model-ready' });
      } catch (err) {
        post({ type: 'model-error', error: String((err && err.stack) || err) });
      }
      return;
    }

    if (msg.type === 'start' && model && !recognizer) {
      sampleRate = msg.sampleRate || 48000;
      recognizer = new model.KaldiRecognizer(sampleRate);
      recognizer.setWords(true);

      recognizer.on('result', (m) => {
        const r = (m && m.result) || {};
        post({ type: 'result', text: r.text || '', words: r.result || [] });
      });
      post({ type: 'recognizer-ready' });
      return;
    }

    if (msg.type === 'stop' && recognizer) {
      recognizer = null;
      return;
    }

    if (msg.type === 'audio' && recognizer) {
      recognizer.acceptWaveformFloat(new Float32Array(msg.pcm), sampleRate);
    }
  });

  log('песочница загружена, Vosk ' + (typeof Vosk === 'undefined' ? 'НЕ найден' : 'найден'));
  post({ type: 'ready' });
})();
