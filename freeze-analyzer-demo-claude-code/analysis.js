// 冷凍試験CSVの読み込みと指標の計算（画面に依存しない部分）
// ブラウザでは window.FreezeAnalysis、Node では require('./analysis.js') で使う。
(function (root) {
  'use strict';

  const DEFAULT_SETTINGS = {
    upper: -1,       // 最大氷結晶生成帯の上限 [℃]
    lower: -5,       // 同 下限 [℃]
    target: -18,     // 目標温度 [℃]
    criterion: 30,   // 帯の通過時間の基準 [分]（以下なら合格）
  };

  // 評価する列（品温の中心）を自動で選ぶときのキーワード（先にあるほど優先）
  const TARGET_KEYWORDS = ['中心', '品温', 'CH1', '試料', 'product', 'core'];

  // ---- 文字コード -----------------------------------------------------------
  function decodeBytes(bytes) {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return { text: text.replace(/^﻿/, ''), encoding: 'UTF-8' };
    } catch (e) {
      return { text: new TextDecoder('shift_jis').decode(bytes), encoding: 'Shift-JIS' };
    }
  }

  // ---- CSV ------------------------------------------------------------------
  function parseCSV(text) {
    const delim = detectDelimiter(text);
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === delim) { row.push(cell.trim()); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell.trim()); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell.trim()); rows.push(row); }
    return rows;
  }

  function detectDelimiter(text) {
    const sample = text.slice(0, 4000);
    const count = (c) => sample.split(c).length;
    if (count('\t') > count(',')) return '\t';
    if (count(';') > count(',')) return ';';
    return ',';
  }

  const DATE_RE = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})[ T]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/;
  const TIME_ONLY_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

  function toNumber(s) {
    if (s === undefined || s === null) return NaN;
    const t = String(s).replace(/[℃°C\s]/g, '');
    if (t === '' || t === '-' || /^(NaN|N\/A|---|Err.*)$/i.test(t)) return NaN;
    return /^[+\-]?(\d+\.?\d*|\.\d+)(e[+\-]?\d+)?$/i.test(t) ? Number(t) : NaN;
  }

  function isTimeCell(s) {
    return DATE_RE.test(s) || TIME_ONLY_RE.test(s) || !isNaN(toNumber(s));
  }

  // 表の始まり（見出し行）を探す。先頭の機器情報などは読み飛ばす
  function detectTable(rows) {
    const numericCount = (r) => r.slice(1).filter((c) => !isNaN(toNumber(c))).length;
    const isDataRow = (r) => r && r.length >= 2 && isTimeCell(r[0]) && numericCount(r) >= 1;
    for (let i = 0; i < rows.length; i++) {
      if (!isDataRow(rows[i])) continue;
      // 続く数行もデータ行なら、ここが表の始まり
      const next = rows.slice(i, i + 4).filter((r) => r.length > 1);
      if (!next.every(isDataRow)) continue;
      const width = rows[i].length;
      const prev = rows[i - 1];
      const hasHeader = prev && prev.length >= width && numericCount(prev) === 0;
      const headers = hasHeader
        ? prev.slice(0, width).map((h, k) => h || `列${k + 1}`)
        : ['時刻'].concat(rows[i].slice(1).map((_, k) => `CH${k + 1}`));
      return { headerIndex: hasHeader ? i - 1 : -1, dataStart: i, headers };
    }
    return null;
  }

  // 時刻の列 → 開始からの経過時間[分]
  function parseTimes(cells, header) {
    const first = cells.find((c) => c !== '');
    if (first !== undefined && DATE_RE.test(first)) {
      const ms = cells.map((c) => {
        const m = DATE_RE.exec(c);
        if (!m) return NaN;
        return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0), +(m[7] || 0)).getTime();
      });
      const t0 = ms.find((x) => !isNaN(x));
      return { minutes: ms.map((x) => (x - t0) / 60000), kind: '日時', startMs: t0 };
    }
    if (first !== undefined && TIME_ONLY_RE.test(first)) {
      let dayOffset = 0, prev = null;
      const mins = cells.map((c) => {
        const m = TIME_ONLY_RE.exec(c);
        if (!m) return NaN;
        let v = +m[1] * 60 + +m[2] + (+(m[3] || 0)) / 60;
        if (prev !== null && v + dayOffset < prev - 1) dayOffset += 1440; // 日付をまたいだ
        v += dayOffset; prev = v;
        return v;
      });
      const t0 = mins.find((x) => !isNaN(x));
      return { minutes: mins.map((x) => x - t0), kind: '時刻' };
    }
    // 数値: 見出しで単位を判断（秒・時間・分。なければ分）
    let scale = 1, unit = '分';
    if (/秒|sec|\(s\)|\[s\]/i.test(header)) { scale = 1 / 60; unit = '秒'; }
    else if (/時間\s*[\(\[（]?\s*h|\(h\)|\[h\]|hour|hr/i.test(header)) { scale = 60; unit = '時間'; }
    const nums = cells.map(toNumber);
    const t0 = nums.find((x) => !isNaN(x));
    return { minutes: nums.map((x) => (x - t0) * scale), kind: `経過時間(${unit})` };
  }

  function parseFile(name, text, encoding) {
    const rows = parseCSV(text);
    const table = detectTable(rows);
    if (!table) throw new Error('温度データの表が見つかりませんでした');
    const data = rows.slice(table.dataStart).filter((r) => r.length >= 2 && r[0] !== '');
    const time = parseTimes(data.map((r) => r[0]), table.headers[0]);
    const channels = table.headers.slice(1).map((h, k) => ({
      name: h,
      raw: data.map((r) => toNumber(r[k + 1])),
    })).filter((ch) => ch.raw.some((v) => !isNaN(v)));

    const meta = {};
    rows.slice(0, table.headerIndex >= 0 ? table.headerIndex : table.dataStart).forEach((r) => {
      if (r.length >= 2 && r[0]) meta[r[0]] = r.slice(1).join(' ');
    });
    const steps = [];
    for (let i = 1; i < Math.min(time.minutes.length, 50); i++) steps.push(time.minutes[i] - time.minutes[i - 1]);
    const interval = median(steps.filter((x) => x > 0));

    return {
      name: name.replace(/\.(csv|txt|tsv)$/i, ''),
      fileName: name,
      encoding: encoding || '',
      timeKind: time.kind,
      startMs: time.startMs,
      intervalMin: interval,
      t: time.minutes,
      channels: channels.map((ch) => Object.assign(ch, cleanSeries(ch.raw))),
      meta,
    };
  }

  // ---- データの掃除 ----------------------------------------------------------
  // 欠測（空欄）と外れ値（前と後ろの両方から大きく外れる点・ありえない値）を除く
  function cleanSeries(raw, opts) {
    const o = Object.assign({ window: 3, jump: 15, min: -150, max: 150 }, opts);
    const values = raw.slice();
    let missing = 0, outliers = 0;
    const outlierIdx = [];
    for (let i = 0; i < raw.length; i++) {
      const v = raw[i];
      if (isNaN(v)) { missing++; continue; }
      if (v <= o.min || v >= o.max || v === -99.9 || v === 999.9) {
        values[i] = NaN; outliers++; outlierIdx.push(i); continue;
      }
      const side = (from, to) => {
        const a = [];
        for (let k = from; k <= to; k++) if (k >= 0 && k < raw.length && !isNaN(raw[k])) a.push(raw[k]);
        return median(a);
      };
      const before = side(i - o.window, i - 1), after = side(i + 1, i + o.window);
      // 急冷中の大きな変化を外れ値と間違えないよう、前後どちらからも外れているときだけ除く
      if (!isNaN(before) && !isNaN(after) &&
          Math.abs(v - before) > o.jump && Math.abs(v - after) > o.jump) {
        values[i] = NaN; outliers++; outlierIdx.push(i);
      }
    }
    return { values, missing, outliers, outlierIdx };
  }

  function median(arr) {
    if (!arr.length) return NaN;
    const s = arr.slice().sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  // ---- 評価する列 ------------------------------------------------------------
  function pickTargetChannel(channels, preferred) {
    if (preferred) {
      const hit = channels.find((c) => c.name === preferred);
      if (hit) return hit;
    }
    for (const kw of TARGET_KEYWORDS) {
      const hit = channels.find((c) => c.name.toLowerCase().includes(kw.toLowerCase()));
      if (hit) return hit;
    }
    return channels[0];
  }

  // ---- 指標 -----------------------------------------------------------------
  // しきい値を「最後に」下回った時刻（その後ずっと下回ったまま）。線形補間する。
  // 最初から下回っていれば 0、最後まで下回らなければ null。
  function finalCrossing(t, v, th) {
    let last = -1, lastValid = -1;
    for (let i = 0; i < v.length; i++) {
      if (isNaN(v[i])) continue;
      lastValid = i;
      if (v[i] > th) last = i;
    }
    if (lastValid < 0) return null;
    if (last < 0) return 0;
    if (last === lastValid) return null;
    let j = last + 1;
    while (isNaN(v[j])) j++;
    const r = (v[last] - th) / (v[last] - v[j]);
    return t[last] + r * (t[j] - t[last]);
  }

  // 過冷却: 0℃以下で一度下がりきってから急に温度が上がる点を探す
  function findSupercooling(t, v, opts) {
    const o = Object.assign({ rise: 0.5, lookAheadMin: 15, below: 0 }, opts);
    let minIdx = -1;
    for (let i = 0; i < v.length; i++) {
      if (isNaN(v[i]) || v[i] > o.below) continue;
      if (minIdx < 0 || v[i] < v[minIdx]) minIdx = i;
      // minIdx 以降で十分な上昇があれば過冷却の解除とみなす
      if (v[i] - v[minIdx] >= o.rise) {
        let peak = i;
        for (let k = i; k < v.length && t[k] - t[minIdx] <= o.lookAheadMin; k++) {
          if (!isNaN(v[k]) && v[k] > v[peak]) peak = k;
        }
        return {
          minTemp: v[minIdx], minTime: t[minIdx],
          releaseTemp: v[peak], releaseTime: t[peak],
          depth: v[peak] - v[minIdx],
        };
      }
      // 帯の下限よりかなり下がっても上昇がなければ、過冷却はなかった
      if (v[i] < v[minIdx] + 0.01 && v[i] < -15) break;
    }
    return null;
  }

  function analyze(t, v, settings) {
    const s = Object.assign({}, DEFAULT_SETTINGS, settings);
    const valid = v.map((x, i) => [t[i], x]).filter((p) => !isNaN(p[1]));
    if (valid.length < 2) return { judge: 'データ不足' };
    const temps = valid.map((p) => p[1]);
    const bandIn = finalCrossing(t, v, s.upper);
    const bandOut = finalCrossing(t, v, s.lower);
    const targetTime = finalCrossing(t, v, s.target);
    const startTemp = temps[0];
    const passTime = bandIn !== null && bandOut !== null ? bandOut - bandIn : null;
    let judge;
    if (bandOut === null) judge = '未到達';
    else if (bandIn === 0 && startTemp <= s.lower) judge = '判定不可';
    else judge = passTime <= s.criterion ? '合格' : '不合格';

    return {
      judge,
      startTemp,
      minTemp: Math.min.apply(null, temps),
      endTemp: temps[temps.length - 1],
      duration: valid[valid.length - 1][0] - valid[0][0],
      bandIn, bandOut, passTime, targetTime,
      // 開始から目標温度までの平均冷却速度 [℃/分]
      avgRate: targetTime ? (startTemp - s.target) / targetTime : null,
      // 帯の中の冷却速度 [℃/分]
      bandRate: passTime ? (s.upper - s.lower) / passTime : null,
      supercool: findSupercooling(t, v),
    };
  }

  // 1ファイル分の結果をまとめる
  function analyzeTrial(trial, settings, preferredChannel) {
    const ch = pickTargetChannel(trial.channels, preferredChannel);
    const result = analyze(trial.t, ch.values, settings);
    const missing = trial.channels.reduce((a, c) => a + c.missing, 0);
    const outliers = trial.channels.reduce((a, c) => a + c.outliers, 0);
    return Object.assign(result, { channel: ch.name, missing, outliers });
  }

  // 結果の表をCSV（Excelで開けるようBOM付きUTF-8）にする
  function resultsToCSV(items, settings) {
    const s = Object.assign({}, DEFAULT_SETTINGS, settings);
    const f = (x, d) => (x === null || x === undefined || isNaN(x) ? '' : x.toFixed(d === undefined ? 1 : d));
    const head = ['試験名', '評価した列', '判定', `通過時間[分](${s.upper}〜${s.lower}℃)`, '帯に入った時刻[分]',
      '帯を抜けた時刻[分]', `${s.target}℃到達[分]`, '平均冷却速度[℃/分]', '帯の冷却速度[℃/分]',
      '過冷却の最低温度[℃]', '過冷却の深さ[℃]', '開始温度[℃]', '最低温度[℃]', '外れ値[点]', '欠測[点]', 'ファイル名'];
    const lines = [head];
    items.forEach(({ trial, result: r }) => {
      lines.push([trial.name, r.channel, r.judge, f(r.passTime), f(r.bandIn), f(r.bandOut), f(r.targetTime),
        f(r.avgRate, 2), f(r.bandRate, 2), r.supercool ? f(r.supercool.minTemp) : '',
        r.supercool ? f(r.supercool.depth) : '', f(r.startTemp), f(r.minTemp), r.outliers, r.missing, trial.fileName]);
    });
    const esc = (c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c);
    return '﻿' + lines.map((l) => l.map(esc).join(',')).join('\r\n') + '\r\n';
  }

  const API = {
    DEFAULT_SETTINGS, decodeBytes, parseCSV, detectTable, parseFile, cleanSeries,
    pickTargetChannel, finalCrossing, findSupercooling, analyze, analyzeTrial, resultsToCSV,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.FreezeAnalysis = API;
})(typeof window !== 'undefined' ? window : this);
