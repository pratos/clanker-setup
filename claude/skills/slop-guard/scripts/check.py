#!/usr/bin/env python3
"""Score prose. One entry point for people, hooks and other skills.

usage: check.py [--jev] [--json] file...

Three layers, because each misses what the others catch:
  rules   Eric Tramel's slop-guard. Local and deterministic.
  smell   Rhetorical habits both scorers passed in a real draft that a reader still disliked. Local and deterministic.
  jev     A judge model. Sends the text to TypeSafe, so it runs only when asked with --jev and a key is set.

HTML is reduced to its prose first, leaving out code, tables, styles and scripts.
Exit 0 when every file passes, 1 when one fails, and 2 when a scorer could not run.
"""
import html, json, os, re, subprocess, sys, tempfile
from pathlib import Path

RULES_MIN = 85   # higher is cleaner
JEV_MAX = 40     # lower is cleaner
JEV = Path.home() / 'personal/growthx-ai-coding/tools/slop-jev/slop-jev'
# Words the rules count as slop that are the correct technical term. Swapped before scoring, never in the file.
TERMS_OF_ART = {'harness': 'runtime', 'harnesses': 'runtimes'}

# Phrases that perform insight or stage the writing, in place of saying the thing.
PHRASES = [
    r'\bthe (real|true|whole|actual) (gift|point|trick|idea|question|problem|cost|answer|lesson)\b', r'\bthe whole of\b',
    r'\b(is|are) the (point|key|trick|gift)\b', r'\beverything else\b', r"\bthat(?:'s| is) (why|the point|the trick|the gift|where|what makes)\b",
    r'\bhere is (ours|the thing|the catch|the trick)\b', r'\bneither\b[^.]{0,40}\b(is|are) an?\b', r'\bnot (just|only|merely)\b',
    r'\bthis is where\b', r'\b(key|real|central) insight\b', r'\bwhat (really )?(matters|counts)\b', r'\bturns? out\b', r'\bin fairness\b',
    r'\bsimply better\b', r'\bquietly\b', r'\bstrongest idea\b', r'\bat its core\b', r'\bchanged our minds?\b', r'\btaught us more\b',
    r'\bonly worth\b', r'\bnothing (here )?is free\b', r'\bthe price\b', r'\bon purpose\b.{0,3}$', r'\bworthless\b', r'\bevery time\b.{0,3}$',
    r'\bmore than the passes\b', r'\bin place of\b', r'\bfrom first principles\b', r'\bstep back\b', r'\blet that sink\b',
]
PHRASE = re.compile('|'.join(PHRASES), re.I | re.M)
# Sentences that open alike: "Audit becomes a read. Debugging becomes a replay."
PARALLEL_VERB = re.compile(r'^\w+ (becomes?|is|are|means?|gives?) (an? |the )?\w+$', re.I)

def sentences(paragraph):
    return [s.strip() for s in re.split(r'(?<=[.!?])["\')]*\s+(?=[A-Z"\'`])', paragraph) if s.strip()]

def smells(text):
    found = []
    for paragraph in (p.strip() for p in re.split(r'\n\s*\n', text)):
        if not paragraph:
            continue
        unquoted = re.sub(r'"[^"]*"|“[^”]*”', '', paragraph) # a quoted example is not the writer's own voice
        for m in PHRASE.finditer(unquoted):
            found.append(('phrase', m.group(0).strip()))
        said = sentences(paragraph)
        if len(said) >= 3 and len(said[-1].split()) <= 6:
            found.append(('mic-drop ending', said[-1]))
        for a, b in zip(said, said[1:]):
            x, y = a.rstrip('.!?'), b.rstrip('.!?')
            if len(x.split()) <= 6 and len(y.split()) <= 6:
                if PARALLEL_VERB.match(x) and PARALLEL_VERB.match(y):
                    found.append(('parallel pair', f'{a} {b}'))
                elif x.split()[0].lower() == y.split()[0].lower():
                    found.append(('parallel pair', f'{a} {b}'))
                elif len(x.split()) <= 4 and len(y.split()) <= 4:
                    found.append(('staccato pair', f'{a} {b}'))
    return found

