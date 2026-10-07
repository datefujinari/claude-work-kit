/* 冷凍試験 解析ロジック（ブラウザ・Node 共通） */
(function (root) {
  "use strict";

  function decode(bytes) {
    try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, ""); }
    catch (e) { return new TextDecoder("shift_jis").decode(bytes); }
  }

  function splitLine(line) {
    const out = []; let cur = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === "," || ch === "\t") { out.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  }

  const isNum = (s) => s !== "" && s != null && isFinite(Number(s));

  function parseTime(s) {
    const m = String(s).match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?/);
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0) / 60000 + (m[6] ? +m[6] / 60 : 0);
    const h = String(s).match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
    if (h) return (+h[1]) * 60 + (+h[2]) + (h[3] ? +h[3] / 60 : 0);
    return isNum(s) ? Number(s) : NaN;
  }

  /** CSVテキスト → 試験データ */
  function parseTrial(text, fileName) {
    const lines = text.split(/\r?\n/);
    const rows = lines.map(splitLine);
    const numericCount = (r) => r.slice(1).filter(isNum).length;
    let hdr = -1;
    for (let i = 0; i < rows.length - 1; i++) {
      const r = rows[i], nx = rows[i + 1];
      if (r.length >= 2 && numericCount(r) === 0 && numericCount(nx) >= 1 && !isNaN(parseTime(nx[0]))) { hdr = i; break; }
    }
    if (hdr < 0) throw new Error("温度の列が見つかりませんでした。1列目が時刻、2列目以降が温度の形式か確認してください。");
    const meta = {};
    for (let i = 0; i < hdr; i++) {
      const r = rows[i];
      if (r.length >= 2 && r[0]) meta[r[0]] = r.slice(1).filter(Boolean).join(" ");
    }
    const header = rows[hdr];
    const secUnit = /秒|\(s\)|\[s\]|sec/i.test(header[0]) && !/日時|時刻/.test(header[0]);
    const t = []; const cols = header.slice(1).map(() => []);
    let t0 = null;
    for (let i = hdr + 1; i < rows.length; i++) {
      const r = rows[i];
      if (r.length < 2 || r.every((c) => c === "")) continue;
      let tv = parseTime(r[0]);
      if (isNaN(tv)) break;
      if (secUnit) tv /= 60;
      if (t0 === null) t0 = tv;
      t.push(+(tv - t0).toFixed(4));
      cols.forEach((c, j) => c.push(isNum(r[j + 1]) ? Number(r[j + 1]) : NaN));
    }
    const channels = header.slice(1).map((name, j) => ({ name: name || `CH${j + 1}`, raw: cols[j] }))
      .filter((c) => c.raw.some((v) => !isNaN(v)));
    const label = meta["試験名"] || String(fileName || "試験").replace(/\.[^.]+$/, "");
    return { label, fileName, meta, t, channels };
  }

  /** 外れ値: 前後の点を結んだ線から 5℃以上 同じ向きに外れた 1〜3 点。線形補間で置換 */
  function despike(src, thr) {
    thr = thr || 5;
    const y = src.slice(); const n = y.length; const flags = [];
    // 欠測(NaN)は前後で補間
    for (let i = 0; i < n; i++) if (isNaN(y[i])) {
      let a = i - 1, b = i + 1;
      while (b < n && isNaN(y[b])) b++;
      const va = a >= 0 ? y[a] : y[b], vb = b < n ? y[b] : va;
      y[i] = va + (vb - va) * (i - a) / (b - a);
    }
    let i = 1;
    while (i < n - 1) {
      let hit = 0;
      for (let w = 1; w <= 3; w++) {
        if (i + w >= n) break;
        const a = y[i - 1], b = y[i + w];
        if (Math.abs(a - b) >= thr) continue;
        const dev = [];
        for (let k = 0; k < w; k++) dev.push(y[i + k] - (a + (b - a) * (k + 1) / (w + 1)));
        if (dev.every((d) => d > thr) || dev.every((d) => d < -thr)) { hit = w; break; }
      }
      if (hit) {
        const a = y[i - 1], b = y[i + hit];
        for (let k = 0; k < hit; k++) { y[i + k] = a + (b - a) * (k + 1) / (hit + 1); flags.push(i + k); }
        i += hit;
      } else i++;
    }
    return { y, flags };
  }

  /** 最後に th を下回った時刻（線形補間）。以降 th を上回らない */
  function lastDownCross(t, y, th) {
    if (y[y.length - 1] > th) return null;
    let k = -1;
    for (let i = 1; i < y.length; i++) if (y[i - 1] > th && th >= y[i]) k = i;
    if (k < 0) return y[0] <= th ? t[0] : null;
    return t[k - 1] + (th - y[k - 1]) * (t[k] - t[k - 1]) / (y[k] - y[k - 1]);
  }

  function supercool(t, y) {
    for (let i = 1; i < y.length - 1; i++) {
      if (y[i] < 0 && y[i] <= y[i - 1] && y[i] <= y[i + 1]) {
        const ahead = y.slice(i + 1, i + 11);
        if (Math.max.apply(null, ahead) - y[i] >= 0.3) return { t: t[i], T: y[i] };
      }
    }
    return null;
  }

  const DEFAULTS = { zoneHi: -1, zoneLo: -5, target: -18, passLimit: 30 };

  function metrics(t, raw, opt) {
    const o = Object.assign({}, DEFAULTS, opt || {});
    const { y, flags } = despike(raw);
    const a = lastDownCross(t, y, o.zoneHi);
    const b = lastDownCross(t, y, o.zoneLo);
    const g = lastDownCross(t, y, o.target);
    const sc = supercool(t, y);
    const pass = a != null && b != null ? b - a : null;
    const rate = b != null && g != null && g > b ? (o.zoneLo - o.target) / (g - b) : null;
    let judge, reason;
    if (pass == null) { judge = "ng"; reason = `${o.zoneLo}℃まで下がっていません`; }
    else if (pass > o.passLimit) { judge = "ng"; reason = `通過時間が${o.passLimit}分を超えています`; }
    else if (g == null) { judge = "warn"; reason = `記録内に${o.target}℃へ到達していません`; }
    else { judge = "ok"; reason = "基準を満たしています"; }
    return { y, flags, zoneIn: a, zoneOut: b, pass, reach: g, supercool: sc, rate, judge, reason,
      duration: t[t.length - 1], minT: Math.min.apply(null, y) };
  }

  function pickChannel(channels, hint) {
    if (hint != null) {
      const i = channels.findIndex((c) => c.name === hint);
      if (i >= 0) return i;
    }
    const i = channels.findIndex((c) => /中心|center|core/i.test(c.name));
    return i >= 0 ? i : 0;
  }

  const api = { decode, splitLine, parseTime, parseTrial, despike, lastDownCross, supercool, metrics, pickChannel, DEFAULTS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FreezeAnalysis = api;
})(typeof window !== "undefined" ? window : globalThis);
