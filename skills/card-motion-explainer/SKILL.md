---
name: "card-motion-explainer"
description: "技術・IT・セキュリティ等の仕組みを、コード／画面部品風カードの図解アニメーション動画（縦型ショート、字幕のみ）にする。HyperFrames(HTML+GSAP)で作りMP4に書き出す。"
---

# カード図解アニメーション動画（Card Motion Explainer）

「データ行カード・エディタ窓・状態バッジ・時系列レーン」などの**画面部品風カード**を、
**値や色がその場で変わるアニメーション**で見せる説明動画を作る。
実績：パスキー（40秒）、OSI参照モデル（57秒）。HyperFrames（Apache-2.0, HTML→MP4）＋GSAP（無料）を使う。
Remotionは社員4人以上の営利企業だと有料ライセンスが必要なので使わない。

## 0. 既定値（ユーザーが指定しなければこれで進める）
- 1080×1920（9:16）、45〜60秒、ナレーションなし（見出し＋字幕のみ）、ダーク背景
- 対象者・尺・形式が不明なら AskUserQuestion で1回だけ確認（対象者／字幕のみ or ナレーション付き）

## 1. デザインルール（品質の核。必ず守る）
1. **1場面＝テーマ色1つ**。英語見出しをその色で表示（例：危険=赤、安全=緑、処理=青、端末/注意=黄、まとめ/概念=紫）。
2. **1画面の要素は2〜4個**。下半分は空いていてよい（SNSのUIが重なるため）。
3. **用語・値＝等幅フォント（英語）／説明＝日本語字幕** と役割を分ける。
4. **場面を切らずに「変化」で見せる**：同じカードの値を書き換える（TextPlugin）、枠色を変える、✓/✕を付ける、揺らす。
5. 字幕は**2行以内・1行18字目安**、1場面で1〜3回差し替え。読み切れるよう1字幕あたり2.5〜4秒。
6. 例データは本物っぽく具体的に（`ping 8.8.8.8`、`pubkey 04:a9:5c…`、`a7f3c9e1`）。ただし実在の社名・個人情報は使わない。
7. 技術的に争いのある点は断定しない（例：TLSの層→「暗号化」と役割で書く）。

## 2. 部品カタログ（概念→部品の選び方）
| 伝えたいこと | 部品 | クラス |
|---|---|---|
| 状態・値の変化（DBの行、設定値） | データ行カード | `.row`（番号/キー/値） |
| 階層・一覧（7層、手順） | 層カード | `.lr`（番号バッジ/名前/例） |
| 処理・コマンド・やりとり | エディタ窓 | `.win`（●●● + 色付きコード） |
| 成功/失敗の対比 | 状態枠カード＋バッジ | `.codecard` + `.badge` |
| 進行状態 | ピル | `.pill`（点線=pending → 実線=確定） |
| データの構造・包含 | ブロック列 | `.pkt > .blk`（幅アニメで追加） |
| 時間順・誰が何をしたか | 時系列レーン | `.lane` `.dot` `.ev` `.arrow` |
| 送り手と受け手 | 2列ミニスタック＋移動体 | `.col .cell` `.runner` `.peer` |
| 範囲・程度 | メーター／横並びマス | `.meter i`、`.strip .sq` |

## 3. 作業手順
### 3.1 台本（場面表）を先に作る
表で：`秒 | 英語見出し(色) | 字幕1→2→3 | 部品 | 動き`。5〜7場面、各6〜13秒。最後は1行のまとめ（行動につながる一言）。
事実関係は必要ならWebSearchで確認してから書く。

### 3.2 プロジェクト準備
```bash
npx -y hyperframes@latest init <name> --example blank --resolution portrait --non-interactive
cd <name> && npm i gsap
```
- index.html の GSAP読込をローカルに：`node_modules/gsap/dist/gsap.min.js` と `TextPlugin.min.js`（CDNが塞がれた環境でも動くように）。
- ローカルPC（Claude Code）なら公式スキルも入れると良い：`npx skills add heygen-com/hyperframes`。
- クラウド等で Chrome のダウンロードが403になる場合：
  `export HYPERFRAMES_BROWSER_PATH=/opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell`（実パスを`ls`で確認）と `HYPERFRAMES_SKIP_SKILLS=1`。

