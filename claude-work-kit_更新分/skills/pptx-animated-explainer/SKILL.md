---
name: "pptx-animated-explainer"
description: "図解とPowerPointの動き（モーフ・クリック送り・軌跡・トリガー・目次リンク）を入れた説明資料(.pptx)を作る。「動きのある資料」「アニメーション付きPowerPoint」「〜を図解で説明する資料」で使う。"
---

# 動く図解PowerPoint資料の作り方

チャットAIしか使ったことのない人や、現場の担当者にも仕組みが伝わるように、**図解＋PowerPointの動き**（変形〔モーフ〕、クリックで1ステップずつ進むアニメーション、軌跡、トリガー、目次リンク、発表者ノート）を組み込んだ .pptx を作る。

仕組み：pptxgenjs で図形を描き、各図形に名前（objectName）を付けて「どのクリックで何を動かすか」を JSON に記録する。最後に `inject.py` がその JSON をもとに、PowerPoint の画面切り替え・アニメーションの XML を .pptx に書き込む。

## 進め方

1. **確認**（必要なときだけ短く）：誰に向けた資料か、何に使うか（研修・説明会・読み物）、枚数の目安。依頼文から分かれば聞かずに進め、前提を最後に書く。
2. **調べる**：数値・法令・製品の動向は必ず Web で確認し、出典を控える（回答の最後に Sources として載せる）。仕様値は「一例」「目安」と明記する。
3. **構成を決める**（下の「構成の型」）。1枚1メッセージ。発表なら1枚1.5〜2分。
4. **部品を書き出す**：作業フォルダに `deckkit.js` と `inject.py` を、このファイルの末尾にあるコードのとおりに作る（`/mnt/skills/public/pptx/SKILL.md` の pptxgenjs の注意点も一読する）。
5. **build.js を書く**：「テンプレート」から始めて、スライドごとに図を組む。
6. **ビルドして注入する**：
   ```bash
   node build.js                                  # raw.pptx と raw.anim.json ができる
   python3 inject.py raw.pptx "完成名.pptx"        # MISSING / duplicate が出たら名前を直す
   python3 /mnt/skills/public/pptx/scripts/office/validate.py "完成名.pptx"
   ```
7. **見た目を確認する**：PDF化 → 画像化して全スライドを見る（4枚ずつ1枚の画像にまとめると速い）。文字のはみ出し、重なり、折り返し、余白を直して再ビルドする。
   ```bash
   cp "完成名.pptx" qa/deck.pptx && cd qa
   python3 /mnt/skills/public/pptx/scripts/office/soffice.py --headless --convert-to pdf deck.pptx
   pdftoppm -jpeg -r 70 deck.pdf s 2>/dev/null
   ```
8. **渡す**：`/mnt/user-data/outputs/` にコピーして SendUserFile で渡す。返答は短く、(a) 動きの見どころがどのスライドにあるか、(b) 構成、(c) 内容の注意点（一例の数値、社内に合わせて直すところ）、(d) **アニメーションの再生は確認できていない**こと、を伝える。

## 構成の型

| 位置 | スライド | 使う動き |
|---|---|---|
| 1 | 表紙（濃色）：右に主役の図。自動で組み上がる | 自動のズーム・ワイプ |
| 2 | 目次：章カードをクリックで各章へジャンプ | `linkCard`、各スライド右下に `navHome` |
| 章の頭 | 中扉（濃色）「PART n」＋見出し＋一文 | 自動のワイプ |
| 導入 | 身近なたとえ・対比（〇〇の場合／△△の場合） | クリックで左右の順に表示 |
| **見せ場** | 仕組みの流れ図。データや物の粒がクリックごとに移動し、手順のリストが1行ずつ増える | `packet` ＋ `hop`（軌跡）、`pulse` |
| ズーム | 見せ場の図を拡大し、部品ごとに説明（カメラが図の上を移動する） | 変形（モーフ）＋同じ図を倍率違いで描画 |
| 状態の変化 | 計器の針、数値、棒の長さが変わる | 変形（モーフ）＋`needle` |
| 参加型 | チェックリスト・クイズ・例の表示。クリックした所だけ反応する | `trigger` |
| 注意 | やってはいけないこと／得意・苦手 | ズームで1枚ずつ |
| まとめ（濃色） | 要点3つ＋表紙の図をもう一度 | 左から順に表示 |

テーマに合わせて、見せ場は必ず1つ以上作る（例：MCPならAI→ホスト→サーバー→アプリの7ステップ、冷凍機なら冷凍サイクルの4工程）。

## デザインの決まり

