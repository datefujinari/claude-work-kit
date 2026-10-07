// 画面の動き（読み込み・グラフ・表）。計算は analysis.js
(function () {
  'use strict';
  const A = window.FreezeAnalysis;
  const $ = (id) => document.getElementById(id);

  const PRESETS = {
    food: { upper: -1, lower: -5, target: -18, criterion: 30 },
    device: { upper: -1, lower: -5, target: -40, criterion: 30 },
  };
  const DASHES = ['solid', 'dash', 'dot', 'dashdot'];

  const state = {
    trials: [],          // { id, trial, slot }
    nextSlot: 0,
    settings: Object.assign({}, PRESETS.food),
    channel: '',
    selectedId: null,
    sort: { key: null, dir: 1 },
  };

  // ---- 読み込み -------------------------------------------------------------
  function addTrial(name, text, encoding) {
    const trial = A.parseFile(name, text, encoding);
    if (!trial.channels.length) throw new Error('温度の列がありません');
    // 同じ名前は置き換える（色は前のまま）
    const old = state.trials.find((x) => x.trial.name === trial.name);
    if (old) { old.trial = trial; return; }
    state.trials.push({ id: `t${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, trial, slot: state.nextSlot++ });
  }

  async function loadFiles(fileList) {
    const errors = [];
    for (const file of fileList) {
      try {
        const { text, encoding } = A.decodeBytes(new Uint8Array(await file.arrayBuffer()));
        addTrial(file.name, text, encoding);
      } catch (e) {
        errors.push(`${file.name}: ${e.message}`);
      }
    }
    showErrors(errors);
    render();
  }

  function loadSamples() {
    const errors = [];
    (window.SAMPLE_FILES || []).forEach((f) => {
      try { addTrial(f.name, f.text, '埋め込み'); } catch (e) { errors.push(`${f.name}: ${e.message}`); }
    });
    showErrors(errors);
    render();
  }

  function showErrors(list) {
    $('errors').textContent = list.length ? '読み込めなかったファイル: ' + list.join(' / ') : '';
  }

  // ---- 計算 -----------------------------------------------------------------
  function results() {
    return state.trials.map((x) => ({ ...x, result: A.analyzeTrial(x.trial, state.settings, state.channel) }));
  }

  // ---- 色・書式 -------------------------------------------------------------
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const seriesColor = (slot) => css(`--series-${(slot % 8) + 1}`);
  const seriesDash = (slot) => DASHES[Math.floor(slot / 8) % DASHES.length];
  const fmt = (x, d = 1) => (x === null || x === undefined || isNaN(x) ? '—' : x.toFixed(d));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function badge(judge) {
    if (judge === '合格') return '<span class="badge good">✓ 合格</span>';
    if (judge === '不合格') return '<span class="badge bad">✕ 不合格</span>';
    return `<span class="badge warn">! ${esc(judge)}</span>`;
  }

  function baseLayout(extra) {
    const text = css('--text-secondary'), grid = css('--grid');
    const axis = { gridcolor: grid, zerolinecolor: grid, linecolor: grid, tickfont: { color: text }, title: { font: { color: text } } };
    return Object.assign({
      paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
      font: { family: getComputedStyle(document.body).fontFamily, size: 12, color: css('--text-primary') },
      margin: { l: 56, r: 16, t: 8, b: 48 },
      xaxis: Object.assign({}, axis),
      yaxis: Object.assign({}, axis),
      hoverlabel: { bgcolor: css('--surface-1'), bordercolor: css('--border'), font: { color: css('--text-primary') } },
      legend: { orientation: 'h', y: -0.18, font: { color: text } },
    }, extra);
  }

  const plotConfig = (name) => ({
    responsive: true, displaylogo: false,
    modeBarButtonsToRemove: ['select2d', 'lasso2d', 'autoScale2d'],
    toImageButtonOptions: { filename: name, scale: 2 },
  });

  // 帯（-1〜-5℃）の網掛けと目標温度の線
  function bandShapes() {
    const s = state.settings;
    return [
      { type: 'rect', xref: 'paper', x0: 0, x1: 1, y0: s.lower, y1: s.upper, fillcolor: css('--band'), line: { width: 0 }, layer: 'below' },
      { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: s.target, y1: s.target, line: { color: css('--text-muted'), width: 1, dash: 'dash' } },
    ];
  }
  function bandAnnotations() {
    const s = state.settings;
    return [
      { xref: 'paper', x: 1, y: s.upper, yanchor: 'bottom', xanchor: 'right', showarrow: false,
        text: `最大氷結晶生成帯 ${s.upper}〜${s.lower}℃`, font: { size: 11, color: css('--text-secondary') } },
      { xref: 'paper', x: 1, y: s.target, yanchor: 'bottom', xanchor: 'right', showarrow: false,
        text: `目標 ${s.target}℃`, font: { size: 11, color: css('--text-secondary') } },
    ];
  }

  // ---- 描画 -----------------------------------------------------------------
  function render() {
    const has = state.trials.length > 0;
    $('emptyState').classList.toggle('hidden', has);
    $('results').classList.toggle('hidden', !has);
    $('exportBtn').disabled = !has;
    renderChips();
    renderChannelOptions();
    if (!has) return;
    const items = results();
    if (!items.some((x) => x.id === state.selectedId)) state.selectedId = items[0].id;
    renderKpis(items);
    renderTable(items);
    if (!window.Plotly) return;
    renderOverlay(items);
    renderBars(items);
    renderDetail(items);
  }

  function renderChips() {
    $('chips').innerHTML = state.trials.map((x) =>
      `<span class="chip"><span class="sw" style="background:${seriesColor(x.slot)}"></span>${esc(x.trial.name)}` +
      `<button data-remove="${x.id}" title="外す" aria-label="${esc(x.trial.name)} を外す">×</button></span>`).join('');
  }

  function renderChannelOptions() {
    const names = [...new Set(state.trials.flatMap((x) => x.trial.channels.map((c) => c.name)))];
    const sel = $('channel');
    sel.innerHTML = '<option value="">自動（中心・品温を優先）</option>' +
      names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    sel.value = names.includes(state.channel) ? state.channel : '';
  }

  function renderKpis(items) {
    const pass = items.filter((x) => x.result.judge === '合格');
    const other = items.length - pass.length;
    const timed = items.filter((x) => x.result.passTime !== null);
    const best = timed.slice().sort((a, b) => a.result.passTime - b.result.passTime)[0];
    const worst = timed.slice().sort((a, b) => b.result.passTime - a.result.passTime)[0];
    const tile = (label, value, note) =>
      `<div class="kpi"><div class="label">${label}</div><div class="value">${value}</div><div class="note" title="${esc(note)}">${esc(note)}</div></div>`;
    $('kpis').innerHTML = [
      tile('試験数', items.length, `記録 ${fmt(Math.min(...items.map((x) => x.trial.intervalMin * 60)), 0)}〜${fmt(Math.max(...items.map((x) => x.trial.intervalMin * 60)), 0)}秒間隔`),
      tile('合格', `${pass.length}<span class="muted" style="font-size:15px"> / ${items.length}</span>`, `通過時間 ${state.settings.criterion}分以内`),
      tile('不合格・未到達', other, other ? items.filter((x) => x.result.judge !== '合格').map((x) => x.trial.name).join('、') : 'なし'),
      tile('最も速い通過', best ? `${fmt(best.result.passTime)}<span style="font-size:15px"> 分</span>` : '—', best ? best.trial.name : ''),
      tile('最も遅い通過', worst ? `${fmt(worst.result.passTime)}<span style="font-size:15px"> 分</span>` : '—', worst ? worst.trial.name : ''),
    ].join('');
  }

  function renderOverlay(items) {
    const traces = items.map((x) => {
      const ch = A.pickTargetChannel(x.trial.channels, state.channel);
      return {
        x: x.trial.t, y: ch.values, name: x.trial.name, type: 'scatter', mode: 'lines', connectgaps: false,
        line: { color: seriesColor(x.slot), width: x.id === state.selectedId ? 3 : 2, dash: seriesDash(x.slot) },
        hovertemplate: `${esc(x.trial.name)}<br>%{x:.1f}分  %{y:.1f}℃<extra></extra>`,
      };
    });
    $('overlayHint').textContent = `評価する列: ${state.channel || '自動'} ・ 横軸は各試験の開始からの経過時間。凡例をクリックで表示切替、ドラッグで拡大`;
    Plotly.react('overlay', traces, baseLayout({
      xaxis: Object.assign(baseLayout().xaxis, { title: { text: '経過時間 [分]' } }),
      yaxis: Object.assign(baseLayout().yaxis, { title: { text: '温度 [℃]' } }),
      shapes: bandShapes(), annotations: bandAnnotations(), hovermode: 'closest',
    }), plotConfig('冷却曲線の重ね合わせ'));
  }

  function renderBars(items) {
    const s = state.settings;
    const list = items.slice().sort((a, b) => (a.result.passTime ?? Infinity) - (b.result.passTime ?? Infinity));
    const colorOf = (j) => (j === '合格' ? css('--good') : j === '不合格' ? css('--critical') : css('--warning'));
    const maxV = Math.max(s.criterion, ...list.map((x) => x.result.passTime || 0));
    const trace = {
      type: 'bar', orientation: 'h',
      y: list.map((x) => x.trial.name),
      x: list.map((x) => (x.result.passTime === null ? 0 : x.result.passTime)),
      marker: { color: list.map((x) => colorOf(x.result.judge)), line: { color: css('--surface-1'), width: 2 } },
      text: list.map((x) => (x.result.passTime === null ? `${x.result.judge}` :
        `${fmt(x.result.passTime)}分 ${x.result.judge === '合格' ? '✓' : '✕'} ${x.result.judge}`)),
      textposition: 'outside', cliponaxis: false, textfont: { color: css('--text-primary') },
      hovertemplate: '%{y}<br>通過時間 %{x:.1f}分<extra></extra>',
    };
    $('barHint').textContent = `${s.upper}℃ から ${s.lower}℃ まで下がるのにかかった時間。点線が基準（${s.criterion}分）`;
    Plotly.react('bars', [trace], baseLayout({
      margin: { l: 16, r: 16, t: 28, b: 48 },
      xaxis: Object.assign(baseLayout().xaxis, { title: { text: '通過時間 [分]' }, range: [0, maxV * 1.45], rangemode: 'tozero' }),
      yaxis: Object.assign(baseLayout().yaxis, { autorange: 'reversed', automargin: true, ticksuffix: '  ' }),
      bargap: 0.35, showlegend: false,
      shapes: [{ type: 'line', yref: 'paper', y0: 0, y1: 1, x0: s.criterion, x1: s.criterion, line: { color: css('--text-secondary'), width: 1.5, dash: 'dot' } }],
      annotations: [{ yref: 'paper', y: 1, x: s.criterion, yanchor: 'bottom', showarrow: false, text: `基準 ${s.criterion}分`, font: { size: 11, color: css('--text-secondary') } }],
    }), plotConfig('通過時間の比較'));
  }

  const COLUMNS = [
    { key: 'name', label: '試験名', get: (x) => x.trial.name },
    { key: 'judge', label: '判定', get: (x) => x.result.judge },
    { key: 'quality', label: '外れ値・欠測', get: (x) => x.result.outliers + x.result.missing, num: true,
      show: (x) => (x.result.outliers + x.result.missing ? `<span class="badge warn">! ${x.result.outliers}点・${x.result.missing}点</span>` : '<span class="muted">なし</span>') },
    { key: 'passTime', label: '通過時間 [分]', get: (x) => x.result.passTime, num: true },
    { key: 'bandIn', label: '帯に入る [分]', get: (x) => x.result.bandIn, num: true },
    { key: 'bandOut', label: '帯を抜ける [分]', get: (x) => x.result.bandOut, num: true },
    { key: 'targetTime', label: () => `${state.settings.target}℃到達 [分]`, get: (x) => x.result.targetTime, num: true },
    { key: 'avgRate', label: '平均冷却速度 [℃/分]', get: (x) => x.result.avgRate, num: true, d: 2 },
    { key: 'bandRate', label: '帯の冷却速度 [℃/分]', get: (x) => x.result.bandRate, num: true, d: 2 },
    { key: 'sc', label: '過冷却 最低/深さ [℃]', get: (x) => (x.result.supercool ? x.result.supercool.minTemp : null), num: true,
      show: (x) => (x.result.supercool ? `${fmt(x.result.supercool.minTemp)} / ${fmt(x.result.supercool.depth)}` : '<span class="muted">なし</span>') },
    { key: 'minTemp', label: '最低温度 [℃]', get: (x) => x.result.minTemp, num: true },
  ];

  function renderTable(items) {
    const { key, dir } = state.sort;
    let rows = items;
    if (key) {
      const col = COLUMNS.find((c) => c.key === key);
      rows = items.slice().sort((a, b) => {
        const va = col.get(a), vb = col.get(b);
        if (va === null || va === undefined) return 1;
        if (vb === null || vb === undefined) return -1;
        return (col.num ? va - vb : String(va).localeCompare(String(vb), 'ja')) * dir;
      });
    }
    const head = '<thead><tr>' + COLUMNS.map((c) => {
      const label = typeof c.label === 'function' ? c.label() : c.label;
      const mark = c.key === key ? (dir > 0 ? ' ▲' : ' ▼') : '';
      return `<th data-sort="${c.key}" aria-sort="${c.key === key ? (dir > 0 ? 'ascending' : 'descending') : 'none'}">${label}${mark}</th>`;
    }).join('') + '</tr></thead>';
    const body = '<tbody>' + rows.map((x) => '<tr data-id="' + x.id + '"' + (x.id === state.selectedId ? ' class="selected"' : '') + '>' +
      COLUMNS.map((c) => {
        if (c.key === 'name') return `<td><span class="name"><span class="sw" style="background:${seriesColor(x.slot)}"></span>${esc(x.trial.name)}</span></td>`;
        if (c.key === 'judge') return `<td>${badge(x.result.judge)}</td>`;
        if (c.show) return `<td>${c.show(x)}</td>`;
        return `<td>${fmt(c.get(x), c.d)}</td>`;
      }).join('') + '</tr>').join('') + '</tbody>';
    $('table').innerHTML = head + body;
  }

  function renderDetail(items) {
    const sel = $('detailSelect');
    sel.innerHTML = items.map((x) => `<option value="${x.id}">${esc(x.trial.name)}</option>`).join('');
    sel.value = state.selectedId;
    const x = items.find((i) => i.id === state.selectedId);
    const r = x.result, tr = x.trial;
    $('detailTitle').textContent = `試験の詳細: ${tr.name}`;

    const traces = tr.channels.map((ch, k) => ({
      x: tr.t, y: ch.values, name: ch.name, type: 'scatter', mode: 'lines',
      line: { color: seriesColor(k), width: ch.name === r.channel ? 3 : 2 },
      hovertemplate: `%{x:.1f}分  %{y:.1f}℃<extra>${esc(ch.name)}</extra>`,
    }));
    // 取り除いた外れ値も、どこにあったか分かるように表示する（範囲外の値はグラフの端に置く）
    const allVals = tr.channels.flatMap((c) => c.values.filter((v) => !isNaN(v)));
    const yLo = Math.min(...allVals, state.settings.target) - 3, yHi = Math.max(...allVals) + 3;
    const clamp = (v) => Math.min(yHi - 1, Math.max(yLo + 1, v));
    tr.channels.forEach((ch, k) => {
      if (!ch.outlierIdx.length) return;
      traces.push({
        x: ch.outlierIdx.map((i) => tr.t[i]), y: ch.outlierIdx.map((i) => clamp(ch.raw[i])),
        customdata: ch.outlierIdx.map((i) => ch.raw[i]),
        name: `除いた外れ値（${ch.name}）`, type: 'scatter', mode: 'markers',
        marker: { symbol: 'x', size: 9, color: css('--text-muted') },
        hovertemplate: `除いた値 %{customdata}℃ (%{x:.1f}分)<extra>${esc(ch.name)}</extra>`,
      });
    });
    const marks = [];
    if (r.bandIn !== null) marks.push({ x: r.bandIn, y: state.settings.upper, label: `帯に入る ${fmt(r.bandIn)}分` });
    if (r.bandOut !== null) marks.push({ x: r.bandOut, y: state.settings.lower, label: `帯を抜ける ${fmt(r.bandOut)}分` });
    if (r.targetTime) marks.push({ x: r.targetTime, y: state.settings.target, label: `${state.settings.target}℃到達 ${fmt(r.targetTime)}分` });
    if (r.supercool) marks.push({ x: r.supercool.minTime, y: r.supercool.minTemp, label: `過冷却 ${fmt(r.supercool.minTemp)}℃` });
    traces.push({
      x: marks.map((m) => m.x), y: marks.map((m) => m.y), name: '指標の点', type: 'scatter', mode: 'markers+text',
      text: marks.map((m) => m.label), textposition: 'middle right', textfont: { size: 11, color: css('--text-primary') },
      marker: { size: 9, color: css('--surface-1'), line: { color: css('--text-primary'), width: 2 } },
      hovertemplate: '%{text}<extra></extra>', showlegend: false,
    });
    Plotly.react('detail', traces, baseLayout({
      xaxis: Object.assign(baseLayout().xaxis, { title: { text: '経過時間 [分]' } }),
      yaxis: Object.assign(baseLayout().yaxis, { title: { text: '温度 [℃]' },
        range: [yLo, yHi] }),
      shapes: bandShapes(), annotations: bandAnnotations(), hovermode: 'x unified',
    }), plotConfig(tr.name));

    const meta = Object.entries(tr.meta).map(([k, v]) => `${esc(k)}: ${esc(v)}`);
    $('detailMeta').innerHTML = [
      `判定: ${badge(r.judge)}`, `評価した列: ${esc(r.channel)}`, `ファイル: ${esc(tr.fileName)}`, `文字コード: ${esc(tr.encoding)}`,
      `時刻の形式: ${esc(tr.timeKind)}`, `記録間隔: ${fmt(tr.intervalMin * 60, 0)}秒`, `記録時間: ${fmt(r.duration, 0)}分`, ...meta,
    ].map((s) => `<span>${s}</span>`).join('');
  }

  // ---- 設定 -----------------------------------------------------------------
  function syncSettingInputs() {
    ['upper', 'lower', 'target', 'criterion'].forEach((k) => { $(k).value = state.settings[k]; });
  }

  function onSettingInput() {
    const v = {};
    for (const k of ['upper', 'lower', 'target', 'criterion']) {
      const n = parseFloat($(k).value);
      if (isNaN(n)) return;
      v[k] = n;
    }
    if (v.upper <= v.lower) { showErrors(['帯の上限は下限より高くしてください']); return; }
    showErrors([]);
    state.settings = v;
    const match = Object.entries(PRESETS).find(([, p]) => ['upper', 'lower', 'target', 'criterion'].every((k) => p[k] === v[k]));
    $('preset').value = match ? match[0] : 'custom';
    render();
  }

  // ---- 表示の明暗 -----------------------------------------------------------
  const THEMES = ['auto', 'light', 'dark'];
  const THEME_LABEL = { auto: '表示: 自動', light: '表示: ライト', dark: '表示: ダーク' };
  let theme = 'auto';
  try { theme = localStorage.getItem('freeze-theme') || 'auto'; } catch (e) { /* 保存できない環境 */ }
  function applyTheme() {
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    $('themeBtn').textContent = THEME_LABEL[theme];
    render();
  }

  // ---- イベント -------------------------------------------------------------
  const drop = $('drop');
  drop.addEventListener('click', () => $('fileInput').click());
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('fileInput').click(); } });
  $('fileInput').addEventListener('change', (e) => { loadFiles(e.target.files); e.target.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => loadFiles(e.dataTransfer.files));
  // 枠の外に落としてもブラウザがファイルを開かないようにする
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => { e.preventDefault(); if (e.target !== drop && !drop.contains(e.target)) loadFiles(e.dataTransfer.files); });

  $('sampleBtn').addEventListener('click', loadSamples);
  $('sampleBtn2').addEventListener('click', loadSamples);
  $('clearBtn').addEventListener('click', () => { state.trials = []; state.nextSlot = 0; showErrors([]); render(); });
  $('chips').addEventListener('click', (e) => {
    const id = e.target.dataset.remove;
    if (!id) return;
    state.trials = state.trials.filter((x) => x.id !== id);
    if (!state.trials.length) state.nextSlot = 0;
    render();
  });
  $('exportBtn').addEventListener('click', () => {
    const blob = new Blob([A.resultsToCSV(results(), state.settings)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `冷凍試験_指標_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('preset').addEventListener('change', (e) => {
    if (PRESETS[e.target.value]) { state.settings = Object.assign({}, PRESETS[e.target.value]); syncSettingInputs(); render(); }
  });
  ['upper', 'lower', 'target', 'criterion'].forEach((k) => $(k).addEventListener('change', onSettingInput));
  $('channel').addEventListener('change', (e) => { state.channel = e.target.value; render(); });
  $('table').addEventListener('click', (e) => {
    const th = e.target.closest('th');
    if (th) {
      const k = th.dataset.sort;
      state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : 1 };
      render();
      return;
    }
    const tr = e.target.closest('tr[data-id]');
    if (tr) { state.selectedId = tr.dataset.id; render(); $('detail').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  });
  $('detailSelect').addEventListener('change', (e) => { state.selectedId = e.target.value; render(); });
  $('themeBtn').addEventListener('click', () => {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    try { localStorage.setItem('freeze-theme', theme); } catch (e) { /* 保存できない環境 */ }
    applyTheme();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (theme === 'auto') render(); });

  if (!window.Plotly) {
    showErrors(['グラフ部品（Plotly.js）を読み込めませんでした。vendor フォルダがあるか、インターネット接続を確認してください']);
  }
  syncSettingInputs();
  applyTheme();
  // index.html?sample で開くとサンプルを読み込んだ状態で始まる（デモ用）
  const params = new URLSearchParams(location.search);
  if (params.has('sample')) {
    loadSamples();
    const i = parseInt(params.get('select'), 10);
    if (state.trials[i]) { state.selectedId = state.trials[i].id; render(); }
  }
})();
