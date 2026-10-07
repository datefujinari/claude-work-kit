"""冷凍試験のダミーCSVを作る。

品温は「見かけの比熱」モデルで計算する（凍結点以下では氷の生成で潜熱が出るため、
-1〜-5℃付近で温度が下がりにくくなる）。出力:
  sample_data/*.csv  ... 温度ロガー風のCSV（Shift-JIS / UTF-8 が混在）
  samples.js         ... ツールの「サンプルで試す」用に同じ内容を埋め込んだもの
"""
import json
import math
import random
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "sample_data"

TF = -1.0          # 凍結開始温度
LATENT = 45.0      # 潜熱と比熱の比（水分の多い試料を想定）


def ambient(t_min, t_set, t0=20.0, tau=6.0):
    """庫内温度: 設定温度へ指数的に下がる"""
    return t_set + (t0 - t_set) * math.exp(-t_min / tau)


def simulate(k, t_set, minutes, supercool=None, t0=20.0, dt=1 / 60):
    """品温の時系列（1秒刻み）を返す。k は熱伝達の速さ[1/分]"""
    temps, t, T = [], 0.0, t0
    frozen_started = supercool is None
    while t <= minutes + 1e-9:
        temps.append(T)
        ta = ambient(t, t_set)
        if T > TF or not frozen_started:
            cap = 1.0
        else:
            cap = 1.0 + LATENT * abs(TF) / (T * T)
        T += -k * (T - ta) / cap * dt
        if not frozen_started and T <= supercool:
            # 過冷却が破れて一気に凍結点付近まで戻る
            T = TF - 0.3
            frozen_started = True
        t += dt
    return temps


def sample(series, step_sec):
    return series[:: step_sec]


def noisy(values, sigma, rng):
    return [v + rng.gauss(0, sigma) for v in values]


def logger_csv(name, start, step_sec, cols):
    """ロガー風（先頭に機器情報、日時の列）"""
    lines = [
        "機種,TR-DEMO-4CH",
        f"試験名,{name}",
        f"記録間隔,{step_sec}秒",
        f"記録開始,{start:%Y/%m/%d %H:%M:%S}",
        "",
        "日時," + ",".join(c for c, _ in cols),
    ]
    n = len(cols[0][1])
    for i in range(n):
        ts = start + timedelta(seconds=i * step_sec)
        vals = []
        for _, v in cols:
            x = v[i]
            vals.append("" if x is None else (x if isinstance(x, str) else f"{x:.1f}"))
        lines.append(f"{ts:%Y/%m/%d %H:%M:%S}," + ",".join(vals))
    return "\r\n".join(lines) + "\r\n"


def elapsed_csv(step_sec, cols):
    """経過時間（分）形式のシンプルなCSV"""
    lines = ["経過時間(分)," + ",".join(c for c, _ in cols)]
    n = len(cols[0][1])
    for i in range(n):
        lines.append(f"{i * step_sec / 60:.1f}," + ",".join(f"{v[i]:.2f}" for _, v in cols))
    return "\n".join(lines) + "\n"


def trial(rng, k_center, k_surface, t_set, minutes, step, supercool=None):
    center = simulate(k_center, t_set, minutes, supercool)
    surface = simulate(k_surface, t_set, minutes)
    room = [ambient(i / 60, t_set) for i in range(len(center))]
    c = noisy(sample(center, step), 0.05, rng)
    s = noisy(sample(surface, step), 0.08, rng)
    r = noisy(sample(room, step), 0.3, rng)
    return c, s, r


def main():
    rng = random.Random(42)
    OUT_DIR.mkdir(exist_ok=True)
    start = datetime(2026, 10, 1, 9, 0, 0)
    files = []
    head = ["CH1 中心温度[℃]", "CH2 表面温度[℃]", "CH3 庫内温度[℃]"]

    specs = [
        ("試験A_急速_-35℃_風速3m", 0.19, 0.50, -35, 150, None),
        ("試験B_標準_-30℃_風速1m", 0.045, 0.12, -30, 300, None),
        ("試験C_緩慢_-20℃_無風", 0.025, 0.07, -20, 600, None),
        ("試験D_過冷却_-30℃_風速1m", 0.075, 0.18, -30, 300, -6.5),
    ]
    for i, (name, kc, ks, ts, mins, sc) in enumerate(specs):
        c, s, r = trial(rng, kc, ks, ts, mins, 30, sc)
        text = logger_csv(name, start + timedelta(days=i), 30, list(zip(head, (c, s, r))))
        files.append((f"{name}.csv", text, "shift_jis"))

    # 試験E: センサー異常（スパイク・欠測）を含む
    c, s, r = trial(rng, 0.10, 0.25, -32, 240, 30)
    c, s = list(c), list(s)
    for idx in (40, 41, 300):
        c[idx] = 85.0
    s[200] = -99.9
    s[201] = None
    s[202] = None
    text = logger_csv("試験E_センサー異常あり_-32℃", start + timedelta(days=4), 30,
                      list(zip(head, (c, s, r))))
    files.append(("試験E_センサー異常あり_-32℃.csv", text, "shift_jis"))

    # 試験F: 別の書式（UTF-8・経過時間・60秒間隔・列名が違う）
    c, s, r = trial(rng, 0.20, 0.50, -40, 150, 60)
    text = elapsed_csv(60, [("品温(中心)", c), ("庫内温度", r)])
    files.append(("試験F_別書式_-40℃.csv", text, "utf-8"))

    for fname, text, enc in files:
        (OUT_DIR / fname).write_bytes(text.encode(enc))

    samples = [{"name": f, "text": t} for f, t, _ in files]
    (ROOT / "samples.js").write_text(
        "// tools/make_dummy.py が生成したダミーデータ（「サンプルで試す」用）\n"
        "window.SAMPLE_FILES = " + json.dumps(samples, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )
    print(f"{len(files)} files ->", OUT_DIR)


if __name__ == "__main__":
    main()