- **色**：テーマの意味に合わせて決める（例：冷凍機では高温・高圧＝赤、液＝橙、低温＝青）。濃色は表紙・中扉・まとめ、本文は淡色の背景（方眼の模様つき）。強調色は1〜2色まで。
- **フォント**：Meiryo UI（デフォルト）。タイトル34pt、本文14〜16pt、注記11〜12pt（10pt未満にしない）。
- **確認用の表示では日本語が実際より幅広く表示される**ため、狭い箱は字数に余裕を持たせる。目安として、幅2.3インチのカードなら見出し19pt・8文字程度まで。
- タイトル位置は全スライドで共通（`title()`）。タイトルの下線や、端の飾り帯は使わない。
- 図形にはすべて `objectName` を付け、1枚の中で名前を重複させない。アイコンは `iconCircle` を使う（名前と名前+"_i" の2つができる）。
- **静止画で見ても読める状態を最終形にする**：印刷や確認用の表示では、全部の図形が出た状態で表示される。説明文を入れ替える（消して出す）より、リストが増えていく形にする。移動する粒は、番号付きの目印として出発点に置く。
- 図が紙面の外にはみ出すのは、ズームのスライドでは問題ない（スライドショーでは切り取られる）。

## アニメーションの書き方（deckkit の API）

```js
const s = D.newSlide("light" | "dark", "fade" | "morph");  // 画面切り替え
step(s, auto, ...fx群);   // auto=true は切り替え直後に自動、false はクリック1回分
fx(名前 or 名前の配列, 効果, { d: 遅延ms, dur: 長さms, stagger: 1つごとの遅れms, dir: "b"|"l"|"r" })
//   効果: "fade" | "zoom" | "fly"(少し浮き上がって出る) | "wipeR"(左から) | "pulse"(強調) | "fadeOut"(消える)
hop(名前, [[x0,y0],[x1,y1],...], 遅延, 長さ)   // 表示 → 折れ線どおりに移動 → 消える（keep=true で残す）
trigger(s, "押す図形の名前", fx(...))           // その図形をクリックしたときだけ動く
linkCard(s, runs, x, y, w, h, 移動先スライド番号, 名前) / navHome(s)   // 図形全体がリンクになる
needle(s, cx, cy, 長さ, 角度, 色, 名前)          // 計器の針（中心で回る。真上が0度、時計回り）
```

- **変形（モーフ）**：次のスライドに `"!!"` で始まる同じ名前の図形を置くと、位置・大きさ・色・回転がなめらかに変わる。
- **カメラのズーム**：図を `diagram(s, k, ox, oy)` のような関数にまとめ、座標をすべて `ox + x*k` で計算する。本体のスライドでは k≈0.9〜1、ズームのスライドでは k≈2.5 にして、注目する部品が左寄り中央に来るように ox・oy を決める。ズームのスライドには上のタイトルを置かず（配管などがタイトルに重なるため）、右側の白いパネル（`"!!panel"`）に見出しと説明を入れる。
- **軌跡**：粒は区間ごとに別の図形にする（同じ図形で軌跡を続けると、出発点の扱いが分かりにくいため）。
- **円弧（BLOCK_ARC）**：角度は3時の方向が0度で時計回り。計器（−135°〜+135°の振れ幅）の目盛り v の位置は `135 + 270*v/max`。
- グラフ（addChart）にも `objectName` を付ければアニメーションできる。

## 気をつけること

- pptxgenjs の `margin` 配列は **[左, 右, 下, 上]**（ポイント単位）。
- 色の16進数に `#` を付けない。影の設定は毎回 `shadow()` で新しく作る（使い回すと壊れる）。
- 目次リンクは `linkCard` / `navHome` を使う（pptxgenjs だけでは図形のリンクが壊れるので、`inject.py` が直す）。
- `inject.py` が `MISSING` を出したら、名前の打ち間違いか、その図形を描き忘れている。
- トリガーは、押す図形そのものに反応する。上に重ねたアイコンを押しても反応しないので、押す図形は大きくする。
- 確認用の表示（LibreOffice）ではアニメーションも変形（モーフ）も再生されない。変形（モーフ）は PowerPoint 2019 / Microsoft 365 以降が必要で、古い版ではフェードになる。このことは返答で伝える。
- 発表者ノート（`notes`）には、話す内容と「【クリックで進みます】」などの操作メモを書く。

## テンプレート（build.js）

