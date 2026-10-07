import json, os, glob
D = os.path.dirname(os.path.abspath(__file__))
tpl = open(os.path.join(D, "template.html"), encoding="utf-8").read()
ana = open(os.path.join(D, "analysis.js"), encoding="utf-8").read()
samples = []
for f in sorted(glob.glob(os.path.join(D, "dummy", "*.csv"))):
    samples.append({"name": os.path.basename(f), "text": open(f, encoding="shift_jis").read()})
html = tpl.replace("/*__ANALYSIS__*/", ana).replace("/*__SAMPLES__*/", json.dumps(samples, ensure_ascii=False).replace("</", "<\\/"))
os.makedirs(os.path.join(D, "dist"), exist_ok=True)
# Artifact用（スケルトンは公開時に付く）
open(os.path.join(D, "dist", "freeze-analyzer.html"), "w", encoding="utf-8").write(html)
# ローカルでダブルクリックして開く用（完全なHTML）
full = '<!doctype html>\n<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>\n' + html + "\n</body></html>\n"
open(os.path.join(D, "dist", "冷凍試験解析ツール_デモ.html"), "w", encoding="utf-8").write(full)
print("ok", len(html))
