'use strict';

(() => {
  const $ = id => document.getElementById(id);
  const columns = 'ABCDEFGHJKLMNOPQRST';
  const board = new WGo.Board($('board'), {
    size: 9,
    width: $('board').clientWidth,
    background: '#dfb56f',
    stoneHandler: WGo.Board.drawHandlers.SHELL,
    section: { top: -0.5, right: -0.5, bottom: -0.5, left: -0.5 },
  });
  board.addCustomObject(WGo.Board.coordinates);
  new ResizeObserver(() => board.setWidth($('board').clientWidth)).observe($('board'));

  let worker;
  let engineSeconds = 1;
  let pending = null;
  let nextId = 0;
  let ready = false;
  let busy = true;
  let active = false;
  let game = null;
  let human = WGo.B;
  let passes = 0;
  let moveCount = 0;
  let lastMove = null;
  let settings;
  let message = $('status').textContent;

  function log(text) {
    $('log').value = ($('log').value + text + '\n').split('\n').slice(-300).join('\n');
    $('log').scrollTop = $('log').scrollHeight;
  }

  function update() {
    $('status').textContent = message;
    $('setup').disabled = !ready || busy;
    const canPlay = ready && !busy && active && game.turn === human;
    $('moves').disabled = !canPlay;
    $('board').setAttribute('aria-disabled', String(!canPlay));
    $('board').setAttribute('aria-busy', String(busy));
    if (game) {
      $('summary').textContent = `${game.size}路盤 / あなた: ${human === WGo.B ? '黒' : '白'} / コミ: ${settings.komi}目\n` +
        `思考時間: ${settings.seconds}秒 / 手\n` +
        `${moveCount}手 · アゲハマ 黒 ${game.getCaptureCount(WGo.B)} / 白 ${game.getCaptureCount(WGo.W)}`;
    }
  }

  function draw() {
    const objects = [];
    for (let x = 0; x < game.size; x++) {
      for (let y = 0; y < game.size; y++) {
        const c = game.getStone(x, y);
        if (c) objects.push({ x, y, c });
      }
    }
    if (lastMove) objects.push({ ...lastMove, type: 'CR' });
    board.removeAllObjects();
    board.addObject(objects);
    update();
  }

  function fail(error) {
    ready = false;
    active = false;
    busy = false;
    message = 'エラー: ' + String(error.message || error) + ' ページを再読み込みしてください。';
    log(message);
    if (pending) {
      pending.reject(new Error(message));
      pending = null;
    }
    if (worker) worker.terminate();
    update();
  }

  function request(commands) {
    commands.forEach(command => log('> ' + command));
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pending = { id, resolve, reject };
      worker.postMessage({ id, commands });
    });
  }

  async function run(action) {
    busy = true;
    update();
    try {
      await action();
    } catch (error) {
      fail(error);
    } finally {
      busy = false;
      update();
    }
  }

  function applyMove(vertex, color) {
    if (/^resign$/i.test(vertex)) {
      active = false;
      message = `${color === human ? 'あなた' : 'Ray'}が投了しました。${color === WGo.B ? '白' : '黒'}の勝ちです。`;
      return;
    }
    if (/^pass$/i.test(vertex)) {
      game.pass(color);
      passes++;
      lastMove = null;
    } else {
      const match = /^([A-HJ-T])(\d{1,2})$/i.exec(vertex);
      if (!match) throw new Error('不明な着手: ' + vertex);
      const x = columns.indexOf(match[1].toUpperCase());
      const y = game.size - Number(match[2]);
      if (typeof game.play(x, y, color) === 'number') throw new Error('着手を盤面に反映できません: ' + vertex);
      lastMove = { x, y };
      passes = 0;
    }
    moveCount++;
    message = `${color === human ? 'あなた' : 'Ray'}: ${vertex.toUpperCase()}。あなたの番です。`;
    draw();
  }

  async function score() {
    active = false;
    message = '連続パスで終局しました。Rayが結果を推定中…';
    update();
    const [result] = await request(['final_score']);
    const match = /^([BW])\+([\d.]+)$/.exec(result);
    const text = result === '0' ? '持碁' : match ? `${match[1] === 'B' ? '黒' : '白'}の${match[2]}目勝ち` : result;
    message = '終局 · Rayの推定結果: ' + text;
  }

  async function reply() {
    if (!active) return;
    message = 'Rayが思考中…';
    update();
    const color = -human;
    const [vertex] = await request(['genmove ' + (color === WGo.B ? 'b' : 'w')]);
    applyMove(vertex, color);
    if (active && passes >= 2) await score();
  }

  async function startGame() {
    settings = {
      size: Number($('size').value),
      komi: Number($('komi').value),
      seconds: engineSeconds,
    };
    human = $('color').value === 'b' ? WGo.B : WGo.W;
    active = false;
    message = '新しい対局を準備中…';
    update();
    await request(['boardsize ' + settings.size, 'clear_board', 'komi ' + settings.komi]);
    game = new WGo.Game(settings.size);
    board.setSize(settings.size);
    passes = moveCount = 0;
    lastMove = null;
    active = true;
    message = 'あなたの番です。交点をクリックして着手してください。';
    draw();
    if (human === WGo.W) await reply();
  }

  async function play(vertex) {
    await request(['play ' + (human === WGo.B ? 'b' : 'w') + ' ' + vertex]);
    applyMove(vertex, human);
    if (passes >= 2) await score();
    else await reply();
  }

  board.addEventListener('click', (x, y) => {
    if (!ready || busy || !active || game.turn !== human || !game.isOnBoard(x, y)) return;
    const error = game.play(x, y, human, true);
    if (typeof error === 'number') {
      message = { 2: 'そこにはすでに石があります。', 3: '自殺手は打てません。', 4: 'コウをすぐに取り返すことはできません。' }[error] || 'そこには打てません。';
      update();
      return;
    }
    run(() => play(columns[x] + (game.size - y)));
  });
  $('pass').addEventListener('click', () => run(() => play('pass')));
  $('resign').addEventListener('click', () => {
    if (!window.confirm('投了しますか？')) return;
    applyMove('resign', human);
    update();
  });
  $('settings').addEventListener('submit', event => {
    event.preventDefault();
    if (!ready || busy || (active && moveCount && !window.confirm('現在の対局を終了して、新しい対局を始めますか？'))) return;
    const seconds = Number($('seconds').value);
    if (seconds !== engineSeconds) startEngine(seconds);
    else run(startGame);
  });

  function startEngine(seconds) {
    if (worker) worker.terminate();
    ready = active = false;
    busy = true;
    engineSeconds = seconds;
    message = 'エンジンとパラメータを読み込み中…';
    update();
    try {
      const url = new URL('play-worker.js', location.href);
      url.searchParams.set('seconds', String(seconds));
      worker = new Worker(url);
      worker.onmessage = ({ data }) => {
        if (data.type === 'status') {
          message = '読み込み中: ' + data.text;
          update();
        } else if (data.type === 'fatal') {
          fail(data.error);
        } else if (data.type === 'ready') {
          ready = true;
          run(startGame);
        } else if (data.type === 'response' && pending && pending.id === data.id) {
          const { resolve, reject } = pending;
          pending = null;
          if (data.error) reject(new Error(data.error));
          else {
            data.results.forEach(result => log('= ' + result));
            resolve(data.results);
          }
        }
      };
      worker.onerror = event => {
        event.preventDefault();
        fail(event.message || 'エンジンを読み込めませんでした。');
      };
    } catch (error) {
      fail(error);
    }
  }

  try {
    if (location.protocol === 'file:') throw new Error('HTTPサーバー経由でplay.htmlを開いてください。');
    startEngine(Number($('seconds').value));
  } catch (error) {
    fail(error);
  }
})();