```js
// build.js — 最小テンプレート（node build.js → python3 inject.py raw.pptx 完成.pptx）
const { createDeck } = require("./deckkit.js");

const C = {
  ink: "0E1B2C", ink2: "1A2E47", paper: "F4F8FB", white: "FFFFFF", text: "16263A", muted: "5A6B80",
  line: "C7D3E0", soft: "E5EDF5", accent: "0B95B8", accentSoft: "D7F1F8", ice: "BFE3F2",
  hot: "E2522F", hotSoft: "FCE4DD", cold: "2C6BD3", coldSoft: "DFEAFB", green: "2E9E5B", greenSoft: "DDF2E5",
  gridDarkMinor: "15253A", gridDarkMajor: "1D334F", gridLightMinor: "EDF2F7", gridLightMajor: "E3EAF2",
};
const D = createDeck({ colors: C, title: "資料タイトル", author: "AITEC", workDir: __dirname });
const { pres, fx, step, trigger, T, title, kicker, rtext, card, iconCircle, ic, circle, line, arrow, needle, notes, navHome, linkCard, packet, hop } = D;

(async () => {
  await D.init();

  // 1. 表紙（濃色）
  {
    const s = D.newSlide("dark", "fade");
    T(s, "対象者向けの一言", { x: 0.7, y: 1.6, w: 6.2, h: 0.4, fontSize: 16, bold: true, color: C.accent, objectName: "t_kick" });
    T(s, "資料タイトル", { x: 0.7, y: 2.05, w: 6.4, h: 1.2, fontSize: 46, bold: true, color: C.white, objectName: "!!title" });
    T(s, "サブタイトル", { x: 0.7, y: 3.4, w: 6.2, h: 0.8, fontSize: 18, color: C.ice, objectName: "t_sub" });
    await iconCircle(s, "FaLightbulb", 9.8, 3.75, 2.0, C.ink2, C.ice, "hero", C.accent);
    step(s, true, fx(["hero", "hero_i"], "zoom", { dur: 600 }));
    notes(s, "表紙で話すこと");
  }

  // 2. 目次（クリックで各章へジャンプ）
  {
    const s = D.newSlide("light", "fade");
    kicker(s, "AGENDA");
    title(s, "今日の流れ");
    const items = [["1", "第1章", "説明", 3], ["2", "第2章", "説明", 4]];
    items.forEach(([n, h, d, target], i) => {
      linkCard(s, [
        { text: n, options: { fontSize: 40, bold: true, color: C.accent, breakLine: true } },
        { text: h, options: { fontSize: 18, bold: true, breakLine: true } },
        { text: d, options: { fontSize: 14, color: C.muted, breakLine: true } },
        { text: "クリックで移動 ▶", options: { fontSize: 12, color: C.cold } },
      ], 0.6 + i * 3.1, 1.6, 2.9, 4.2, target, `linkCard${i}`);
    });
    step(s, true, fx(["linkCard0", "linkCard1"], "fly", { dir: "b", stagger: 150 }));
  }

  // 3. 図解＋クリック送り＋軌跡アニメーション
  {
    const s = D.newSlide("light", "fade");
    kicker(s, "1 ｜ 第1章");
    title(s, "AからBへ、データが流れる");
    rtext(s, "A", 1.0, 2.5, 2.0, 1.0, C.coldSoft, "!!boxA", { fontSize: 20, bold: true, align: "center", valign: "middle" });
    rtext(s, "B", 8.0, 2.5, 2.0, 1.0, C.hotSoft, "!!boxB", { fontSize: 20, bold: true, align: "center", valign: "middle" });
    line(s, 3.0, 3.0, 8.0, 3.0, C.line, 3, "route");
    packet(s, "pk1", "1", 3.25, 3.0, C.accent);
    T(s, "① Aが依頼を送る", { x: 1.0, y: 4.2, w: 6, h: 0.4, fontSize: 16, objectName: "st1" });
    step(s, false, fx("st1", "fade"), hop("pk1", [[3.25, 3.0], [7.75, 3.0]], 200, 1000), fx("!!boxB", "pulse", { d: 1250 }));
    navHome(s);
    notes(s, "【クリックで進みます】");
  }

  // 4. 変形（モーフ）：同じ "!!" 名の図形が動く
  {
    const s = D.newSlide("light", "morph");
    kicker(s, "2 ｜ 第2章");
    title(s, "モーフで位置と大きさが変わる");
    rtext(s, "A", 1.0, 1.6, 4.0, 2.0, C.coldSoft, "!!boxA", { fontSize: 32, bold: true, align: "center", valign: "middle" });
    rtext(s, "B", 9.0, 4.5, 1.5, 0.8, C.hotSoft, "!!boxB", { fontSize: 16, bold: true, align: "center", valign: "middle" });
    navHome(s);
  }

  const n = await D.save(__dirname + "/raw.pptx");
  console.log("slides:", n);
})();
```

## 部品のコード

作業フォルダにこのとおり書き出して使う（そのまま使い、テーマごとの変更は build.js 側で行う）。pptxgenjs・react・react-dom・react-icons・sharp が必要（通常は入っている。無ければ npm install）。

### deckkit.js