def prose_of(path):
    raw = Path(path).read_text(encoding='utf8', errors='ignore')
    if path.endswith(('.html', '.htm')):
        raw = re.sub(r'<(\w+)[^>]*class="[^"]*\bsources\b[^"]*"[^>]*>.*?</\1>', '', raw, flags=re.S)
        for tag in ('style', 'script', 'pre', 'table', 'figure', 'title'):
            raw = re.sub(rf'<{tag}\b.*?</{tag}>', '', raw, flags=re.S | re.I)
        raw = re.sub(r'</(p|h\d|li|dd|dt|div)>', '\n\n', raw)
        raw = html.unescape(re.sub(r'<[^>]+>', '', raw))
    else:
        raw = re.sub(r'```.*?```', '', raw, flags=re.S)
        raw = re.sub(r'^\s*\|.*$', '', raw, flags=re.M)
        raw = re.sub(r'^#{1,6} .*$', '', raw, flags=re.M) # a heading is a label, and two in a row are not a staccato pair
        raw = re.sub(r'^---\n.*?\n---\n', '', raw, flags=re.S)
    return raw

def rules_score(text):
    with tempfile.NamedTemporaryFile('w', suffix='.md', delete=False) as t:
        t.write(text)
    try:
        run = subprocess.run(['uvx', '--from', 'slop-guard==0.5.0', 'sg', '-v', '--counts', t.name], capture_output=True, text=True, timeout=60)
        m = re.search(r'(\d+)/100', run.stdout)
        return (int(m.group(1)) if m else None), run.stdout.replace(t.name, '')
    finally:
        os.unlink(t.name)

def jev_score(text):
    if not os.environ.get('TYPESAFE_API_KEY') or not JEV.exists():
        return None, 'jev skipped: no key or no binary'
    with tempfile.NamedTemporaryFile('w', suffix='.md', delete=False) as t:
        t.write(text)
    try:
        run = subprocess.run([str(JEV), t.name], capture_output=True, text=True, timeout=90)
        m = re.search(r'(\d+)/100', run.stdout)
        return (int(m.group(1)) if m else None), run.stdout.replace(t.name, '')
    finally:
        os.unlink(t.name)

def check(path, jev):
    text = prose_of(path)
    for word, plain in TERMS_OF_ART.items():
        text = re.sub(rf'\b{word}\b', plain, text, flags=re.I)
    if len(text) < 400:
        return {'file': path, 'skipped': 'under 400 characters', 'ok': True}
    score, detail = rules_score(text)
    found = smells(text)
    out = {'file': path, 'rules': score, 'smells': found}
    ok = score is not None and score >= RULES_MIN and not found
    if jev:
        out['jev'], _ = jev_score(text)
        ok = ok and (out['jev'] is None or out['jev'] < JEV_MAX)
    out['ok'] = ok
    out['advice'] = [l.strip() for l in detail.splitlines() if l.strip().startswith('- ')][:6]
    return out

def main():
    args = sys.argv[1:]
    jev = '--jev' in args
    as_json = '--json' in args
    files = [a for a in args if not a.startswith('--')]
    results = [check(f, jev) for f in files]
    if as_json:
        print(json.dumps(results))
    else:
        for r in results:
            if 'skipped' in r:
                print(f"{r['file']}: skipped, {r['skipped']}")
                continue
            jv = f" · jev {r['jev']}/100 (under {JEV_MAX})" if r.get('jev') is not None else ''
            print(f"{'pass' if r['ok'] else 'FAIL'}  {r['file']}: rules {r['rules']}/100 (at least {RULES_MIN}){jv} · {len(r['smells'])} smells")
            for kind, what in r['smells']:
                print(f'   {kind}: {what[:110]}')
            if r['rules'] is not None and r['rules'] < RULES_MIN:
                for a in r['advice']:
                    print(f'   {a[:130]}')
    sys.exit(0 if all(r['ok'] for r in results) else 1)

if __name__ == '__main__':
    main()
