// Ray's GTP calls block until search completes. Run them away from the UI.
'use strict';

let output = [];
let ready = false;
let failed = false;
const seconds = Number(new URL(self.location.href).searchParams.get('seconds') || 1);

function fatal(reason) {
  if (failed) return;
  failed = true;
  self.postMessage({ type: 'fatal', error: String(reason) });
}

var Module = {
  arguments: ['--const-time', String(seconds), '--tree-size', '4096'],
  print: line => output.push(String(line)),
  printErr: () => {},
  setStatus: text => { if (text) self.postMessage({ type: 'status', text }); },
  onAbort: fatal,
};

self.addEventListener('unhandledrejection', event => {
  event.preventDefault();
  fatal(event.reason);
});

self.onmessage = ({ data }) => {
  const { id, commands } = data;
  const results = [];
  try {
    if (!ready || failed) throw new Error('エンジンの準備ができていません。');
    for (const command of commands) {
      output = [];
      Module.GTP_exec(command);
      const response = output.join('\n').trim();
      if (!response.startsWith('=')) throw new Error(command + ': ' + response);
      results.push(response.slice(1).trim());
    }
    self.postMessage({ type: 'response', id, results });
  } catch (error) {
    self.postMessage({ type: 'response', id, error: String(error.message || error) });
  }
};

try {
  if (![1, 3, 5, 10].includes(seconds)) throw new Error('思考時間の設定が不正です。');
  importScripts('ray.js');
  Module.ready.then(() => {
    ready = true;
    self.postMessage({ type: 'ready' });
  }).catch(fatal);
} catch (error) {
  fatal(error);
}