```js
// deckkit.js — reusable helpers for animated pptxgenjs decks.
// Records an animation spec (anim.json) that anim.py injects into the .pptx
// (Morph/Fade transitions, click-step animations, triggers, slide-jump links).
const pptxgen = require("pptxgenjs");
const React = require("react");
const RDS = require("react-dom/server");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const ICON_SETS = { fa: () => require("react-icons/fa"), md: () => require("react-icons/md"), gi: () => require("react-icons/gi"), tb: () => require("react-icons/tb") };

function createDeck(opts) {
  const C = opts.colors;           // { ink, paper, text, muted, line, soft, white, accent, accentSoft, ... }
  const FONT = opts.font || "Meiryo UI";
  const CODE = opts.codeFont || "Consolas";
  const W = 13.333, H = 7.5;
  const workDir = opts.workDir || ".";

  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  pres.title = opts.title || "";
  pres.author = opts.author || "";
  pres.theme = { headFontFace: FONT, bodyFontFace: FONT };

  let BG_DARK = null, BG_LIGHT = null;
  let SN = 0;
  const ANIM = {};
  const iconCache = {};

  async function gridBg(bg, minor, major, file) {
    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#${bg}"/>`;
    if (minor) {
      for (let x = 0; x <= 1920; x += 40) s += `<line x1="${x}" y1="0" x2="${x}" y2="1080" stroke="#${x % 200 === 0 ? major : minor}" stroke-width="${x % 200 === 0 ? 1.4 : 1}"/>`;
      for (let y = 0; y <= 1080; y += 40) s += `<line x1="0" y1="${y}" x2="1920" y2="${y}" stroke="#${y % 200 === 0 ? major : minor}" stroke-width="${y % 200 === 0 ? 1.4 : 1}"/>`;
    }
    s += "</svg>";
    await sharp(Buffer.from(s)).png().toFile(file);
    return file;
  }
  async function init() {
    const g = opts.grid !== false;
    BG_DARK = await gridBg(C.ink, g ? C.gridDarkMinor : null, C.gridDarkMajor, path.join(workDir, "bg_dark.png"));
    BG_LIGHT = await gridBg(C.paper, g ? C.gridLightMinor : null, C.gridLightMajor, path.join(workDir, "bg_light.png"));
  }

  async function icon(name, color) {
    const key = name + color;
    if (iconCache[key]) return iconCache[key];
    const set = name.slice(0, 2).toLowerCase();
    const lib = ICON_SETS[set] ? ICON_SETS[set]() : ICON_SETS.fa();
    if (!lib[name]) throw new Error("icon not found: " + name);
    const svg = RDS.renderToStaticMarkup(React.createElement(lib[name], { color: "#" + color, size: "256" }));
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    return (iconCache[key] = "image/png;base64," + buf.toString("base64"));
  }

  // ---------- slides & animation spec ----------
  function newSlide(kind = "light", transition = "fade") {
    SN++;
    ANIM[SN] = { transition, steps: [], triggers: [], links: {} };
    const s = pres.addSlide();
    s.background = { path: kind === "dark" ? BG_DARK : BG_LIGHT };
    s._n = SN;
    s._dark = kind === "dark";
    return s;
  }
  // effects: fade | zoom | fly(dir b/l/r) | wipeR | path(dx,dy or pts) | pulse | fadeOut
  function fx(names, e, o = {}) {
    if (!Array.isArray(names)) names = [names];
    return names.map((n, i) => ({ n, e, d: (o.d || 0) + (o.stagger || 0) * i, dur: o.dur || 500, dir: o.dir, dx: o.dx, dy: o.dy, pts: o.pts }));
  }
  function step(s, auto, ...groups) { ANIM[s._n].steps.push({ auto, fx: groups.flat() }); }
  function trigger(s, trig, ...groups) { ANIM[s._n].triggers.push({ trig, fx: groups.flat() }); }
  function link(s, name, target) { ANIM[s._n].links[name] = target; }

  // ---------- drawing ----------
  const shadow = () => ({ type: "outer", color: C.text, opacity: 0.14, blur: 10, offset: 3, angle: 90 });
  function T(s, text, o) {
    s.addText(text, Object.assign({ isTextBox: true, fontFace: FONT, color: C.text, fontSize: 16, margin: 0, valign: "top" }, o));
  }
  function title(s, text, name = "!!title") {
    T(s, text, { x: 0.6, y: 0.42, w: 12.1, h: 0.8, fontSize: 34, bold: true, color: s._dark ? C.white : C.text, valign: "middle", objectName: name });
  }
  function kicker(s, text) {
    T(s, text, { x: 0.62, y: 0.12, w: 9, h: 0.32, fontSize: 12, bold: true, color: C.accent, charSpacing: 1, objectName: "kicker" });
  }
  // margin arrays in pptxgenjs are [left, right, bottom, top] (points)
  function box(s, x, y, w, h, fill, name, o = {}) {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, Object.assign({ x, y, w, h, fill: { color: fill }, rectRadius: 0.12, line: { color: fill, width: 0.5 }, objectName: name }, o));
  }
  function rtext(s, text, x, y, w, h, fill, name, o = {}) {
    s.addText(text, Object.assign({ shape: pres.shapes.ROUNDED_RECTANGLE, x, y, w, h, fill: { color: fill }, rectRadius: 0.12, line: { color: fill, width: 0.5 }, fontFace: FONT, fontSize: 16, color: C.text, margin: [10, 10, 6, 6], objectName: name }, o));
  }
  function card(s, x, y, w, h, name, o = {}) {
    box(s, x, y, w, h, C.white, name, Object.assign({ shadow: shadow(), line: { color: C.soft, width: 0.75 } }, o));
  }
  function circle(s, x, y, d, fill, name, o = {}) {
    s.addShape(pres.shapes.OVAL, Object.assign({ x, y, w: d, h: d, fill: { color: fill }, line: { color: fill, width: 0.5 }, objectName: name }, o));
  }
  async function ic(s, iconName, color, x, y, d, name) {
    s.addImage({ data: await icon(iconName, color), x, y, w: d, h: d, objectName: name });
  }
  // circle + icon; returns names [name, name+"_i"]
  async function iconCircle(s, iconName, cx, cy, d, bg, fg, name, ring) {
    circle(s, cx - d / 2, cy - d / 2, d, bg, name, ring ? { line: { color: ring, width: 3 } } : {});
    await ic(s, iconName, fg, cx - d * 0.29, cy - d * 0.29, d * 0.58, name + "_i");
    return [name, name + "_i"];
  }
  function line(s, x1, y1, x2, y2, color, width, name, o = {}) {
    const flipV = (x2 - x1) * (y2 - y1) < 0;
    s.addShape(pres.shapes.LINE, Object.assign({
      x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.max(Math.abs(x2 - x1), 0.001), h: Math.max(Math.abs(y2 - y1), 0.001),
      flipV, line: { color, width }, objectName: name,
    }, o));
  }
  function arrow(s, x1, y1, x2, y2, color, width, name, lineOpts = {}) {
    s.addShape(pres.shapes.LINE, {
      x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.max(Math.abs(x2 - x1), 0.001), h: Math.max(Math.abs(y2 - y1), 0.001),
      flipH: x2 < x1, flipV: y2 < y1, line: Object.assign({ color, width, endArrowType: "triangle" }, lineOpts), objectName: name,
    });
  }
  // gauge needle pivoting at (cx,cy), pointing up at angle 0, clockwise degrees
  function needle(s, cx, cy, len, deg, color, name) {
    const w = 0.16;
    s.addShape(pres.shapes.CUSTOM_GEOMETRY, { x: cx - w / 2, y: cy - len, w, h: len * 2, rotate: deg, fill: { color }, line: { color, width: 0.5 }, objectName: name,
      points: [{ x: w / 2, y: 0 }, { x: w, y: len }, { x: 0, y: len }, { close: true }] });
  }
  function notes(s, t) { s.addNotes(t); }
  function navHome(s, target = 2) {
    const dark = s._dark;
    s.addText("◀ 目次", { shape: pres.shapes.ROUNDED_RECTANGLE, x: 11.75, y: 6.88, w: 1.0, h: 0.36, rectRadius: 0.18, fill: { color: dark ? C.ink2 : C.white }, line: { color: dark ? C.ink2 : C.line, width: 0.75 }, fontFace: FONT, fontSize: 11, color: dark ? C.ice : C.muted, align: "center", valign: "middle", margin: 0, objectName: "linkHome", hyperlink: { slide: target, tooltip: "目次へ戻る" } });
    link(s, "linkHome", target);
  }
  // clickable agenda card (whole shape is the link)
  function linkCard(s, runs, x, y, w, h, target, name, o = {}) {
    s.addText(runs, Object.assign({ shape: pres.shapes.ROUNDED_RECTANGLE, x, y, w, h, rectRadius: 0.15, fill: { color: C.white }, line: { color: C.soft, width: 1 }, shadow: shadow(), fontFace: FONT, margin: [14, 14, 16, 16], valign: "top", objectName: name, hyperlink: { slide: target, tooltip: "移動" } }, o));
    link(s, name, target);
  }
  // round packet with a label (for motion-path flows)
  function packet(s, name, label, cx, cy, color, d = 0.4) {
    s.addText(label, { shape: pres.shapes.OVAL, x: cx - d / 2, y: cy - d / 2, w: d, h: d, fill: { color }, line: { color: C.white, width: 1.5 }, fontFace: FONT, fontSize: 12, bold: true, color: C.white, align: "center", valign: "middle", margin: 0, objectName: name });
  }
  // fade in, travel a polyline (absolute points incl. start), fade out
  function hop(name, pts, d = 0, dur = 900, keep = false) {
    const rel = pts.slice(1).map(([x, y]) => [x - pts[0][0], y - pts[0][1]]);
    const out = [...fx(name, "fade", { d, dur: 200 }), ...fx(name, "path", { d: d + 200, dur, pts: rel })];
    if (!keep) out.push(...fx(name, "fadeOut", { d: d + 250 + dur, dur: 250 }));
    return out;
  }

  async function save(fileName) {
    await pres.writeFile({ fileName });
    fs.writeFileSync(fileName.replace(/\.pptx$/, ".anim.json"), JSON.stringify(ANIM, null, 1));
    return SN;
  }

  return { pres, C, FONT, CODE, W, H, init, icon, newSlide, fx, step, trigger, link, shadow, T, title, kicker, box, rtext, card, circle, ic, iconCircle, line, arrow, needle, notes, navHome, linkCard, packet, hop, save };
}