### 3.3 index.html を書く（下の雛形をベースに）
- 各場面 = `<section id="sN" class="clip" data-start="秒" data-duration="秒">`
- 動きは**1本の paused タイムライン**に絶対秒で並べ、`window.__timelines["main"]` に登録。
- ヘルパー（雛形参照）：`head`（見出し＋最初の字幕）、`swap`（字幕差し替え）、`popIn`、`out`（場面退場）、`pillTo`、`shake`。
- 値の書き換え：`tl.to(sel,{text:"新しい値", color:"#3ddc84", duration:.7, ease:"none"}, t)`
- 退場は各場面の終わり0.4秒前に `out("#sN", 終了-0.4)`。

### 3.4 検査 → 書き出し → コマ確認（必須）
```bash
npx -y hyperframes@<ver> check      # error 0 を確認（nested_structure の warning は無視可）
npx -y hyperframes@<ver> render -o renders/out.mp4 --quality delivery
```
書き出しは長くなる（60秒で約2分強）。ツールの時間制限がある環境では `timeout 290` を付けるか `nohup … &` で実行してログを確認。
書き出し後、ffmpegで10〜12コマ切り出して一覧画像にし、**自分の目で確認**する：
```bash
mkdir -p fr; for t in 3 6 11 17 23 28 35 42 47 53; do ffmpeg -v error -y -ss $t -i renders/out.mp4 -frames:v 1 -vf "crop=1080:1100:0:200,scale=360:367" fr/f_$t.png; done
```
確認観点：文字の重なり／はみ出し、字幕の読みやすさ、色の意味の一貫性、技術的な正確さ。直したら再書き出し。

### 3.5 納品
`/mnt/user-data/outputs/`（またはユーザー指定フォルダ）に `<topic>_cards.mp4` と元の `<topic>_cards.html` を置き、場面構成表と「判断したところ（正確さの扱い）」を短く報告。

## 4. ハマりどころ（実際に起きたもの）
- 画面全体を覆う装飾div（周辺減光など）は check で「文字が隠れている」誤検知になる → 背景 `.bg` のグラデーションに含める。
- `width:0` から伸ばすブロックは枠線だけ見えてしまう → 初期 `opacity:0` にして幅と一緒に1へ。
- CSSの `filter:blur` / `backdrop-filter` は書き出しが数倍遅くなる → 使わない（ぼかしは radial-gradient で表現）。
- `Math.random()`・`Date.now()`・ネット取得は禁止（コマごとに結果が変わる）。
- 縦に動かす移動体の座標は「セル高さ＋間隔」のピッチで計算し、点線（`.peer`）の位置も同じピッチに合わせる。
- 字幕を後から差し替える要素は初期 `style="opacity:0"`。

