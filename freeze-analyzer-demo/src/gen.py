"""冷凍試験のダミーデータ生成 + 期待値計算（JS実装とは独立したPython実装）"""
import json, math, os
import numpy as np

OUT = os.path.join(os.path.dirname(__file__), "dummy")
os.makedirs(OUT, exist_ok=True)
DT = 0.5  # 分（30秒間隔）

TRIALS = [
    # id, 条件, 庫内設定, 風速, tau1, 過冷却最低, 潜熱区間(分), tau3, 記録(分), 外れ値
    dict(id="T01", cond="-35℃ 風速3m/s", Ta=-35, wind=3, tau1=9,  Ts=-2.6, D=16, tau3=14, dur=150),
    dict(id="T02", cond="-35℃ 風速1m/s", Ta=-35, wind=1, tau1=13, Ts=-2.2, D=26, tau3=20, dur=180),
    dict(id="T03", cond="-25℃ 風速1m/s", Ta=-25, wind=1, tau1=17, Ts=-1.8, D=52, tau3=30, dur=240),
    dict(id="T04", cond="-40℃ 風速5m/s", Ta=-40, wind=5, tau1=6,  Ts=-6.3, D=9,  tau3=10, dur=120),
    dict(id="T05", cond="-30℃ 風速3m/s", Ta=-30, wind=3, tau1=11, Ts=-2.4, D=22, tau3=17, dur=180, outliers=True),
    dict(id="T06", cond="-20℃ 風速0.5m/s", Ta=-20, wind=0.5, tau1=22, Ts=-1.2, D=78, tau3=45, dur=150),
]
TF = -1.2   # 凍結点
T0 = 18.0   # 初期品温


def center_curve(p, t, scale=1.0):
    Ta, tau1, Ts, D, tau3 = p["Ta"], p["tau1"]*scale, p["Ts"], p["D"]*scale, p["tau3"]*scale
    # Phase1: 指数冷却で Ts まで
    t1 = -tau1*math.log((Ts-Ta)/(T0-Ta))
    jump = 1.0  # 過冷却解除後 1分で凍結点へ戻る
    out = []
    for x in t:
        if x <= t1:
            v = Ta + (T0-Ta)*math.exp(-x/tau1)
        elif x <= t1+jump:
            v = Ts + (TF-Ts)*(x-t1)/jump
        elif x <= t1+jump+D:
            s = (x-t1-jump)/D
            v = TF + (-5-TF)*(s**2.2)
        else:
            v = Ta + (-5-Ta)*math.exp(-(x-t1-jump-D)/tau3)
        out.append(v)
    return np.array(out)


def make(p, rng):
    t = np.arange(0, p["dur"]+1e-9, DT)
    c = center_curve(p, t) + rng.normal(0, 0.04, len(t))
    s = center_curve(dict(p, Ts=TF-0.3), t, scale=0.45) + rng.normal(0, 0.06, len(t))
    a = p["Ta"] + 9*np.exp(-t/4) + rng.normal(0, 0.25, len(t))
    if p.get("outliers"):
        for i, v in [(50, 38.5), (51, 37.9), (160, -99.9)]:
            c[i] = v
        s[220] = 41.2
    return t, c, s, a


def write_csv(p, t, c, s, a):
    lines = [
        "機種,DUMMY-LOGGER 4ch",
        f"試験名,{p['id']} 鶏もも肉200g {p['cond']}",
        f"品目,鶏もも肉200g",
        f"庫内設定,{p['Ta']}℃",
        f"風速,{p['wind']}m/s",
        "記録間隔,30秒",
        "",
        "日時,CH1 品温中心(℃),CH2 品温表面(℃),CH3 庫内(℃)",
    ]
    base = 9*60  # 9:00開始
    for x, cv, sv, av in zip(t, c, s, a):
        m = base + x
        hh, mm = int(m//60), int(m % 60)
        ss = int(round((m - math.floor(m))*60))
        lines.append(f"2026/10/01 {hh:02d}:{mm:02d}:{ss:02d},{cv:.1f},{sv:.1f},{av:.1f}")
    path = os.path.join(OUT, f"{p['id']}_鶏もも肉_庫内{p['Ta']}C_風速{p['wind']}ms.csv")
    with open(path, "w", encoding="shift_jis", newline="") as f:
        f.write("\r\n".join(lines) + "\r\n")
    return path


# ---- 期待値（独立実装） ----
def despike(y):
    """外れ値: 前後の点を結んだ線から 5℃以上 同じ向きに外れた1〜3点の並び。線形補間で置き換える"""
    y = y.copy(); n = len(y); flags = []
    i = 1
    while i < n-1:
        hit = 0
        for w in (1, 2, 3):
            if i+w >= n: break
            a, b = y[i-1], y[i+w]
            if abs(a-b) >= 5: continue
            dev = [y[i+k] - (a + (b-a)*(k+1)/(w+1)) for k in range(w)]
            if all(d > 5 for d in dev) or all(d < -5 for d in dev):
                hit = w; break
        if hit:
            a, b = y[i-1], y[i+hit]
            for k in range(hit):
                y[i+k] = a + (b-a)*(k+1)/(hit+1); flags.append(i+k)
            i += hit
        else:
            i += 1
    return y, flags


def last_down_cross(t, y, th):
    """最後に th を下回った時刻（線形補間）。その後 th を上回らない。"""
    if y[-1] > th:
        return None
    k = None
    for i in range(1, len(y)):
        if y[i-1] > th >= y[i]:
            k = i
    if k is None:
        return t[0] if y[0] <= th else None
    i = k
    return t[i-1] + (th - y[i-1])*(t[i]-t[i-1])/(y[i]-y[i-1])


def metrics(t, y):
    y, flags = despike(np.array(y, float))
    a = last_down_cross(t, y, -1.0)
    b = last_down_cross(t, y, -5.0)
    g = last_down_cross(t, y, -18.0)
    # 過冷却: 0℃未満で、その後 0.3℃以上上昇する最初の極小
    sc = None
    for i in range(1, len(y)-1):
        if y[i] < 0 and y[i] <= y[i-1] and y[i] <= y[i+1]:
            if max(y[i+1:i+11]) - y[i] >= 0.3:
                sc = (t[i], y[i]); break
    rate = (-5 - -18)/(g-b) if (g is not None and b is not None) else None
    return dict(pass_min=(b-a) if (a is not None and b is not None) else None,
                reach_min=g, supercool_t=sc[0] if sc else None, supercool_T=sc[1] if sc else None,
                rate=rate, outliers=len(flags))


rng = np.random.default_rng(20261007)
expected = {}
for p in TRIALS:
    t, c, s, a = make(p, rng)
    write_csv(p, t, c, s, a)
    # CSVは小数1桁で丸めるので、丸めた値で期待値を出す
    expected[p["id"]] = metrics(t, np.round(c, 1))
    print(p["id"], {k: (round(v, 2) if isinstance(v, float) else v) for k, v in expected[p["id"]].items()})
json.dump(expected, open(os.path.join(os.path.dirname(__file__), "expected.json"), "w"), ensure_ascii=False, indent=1)