module.exports = { createDeck };
```

### inject.py

```python
"""inject.py — add Morph/Fade transitions, click animations, triggers and slide-jump links
to a pptxgenjs deck, from the *.anim.json spec written by deckkit.js.
usage: python3 inject.py raw.pptx out.pptx [raw.anim.json]"""
import json, re, sys, zipfile, shutil, os

SRC, DST = sys.argv[1], sys.argv[2]
ANIM_PATH = sys.argv[3] if len(sys.argv) > 3 else re.sub(r"\.pptx$", ".anim.json", SRC)
ANIM = json.load(open(ANIM_PATH, encoding="utf-8"))
W_IN, H_IN = 13.333, 7.5

GF_IDS = set()

class Ctx:
    def __init__(self):
        self.id = 2
        self.grp = {}      # spid -> next grpId
        self.bld = []      # (spid, grpId)
        self.bldg = []     # charts/graphic frames
    def nid(self):
        self.id += 1
        return self.id
    def gid(self, spid, is_sp):
        g = self.grp.get(spid, 0)
        self.grp[spid] = g + 1
        if is_sp:
            self.bld.append((spid, g))
        elif spid in GF_IDS:
            self.bldg.append((spid, g))
        return g

def tgt(spid):
    return f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl>'

def set_vis(c, spid, val, delay=0):
    return (f'<p:set><p:cBhvr><p:cTn id="{c.nid()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="{delay}"/></p:stCondLst></p:cTn>'
            f'{tgt(spid)}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr>'
            f'<p:to><p:strVal val="{val}"/></p:to></p:set>')

