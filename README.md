# Ray Web

`ray.wasm` をブラウザーで実行するページです。

- `index.html`: GTPコマンドを直接実行するデバッグ用コンソール。
- `play.html`: 盤面をクリック／タップしてRayと対局する画面。

このディレクトリでHTTPサーバーを起動します。

```sh
python3 -m http.server 8000
```

`http://localhost:8000/play.html` を開くと、9路盤・あなたが黒で対局が始まります。
盤サイズ（9・13・19路）、黒白、コミ、思考時間（1・3・5・10秒／手）を選んで「新しい対局」を押すと設定を反映します。
思考時間を変更したときはエンジンを再初期化し、選択値を `--const-time` に設定します。
思考時間は上限の目安で、局面や探索木の上限により短くなることがあります。
パス・投了に対応し、連続パスでRayの `final_score` による推定結果を表示します。
死石を手動確定する機能はありません。

エンジンはWeb Workerで実行します。`ray.js`、`ray.wasm`、`ray.data` は同じディレクトリに置いてください。
`file://` からの直接実行には対応していません。

盤面描画と合法手の検証には [WGo.js](https://github.com/waltheri/wgo.js) 2.3.1 を利用しています。
`vendor/wgo.js` に同梱し、外部CDNへの接続は不要です。MITライセンスの全文はファイル冒頭にあります。

## final_score の修正

同梱のWasmは、Rayの `src/mcts/UctSearch.cpp` の以下の不具合を修正してビルドしています。

- `UctAnalyze` の逆数を `int` に代入してゼロへ切り捨て、全面を白の領域と判定してしまう問題を、`double` に変更して修正。
- 解析開始時に `StartTimer()` を呼び、前の探索からの待ち時間で解析が即終了する問題を修正。

ソース差分は `patches/final-score.patch` にあります。得点計算は引き続きRayの解析結果です。
回帰テストでは、二眼で全面を確保した黒／白の局面を9・13・19路で検証します。

```sh
node tests/final-score.cjs
node tests/final-score.cjs . --time
```
