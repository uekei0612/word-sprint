# tests/fixtures/anki/*.txt を作ったスクリプト（Anki 26.09.3 の Python パッケージで、実際に「ノートをプレーンテキストで書き出し」する）
#   docker run --rm -v "$PWD/tests/fixtures/anki":/out python:3.11-slim sh -c 'pip install -q anki && python /out/gen.py'
# テストで使うのは html.txt・html-all.txt・plain-all.txt・example.txt（plain.txt は使わない。GUID は毎回変わる）
import anki, os, inspect
from anki.collection import Collection
print("anki", anki.version if hasattr(anki,'version') else '')
col = Collection("/tmp/c.anki2")
m = col.models.by_name("Basic")
deck = col.decks.id("英単語::TOEIC")
rows = [
  ("<b>abandon</b>", "放棄する<br>見捨てる[sound:abandon.mp3]", "keep"),
  ("look&nbsp;forward to", "楽しみに待つ &amp; 期待する", ""),
  ("<div>quote \"this\"</div>", "<span style=\"color:red\">引用する</span>", "tag1 tag2"),
  ("tab\there", "タブ, カンマ; 区切り", ""),
  ("multi", "1行目\n2行目", ""),
  ("&lt;tag&gt;", "山括弧", ""),
]
for f, b, tags in rows:
    n = col.new_note(m); n["Front"] = f; n["Back"] = b
    if tags: n.tags = tags.split()
    col.add_note(n, deck)

from anki.collection import ExportLimit, DeckIdLimit
for html in (True, False):
  for extra in (False, True):
    out = f"/out/{'html' if html else 'plain'}{'-all' if extra else ''}.txt"
    col.export_note_csv(out_path=out, limit=DeckIdLimit(deck), with_html=html, with_tags=extra, with_deck=extra, with_notetype=extra, with_guid=extra)
    print(out)
col.close()
col = Collection("/tmp/c.anki2")
mm = col.models
v = mm.new("Vocab")
for name in ("Word", "Meaning", "Example", "Translation"): mm.add_field(v, mm.new_field(name))
t = mm.new_template("Card 1"); t["qfmt"] = "{{Word}}"; t["afmt"] = "{{Meaning}}"; mm.add_template(v, t); mm.add(v)
v = mm.by_name("Vocab"); d2 = col.decks.id("例文つき")
for w, m, e, j in [("deploy", "配備する", "We <b>deploy</b> on Fridays.", "金曜にデプロイする。"), ("run", "走る", "I run every day.[sound:run.mp3]", "毎日走る。"), ("go", "行く", "", "")]:
    n = col.new_note(v); n["Word"], n["Meaning"], n["Example"], n["Translation"] = w, m, e, j; col.add_note(n, d2)
col.export_note_csv(out_path="/out/example.txt", limit=DeckIdLimit(d2), with_html=True, with_tags=True, with_deck=True, with_notetype=True, with_guid=False)
import anki.buildinfo; print("version", anki.buildinfo.version)
col.close()