def anim_prop(c, spid, attr, frm, to, dur):
    def v(x):
        return f'<p:strVal val="{x}"/>' if isinstance(x, str) else f'<p:fltVal val="{x}"/>'
    return (f'<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="{c.nid()}" dur="{dur}" fill="hold"/>{tgt(spid)}'
            f'<p:attrNameLst><p:attrName>{attr}</p:attrName></p:attrNameLst></p:cBhvr>'
            f'<p:tavLst><p:tav tm="0"><p:val>{v(frm)}</p:val></p:tav><p:tav tm="100000"><p:val>{v(to)}</p:val></p:tav></p:tavLst></p:anim>')

def anim_effect(c, spid, trans, filt, dur):
    return (f'<p:animEffect transition="{trans}" filter="{filt}"><p:cBhvr><p:cTn id="{c.nid()}" dur="{dur}"/>{tgt(spid)}</p:cBhvr></p:animEffect>')

def effect(c, e, spid, is_sp, node):
    kind, d, dur = e["e"], e["d"], e["dur"]
    if kind in ("fade", "wipeR", "zoom", "fly"):
        cls = "entr"
        if kind == "fade":
            pid, sub = 10, 0
        elif kind == "wipeR":
            pid, sub = 22, 8
        elif kind == "zoom":
            pid, sub = 53, 16
        else:
            pid, sub = 42, 0
    elif kind == "path":
        cls, pid, sub = "path", 0, 0
    elif kind == "pulse":
        cls, pid, sub = "emph", 6, 0
    elif kind == "fadeOut":
        cls, pid, sub = "exit", 10, 0
    else:
        raise ValueError(kind)
    g = c.gid(spid, is_sp)
    outer = c.nid()
    kids = ""
    if cls == "entr":
        kids += set_vis(c, spid, "visible")
        if kind == "fade":
            kids += anim_effect(c, spid, "in", "fade", dur)
        elif kind == "wipeR":
            kids += anim_effect(c, spid, "in", "wipe(left)", dur)
        elif kind == "zoom":
            kids += anim_prop(c, spid, "ppt_w", 0, "#ppt_w", dur)
            kids += anim_prop(c, spid, "ppt_h", 0, "#ppt_h", dur)
            kids += anim_effect(c, spid, "in", "fade", dur)
        else:  # float in
            dirn = e.get("dir") or "b"
            fx_, fy_ = "#ppt_x", "#ppt_y"
            if dirn == "b": fy_ = "#ppt_y+.06"
            elif dirn == "l": fx_ = "#ppt_x-.05"
            elif dirn == "r": fx_ = "#ppt_x+.05"
            kids += anim_effect(c, spid, "in", "fade", dur)
            kids += anim_prop(c, spid, "ppt_x", fx_, "#ppt_x", dur)
            kids += anim_prop(c, spid, "ppt_y", fy_, "#ppt_y", dur)
    elif cls == "path":
        pts = e.get("pts") or [[e["dx"], e["dy"]]]
        pt_types = "A" * (len(pts) + 1)
        segs = " ".join(f"L {px / W_IN:.5f} {py / H_IN:.5f}" for px, py in pts)
        kids += (f'<p:animMotion origin="layout" path="M 0 0 {segs} E" pathEditMode="relative" ptsTypes="{pt_types}">'
                 f'<p:cBhvr><p:cTn id="{c.nid()}" dur="{dur}" fill="hold"/>{tgt(spid)}'
                 f'<p:attrNameLst><p:attrName>ppt_x</p:attrName><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr></p:animMotion>')
    elif cls == "emph":
        kids += (f'<p:animScale><p:cBhvr><p:cTn id="{c.nid()}" dur="250" autoRev="1" fill="hold"/>{tgt(spid)}</p:cBhvr>'
                 f'<p:by x="108000" y="108000"/></p:animScale>')
    else:  # exit fade
        kids += anim_effect(c, spid, "out", "fade", dur)
        kids += set_vis(c, spid, "hidden", delay=max(dur - 1, 0))
    extra = ' accel="50000" decel="50000"' if cls == "path" else ""
    return (f'<p:par><p:cTn id="{outer}" presetID="{pid}" presetClass="{cls}" presetSubtype="{sub}" fill="hold" grpId="{g}" nodeType="{node}"{extra}>'
            f'<p:stCondLst><p:cond delay="{d}"/></p:stCondLst><p:childTnLst>{kids}</p:childTnLst></p:cTn></p:par>')