## 5. 雛形（そのまま貼って場面を書き換える）
```html
<!doctype html>
<html lang="ja" data-resolution="portrait">
<head>
<meta charset="UTF-8" /><meta name="viewport" content="width=1080, height=1920" />
<script src="node_modules/gsap/dist/gsap.min.js"></script>
<script src="node_modules/gsap/dist/TextPlugin.min.js"></script>
<style>
:root{--bg:#0b0e14;--fg:#eef2f8;--mut:#8a94a8;--line:rgba(255,255,255,.14);
  --red:#ff5f57;--green:#3ddc84;--blue:#5aa9ff;--amber:#f5b942;--violet:#a78bfa;
  --sans:"Noto Sans CJK JP","Noto Sans JP","Hiragino Sans","Yu Gothic UI",sans-serif;
  --mono:"JetBrains Mono","SFMono-Regular",Consolas,"DejaVu Sans Mono",monospace}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;overflow:hidden;background:var(--bg);color:var(--fg);font-family:var(--sans)}
#root{position:relative;width:1080px;height:1920px;overflow:hidden}
.bg{position:absolute;inset:0;background:
  radial-gradient(90% 70% at 50% 45%,transparent 50%,rgba(0,0,0,.7)),
  radial-gradient(80% 50% at 50% 35%,rgba(90,169,255,.10),transparent 70%),
  linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px) 0 0/60px 60px,
  linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px) 0 0/60px 60px,var(--bg)}
.clip{position:absolute;inset:0}
.mono{font-family:var(--mono)}
/* 見出し＋字幕 */
.hd{position:absolute;left:0;right:0;top:250px;text-align:center}
.hd .en{font-size:66px;font-weight:800}
.cap{position:absolute;left:80px;right:80px;top:360px;text-align:center;font-size:44px;font-weight:800;line-height:1.5}
.cap span{background:rgba(0,0,0,.55);padding:6px 18px;border-radius:10px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
/* データ行カード */
.tbl{position:absolute;left:140px;width:800px}
.tbl .th{font-family:var(--mono);font-size:26px;color:var(--mut);margin:0 0 14px 6px}
.row{display:flex;align-items:center;height:96px;margin-bottom:16px;padding:0 30px;border:2px solid var(--line);border-radius:16px;background:rgba(255,255,255,.04);font-family:var(--mono)}
.row .i{width:60px;color:var(--mut);font-size:30px}.row .k{width:190px;font-size:36px;font-weight:700}
.row .v{flex:1;text-align:right;font-size:34px;font-weight:700;white-space:nowrap}
/* 層カード */
.lr{display:flex;align-items:center;height:94px;margin-bottom:12px;padding:0 26px;border:2px solid var(--line);border-radius:16px;background:rgba(255,255,255,.04)}
.lr .no{width:86px;height:54px;border-radius:12px;display:grid;place-items:center;font-family:var(--mono);font-size:30px;font-weight:800;border:2px solid;margin-right:24px}
.lr .nm{flex:1;line-height:1.15}.lr .nm b{display:block;font-family:var(--mono);font-size:30px}.lr .nm small{font-size:24px;color:var(--mut);font-weight:700}
.lr .ex{font-family:var(--mono);font-size:28px;color:var(--mut);white-space:nowrap}
/* エディタ窓 */
.win{position:absolute;left:100px;width:880px;border:2px solid var(--line);border-radius:20px;background:rgba(14,18,27,.92);overflow:hidden}
.win .bar{display:flex;align-items:center;gap:12px;height:58px;padding:0 22px;border-bottom:2px solid var(--line);font-family:var(--mono);font-size:24px;color:var(--mut)}
.win .bar i{width:16px;height:16px;border-radius:50%;display:inline-block}
.win pre{padding:24px 30px;font-family:var(--mono);font-size:30px;line-height:1.7;white-space:pre}
.kw{color:var(--violet)}.str{color:var(--amber)}.fn{color:var(--blue)}.cm{color:#6b7891}.ok{color:var(--green)}.ng{color:var(--red)}.pr{color:var(--green)}
/* ピル・状態枠カード・バッジ */
.pill{position:absolute;left:50%;transform:translateX(-50%);padding:14px 34px;border-radius:999px;font-family:var(--mono);font-size:30px;font-weight:700;white-space:nowrap;border:2px solid}
.pill.dash{border-style:dashed;color:var(--mut)}
.codecard{position:absolute;left:110px;width:780px;padding:24px 30px;border:2px solid;border-radius:16px;font-family:var(--mono);font-size:30px;line-height:1.6}
.badge{position:absolute;width:64px;height:64px;border-radius:50%;display:grid;place-items:center;font-size:38px;font-weight:900;color:#0b0e14}
/* ブロック列（包含・構造） */
.pkt{position:absolute;left:110px;width:860px;height:150px;display:flex;justify-content:center}
.blk{height:150px;overflow:hidden;border:2px solid;border-radius:14px;margin:0 4px;display:flex;flex-direction:column;align-items:center;justify-content:center;white-space:nowrap;font-family:var(--mono)}
.blk b{font-size:32px}.blk small{font-size:21px;color:var(--mut);margin-top:6px;font-family:var(--sans);font-weight:700}
/* 時系列レーン */
.lane{position:absolute;left:110px;width:860px;height:4px;background:rgba(255,255,255,.22)}
.lane-lbl{position:absolute;left:110px;padding:8px 22px;border-radius:999px;border:2px solid;font-size:28px;font-weight:800}
.dot{position:absolute;width:26px;height:26px;border-radius:50%;margin:-11px 0 0 -13px}
.ev{position:absolute;font-family:var(--mono);font-size:24px;color:var(--mut);transform:translateX(-50%);white-space:nowrap}
.arrow{position:absolute;width:4px;margin-left:-2px}
/* 2列ミニスタック */
.col{position:absolute;width:300px}.col .ttl{font-family:var(--mono);font-size:26px;color:var(--mut);text-align:center;margin-bottom:12px}
.cell{height:66px;margin-bottom:10px;border:2px solid var(--line);border-radius:12px;display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:26px;font-weight:700;background:rgba(255,255,255,.04)}
.peer{position:absolute;height:0;border-top:3px dashed rgba(255,255,255,.35)}
.runner{position:absolute;width:56px;height:36px;border-radius:8px;background:var(--amber);box-shadow:0 0 24px rgba(245,185,66,.6)}
/* メーター・横並びマス */
.meter{position:absolute;right:30px;top:30px;display:flex;flex-direction:column-reverse;gap:5px}
.meter i{display:block;width:70px;height:11px;border-radius:3px;background:rgba(255,255,255,.12)}
.strip{position:absolute;left:100px;width:880px;display:flex;gap:12px}
.sq{flex:1;height:120px;border:2px solid var(--line);border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:var(--mono);background:rgba(255,255,255,.04)}
.sq b{font-size:34px}.sq small{font-size:20px;color:var(--mut);margin-top:4px}
</style></head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="10" data-width="1080" data-height="1920">
  <div class="bg"></div>
  <section id="s1" class="clip" data-start="0" data-duration="10">
    <div class="hd"><div class="en" style="color:var(--red)">Password</div></div>
    <div class="cap a1"><span>字幕1行目、<br>2行目まで。</span></div>
    <div class="cap a2" style="opacity:0"><span>差し替え後の字幕。</span></div>
    <div class="tbl" style="top:640px"><div class="th">table: users</div>
      <div class="row"><span class="i">1</span><span class="k">tanaka</span><span class="v v1">pw: Haru2024!</span></div></div>
    <div class="pill dash p1" style="top:900px">pending</div>
  </section>
</div>
<script>
gsap.registerPlugin(TextPlugin);
const tl = gsap.timeline({ paused: true });
const E = "power3.out", B = "back.out(1.7)";
const swap = (a,b,t)=>{ tl.to(a,{opacity:0,y:-16,duration:.3},t).fromTo(b,{opacity:0,y:16},{opacity:1,y:0,duration:.35,ease:E},t+.15); };
const head = (s,t)=>{ tl.from(`${s} .hd .en`,{opacity:0,y:-20,duration:.5,ease:E},t+.1); tl.from(`${s} .cap:nth-of-type(2)`,{opacity:0,y:16,duration:.45,ease:E},t+.3); };
const popIn = (sel,t)=>tl.fromTo(sel,{opacity:0,scale:.5},{opacity:1,scale:1,duration:.45,ease:B},t);
const out = (s,t)=>tl.to(`${s} > *`,{opacity:0,duration:.35},t);
const pillTo = (a,b,t)=>{ if(a) tl.to(a,{opacity:0,duration:.2},t); popIn(b,t+.1); };
const shake = (sel,t)=>tl.to(sel,{x:-12,duration:.06,yoyo:true,repeat:5,ease:"none"},t);

// --- S1 ---
head("#s1", 0);
tl.from("#s1 .row", { opacity:0, x:-60, duration:.5, ease:E, stagger:.18 }, .7);
popIn("#s1 .p1", 1.6);
swap("#s1 .a1", "#s1 .a2", 4);
tl.to("#s1 .row", { borderColor:"rgba(255,95,87,.75)", backgroundColor:"rgba(255,95,87,.08)", duration:.3 }, 4.2);
tl.to("#s1 .v1", { text:"pubkey 04:a9:5c…", color:"#3ddc84", duration:.7, ease:"none" }, 6);
shake("#s1 .tbl", 4.3);
out("#s1", 9.6);

window.__timelines = window.__timelines || {};
window.__timelines["main"] = tl;
tl.seek(0);
</script>
</body></html>
```

## 6. 拡張メモ
- ナレーションを付けたい場合：台本の各字幕を1文ずつ音声合成（VOICEVOX推奨、クレジット表記必須）→各音声の長さで字幕の秒を決め、`<audio data-start data-duration>` で配置。
- 横型（16:9）：`--resolution landscape`、カード幅を広げ、左に図・右に字幕の2カラムにする。