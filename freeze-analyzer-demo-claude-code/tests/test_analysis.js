// ダミーデータで計算をテストする:  node tests/test_analysis.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const A = require('../analysis.js');

const dir = path.join(__dirname, '..', 'sample_data');
const load = (f) => {
  const { text, encoding } = A.decodeBytes(fs.readFileSync(path.join(dir, f)));
  return A.parseFile(f, text, encoding);
};
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.csv')).sort();
const trials = Object.fromEntries(files.map((f) => [f[2], load(f)])); // 「試験A」の A をキーに
const res = Object.fromEntries(Object.entries(trials).map(([k, t]) => [k, A.analyzeTrial(t, {})]));

let failed = 0;
const check = (name, fn) => {
  try { fn(); console.log('  ok  ', name); } catch (e) { failed++; console.log('  NG  ', name, '\n       ', e.message); }
};
const near = (actual, expected, tol, label) =>
  assert.ok(actual !== null && Math.abs(actual - expected) <= tol, `${label}: ${actual} (期待 ${expected}±${tol})`);

console.log('\n[読み込み]');
check('6ファイルとも読める', () => assert.strictEqual(files.length, 6));
check('Shift-JIS を判定', () => assert.strictEqual(trials.A.encoding, 'Shift-JIS'));
check('UTF-8 を判定', () => assert.strictEqual(trials.F.encoding, 'UTF-8'));
check('先頭の機器情報を読み飛ばし、見出しを取れる', () =>
  assert.deepStrictEqual(trials.A.channels.map((c) => c.name), ['CH1 中心温度[℃]', 'CH2 表面温度[℃]', 'CH3 庫内温度[℃]']));
check('機器情報をメタデータに入れる', () => assert.strictEqual(trials.A.meta['記録間隔'], '30秒'));
check('日時 → 経過分（30秒間隔）', () => { near(trials.A.intervalMin, 0.5, 1e-9, '間隔'); near(trials.A.t[300], 150, 1e-9, '末尾'); });
check('経過時間(分)の書式・60秒間隔', () => { assert.strictEqual(trials.F.timeKind, '経過時間(分)'); near(trials.F.intervalMin, 1, 1e-9, '間隔'); });
check('評価する列を自動で選ぶ', () => {
  assert.strictEqual(res.A.channel, 'CH1 中心温度[℃]');
  assert.strictEqual(res.F.channel, '品温(中心)');
});

console.log('\n[データの掃除]');
check('スパイク(85℃)を3点除く', () => assert.strictEqual(trials.E.channels[0].outliers, 3));
check('-99.9 を外れ値、空欄を欠測にする', () => {
  assert.strictEqual(trials.E.channels[1].outliers, 1);
  assert.strictEqual(trials.E.channels[1].missing, 2);
});
check('正常なデータ（急冷の庫内温度を含む）は外れ値にしない', () => {
  ['A', 'B', 'C', 'D', 'F'].forEach((k) => trials[k].channels.forEach((c) =>
    assert.strictEqual(c.outliers + c.missing, 0, `${k} ${c.name}`)));
});

console.log('\n[指標]');
check('しきい値の最後の通過を補間で求める', () => {
  const t = [0, 1, 2, 3, 4], v = [10, 0, -2, -1, -4];
  near(A.finalCrossing(t, v, -1.5), 3 + 0.5 / 3, 1e-9, '補間');
  assert.strictEqual(A.finalCrossing(t, v, -10), null);
  assert.strictEqual(A.finalCrossing(t, v, 20), 0);
});
// make_dummy.py の結果から見た期待値（Python 側で別に計算した値）
check('試験A: 通過 約8.5分 → 合格', () => { near(res.A.passTime, 8.5, 1, '通過'); assert.strictEqual(res.A.judge, '合格'); });
check('試験B: 通過 30分超 → 不合格', () => { assert.ok(res.B.passTime > 30, String(res.B.passTime)); assert.strictEqual(res.B.judge, '不合格'); });
check('試験C: 通過 約89分 → 不合格', () => { near(res.C.passTime, 89, 1.5, '通過'); assert.strictEqual(res.C.judge, '不合格'); });
check('試験C: -18℃ 到達 約233分', () => near(res.C.targetTime, 233.5, 1.5, '到達'));
check('試験D: 過冷却（約-6.5℃まで）を検出', () => {
  assert.ok(res.D.supercool, '過冷却なし');
  near(res.D.supercool.minTemp, -6.5, 0.3, '最低');
  assert.ok(res.D.supercool.depth > 4, `深さ ${res.D.supercool.depth}`);
});
check('試験D: 過冷却で-5℃を一度下回っても、最後の通過で判定する', () => {
  near(res.D.passTime, 18.5, 1.5, '通過');
  assert.ok(res.D.bandOut > res.D.supercool.releaseTime, '帯を抜けた時刻が過冷却の解除より前');
});
check('過冷却のない試験では検出しない', () => ['A', 'B', 'C', 'E', 'F'].forEach((k) =>
  assert.strictEqual(res[k].supercool, null, k)));
check('試験E: 外れ値を除いて通過 約15分 → 合格', () => { near(res.E.passTime, 15, 1, '通過'); assert.strictEqual(res.E.judge, '合格'); });
check('試験F: 通過 約7分 → 合格', () => { near(res.F.passTime, 7, 1, '通過'); assert.strictEqual(res.F.judge, '合格'); });
check('設定を変えると判定が変わる（基準60分なら試験Bは合格）', () =>
  assert.strictEqual(A.analyzeTrial(trials.B, { criterion: 60 }).judge, '合格'));
check('目標温度に届かなければ「未到達」', () => {
  assert.strictEqual(A.analyzeTrial(trials.C, { lower: -25 }).judge, '未到達');
  assert.strictEqual(A.analyzeTrial(trials.C, { target: -40 }).targetTime, null);
});
check('結果をCSVにできる', () => {
  const csv = A.resultsToCSV(Object.entries(trials).map(([k, t]) => ({ trial: t, result: res[k] })), {});
  assert.ok(csv.startsWith('﻿試験名,'));
  assert.strictEqual(csv.trim().split('\r\n').length, 7);
});

console.log('\n[結果一覧]');
console.table(Object.fromEntries(Object.entries(res).map(([k, r]) => [k, {
  判定: r.judge, 通過分: r.passTime && +r.passTime.toFixed(1), 到達分: r.targetTime && +r.targetTime.toFixed(1),
  過冷却: r.supercool ? +r.supercool.minTemp.toFixed(1) : '-', 外れ値: r.outliers, 欠測: r.missing,
}])));

console.log(failed ? `\n${failed} 件 失敗` : '\nすべて成功');
process.exit(failed ? 1 : 0);