def build_timing(spec, names, sp_ids):
    c = Ctx()
    steps_xml = ""
    for st in spec["steps"]:
        fxs = [e for e in st["fx"] if e["n"] in names]
        missing = [e["n"] for e in st["fx"] if e["n"] not in names]
        if missing:
            print("  MISSING:", missing)
        if not fxs:
            continue
        o1, o2 = c.nid(), c.nid()
        inner = ""
        for k, e in enumerate(fxs):
            node = "withEffect" if (st["auto"] or k > 0) else "clickEffect"
            inner += effect(c, e, names[e["n"]], names[e["n"]] in sp_ids, node)
        cond = '<p:cond delay="indefinite"/>'
        if st["auto"] and steps_xml == "":
            cond += '<p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>'
        steps_xml += (f'<p:par><p:cTn id="{o1}" fill="hold"><p:stCondLst>{cond}</p:stCondLst><p:childTnLst>'
                      f'<p:par><p:cTn id="{o2}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>{inner}'
                      f'</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>')
    seqs = ""
    if steps_xml:
        seqs += (f'<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>{steps_xml}</p:childTnLst></p:cTn>'
                 '<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>'
                 '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>')
    for tr in spec["triggers"]:
        tid = names[tr["trig"]]
        s_id, o1, o2 = c.nid(), c.nid(), c.nid()
        inner = "".join(effect(c, e, names[e["n"]], names[e["n"]] in sp_ids, "clickEffect" if k == 0 else "withEffect") for k, e in enumerate(tr["fx"]))
        seqs += (f'<p:seq concurrent="1" nextAc="seek"><p:cTn id="{s_id}" restart="whenNotActive" fill="hold" evtFilter="cancelBubble" nodeType="interactiveSeq">'
                 f'<p:stCondLst><p:cond evt="onClick" delay="0">{tgt(tid)}</p:cond></p:stCondLst>'
                 '<p:endSync evt="end" delay="0"><p:rtn val="all"/></p:endSync><p:childTnLst>'
                 f'<p:par><p:cTn id="{o1}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>'
                 f'<p:par><p:cTn id="{o2}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>{inner}'
                 '</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn>'
                 f'<p:nextCondLst><p:cond evt="onClick" delay="0">{tgt(tid)}</p:cond></p:nextCondLst></p:seq>')
    if not seqs:
        return ""
    bld = "".join(f'<p:bldP spid="{s}" grpId="{g}" animBg="1"/>' for s, g in c.bld)
    bld += "".join(f'<p:bldGraphic spid="{s}" grpId="{g}"><p:bldAsOne/></p:bldGraphic>' for s, g in c.bldg)
    return (f'<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>{seqs}'
            f'</p:childTnLst></p:cTn></p:par></p:tnLst>' + (f'<p:bldLst>{bld}</p:bldLst>' if bld else "") + '</p:timing>')

