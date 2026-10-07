// JS実装の計算結果を Python 実装の期待値と照合する
const fs = require("fs"), path = require("path");
const A = require("./analysis.js");
const exp = JSON.parse(fs.readFileSync(path.join(__dirname, "expected.json"), "utf8"));
const dir = path.join(__dirname, "dummy");
let fail = 0, n = 0;
const close = (a, b, tol) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) <= tol);
for (const f of fs.readdirSync(dir).sort()) {
  const tr = A.parseTrial(A.decode(fs.readFileSync(path.join(dir, f))), f);
  const id = f.slice(0, 3);
  const ci = A.pickChannel(tr.channels);
  const m = A.metrics(tr.t, tr.channels[ci].raw);
  const e = exp[id];
  const checks = [
    ["チャンネル数", tr.channels.length, 3, 0],
    ["評価CH", tr.channels[ci].name, "CH1 品温中心(℃)", null],
    ["通過時間", m.pass, e.pass_min, 0.01],
    ["−18℃到達", m.reach, e.reach_min, 0.01],
    ["過冷却 時刻", m.supercool && m.supercool.t, e.supercool_t, 0.01],
    ["過冷却 温度", m.supercool && m.supercool.T, e.supercool_T, 0.001],
    ["冷却速度", m.rate, e.rate, 0.001],
    ["外れ値", m.flags.length, e.outliers, 0],
  ];
  for (const [name, got, want, tol] of checks) {
    n++;
    const ok = tol == null ? got === want : close(got, want, tol);
    if (!ok) { fail++; console.log(`NG ${id} ${name}: got ${got} want ${want}`); }
  }
  console.log(`${id} ${tr.label} | 通過 ${m.pass && m.pass.toFixed(1)}分 | 到達 ${m.reach && m.reach.toFixed(1)}分 | ${m.judge} (${m.reason}) | 外れ値 ${m.flags.length}`);
}
// 形式違いの確認: UTF-8・ヘッダーなし・経過秒
const alt = "経過時間(秒),中心,庫内\n0,20,-30\n30,15,-30\n60,9,-30\n90,0,-30\n120,-3,-30\n150,-6,-30\n180,-20,-30\n";
const tr2 = A.parseTrial(alt, "alt.csv");
n++; if (!(tr2.t[2] === 1 && tr2.channels.length === 2)) { fail++; console.log("NG 経過秒形式", tr2.t, tr2.channels.length); }
console.log(`\n${n - fail}/${n} 件 OK`);
process.exit(fail ? 1 : 0);