def transition(kind):
    if kind == "morph":
        return ('<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">'
                '<mc:Choice xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/09/main" Requires="p159">'
                '<p:transition spd="slow"><p159:morph option="byObject"/></p:transition></mc:Choice>'
                '<mc:Fallback><p:transition spd="slow"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>')
    return '<p:transition spd="med"><p:fade/></p:transition>'

tmp = DST + ".work"
shutil.rmtree(tmp, ignore_errors=True)
with zipfile.ZipFile(SRC) as z:
    z.extractall(tmp)

for n_str, spec in ANIM.items():
    n = int(n_str)
    LINKS = spec.get("links", {})
    p = f"{tmp}/ppt/slides/slide{n}.xml"
    x = open(p, encoding="utf-8").read()
    # name -> id, and which are <p:sp>
    names, sp_ids = {}, set()
    gf_ids = set()
    for m in re.finditer(r'<p:(sp|pic|cxnSp|graphicFrame)>\s*<p:nv\w+Pr>\s*<p:cNvPr id="(\d+)" name="([^"]*)"', x):
        kind, i, nm = m.group(1), m.group(2), m.group(3)
        if nm in names:
            print(f"  slide {n}: duplicate name {nm}")
        names[nm] = i
        if kind == "graphicFrame":
            gf_ids.add(i)
        if kind == "sp":
            end = x.find("</p:sp>", m.end())
            if "<p:txBody>" in x[m.end():end]:
                sp_ids.add(i)
    # Japanese language tagging / charset
    x = x.replace('lang="en-US"', 'lang="ja-JP" altLang="en-US"').replace('charset="-122"', 'charset="-128"')
    # slide-jump hyperlinks
    relp = f"{tmp}/ppt/slides/_rels/slide{n}.xml.rels"
    rels = open(relp, encoding="utf-8").read()
    def fix_link(m):
        global rels
        block = m.group(0)
        nm = re.search(r'name="([^"]*)"', block).group(1)
        if nm not in LINKS:
            return block
        rid = f"rIdJump{LINKS[nm]}"
        if rid not in rels:
            rels = rels.replace("</Relationships>", f'<Relationship Id="{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slide{LINKS[nm]}.xml"/></Relationships>')
        i = block.find("<p:txBody>")
        head, body = block[:i], block[i:]
        body = re.sub(r'<a:hlinkClick[^>]*?/>|<a:hlinkClick[^>]*?>.*?</a:hlinkClick>', '', body, flags=re.S).replace(' u="sng"', '')
        return head.replace('r:id="rIdundefined"', f'r:id="{rid}"') + body
    x = re.sub(r'<p:sp>(?:(?!</p:sp>).)*?</p:sp>', lambda m: fix_link(m) if re.search(r'name="([^"]*)"', m.group(0)).group(1) in LINKS else m.group(0), x, flags=re.S)
    open(relp, "w", encoding="utf-8").write(rels)
    assert "rIdundefined" not in x, f"slide {n} has unresolved link"
    GF_IDS = gf_ids
    timing = build_timing(spec, names, sp_ids)
    x = x.replace("</p:clrMapOvr>", "</p:clrMapOvr>" + transition(spec["transition"]) + timing, 1)
    open(p, "w", encoding="utf-8").write(x)
    print(f"slide {n}: {spec['transition']}, steps={len(spec['steps'])}, triggers={len(spec['triggers'])}")

# also fix lang in notes
for root, _, files in os.walk(f"{tmp}/ppt/notesSlides"):
    for f in files:
        if f.endswith(".xml"):
            q = os.path.join(root, f)
            t = open(q, encoding="utf-8").read().replace('lang="en-US"', 'lang="ja-JP" altLang="en-US"')
            open(q, "w", encoding="utf-8").write(t)

if os.path.exists(DST):
    os.remove(DST)
with zipfile.ZipFile(DST, "w", zipfile.ZIP_DEFLATED) as z:
    # [Content_Types].xml first
    z.write(f"{tmp}/[Content_Types].xml", "[Content_Types].xml")
    for root, _, files in os.walk(tmp):
        for f in files:
            full = os.path.join(root, f)
            arc = os.path.relpath(full, tmp)
            if arc != "[Content_Types].xml":
                z.write(full, arc)
print("wrote", DST)
shutil.rmtree(tmp, ignore_errors=True)
```