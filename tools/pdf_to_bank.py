#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pdf_to_bank.py — turn a NITE-style psychometric booklet into a MAPAM item bank.

    python3 tools/pdf_to_bank.py exam.pdf -o data/my-bank.json
    python3 tools/pdf_to_bank.py exam.pdf --report        # what needs your eyes
    python3 tools/pdf_to_bank.py --from-text dump.txt -o bank.json

How it works, and where it stops:

  1. Text layer     pdftotext -layout, falling back to pdfplumber. A scanned
                    booklet with no text layer needs OCR first (see --help).
  2. Page tagging   The running header on each page ("חשיבה מילולית - פרק ראשון")
                    tells us the domain and chapter.
  3. Type ranges    Sub-headers carry the answer: "אנלוגיות (שאלות 1-6)" means
                    items 1-6 are analogies. This is why the types come out
                    right instead of guessed.
  4. Items          Split on question markers, then on option markers.
  5. Answer key     The "מפתח תשובות נכונות" page is parsed and merged in.

Everything the parser is unsure about is written into the JSON as a "review"
field rather than silently guessed. Grep for it, fix it, delete it.
"""

import argparse, json, os, re, subprocess, sys, unicodedata

# ---------------------------------------------------------------------------
# Booklet vocabulary. Add a line here to support a new booklet layout.
# ---------------------------------------------------------------------------

DOMAIN_HEADERS = [
    (re.compile(r'חשיבה\s+מילולית'), 'verbal'),
    (re.compile(r'חשיבה\s+כמותית'), 'quantitative'),
    (re.compile(r'\bENGLISH\b|אנגלית'), 'english'),
]

CHAPTER_WORDS = {'ראשון': 1, 'שני': 2, 'שלישי': 3, 'רביעי': 4,
                 'One': 1, 'Two': 2, 'Three': 3, 'Four': 4}

# Sub-header -> item type. The captured range decides which items get it.
TYPE_HEADERS = [
    (re.compile(r'אנלוגיות'), 'analogy'),
    (re.compile(r'שאלות\s+הבנה\s+והסקה'), 'logic'),
    (re.compile(r'קטע\s+קריאה'), 'reading_question'),
    (re.compile(r'שאלות\s+ובעיות'), 'problem'),
    (re.compile(r'הסקה\s+מ(תרשים|טבלה)'), 'figure_question'),
    (re.compile(r'Sentence\s+Completions?'), 'sentence_completion'),
    (re.compile(r'Restatements?'), 'restatement'),
    (re.compile(r'Reading\s+Comprehension|^\s*Text\s+[IV]+'), 'reading_question'),
]

# "הוראות לשאלות 10-12:" introduces sentence-completion items inside a
# logic run — the one case where a sub-header range is not the whole story.
INSTR_BLOCK = re.compile(r'הוראות\s+לשאלות\s*:?\s*(\d+)\s*[-–]\s*(\d+)')

RANGE = re.compile(r'[)(]?\s*(?:שאלות|Questions)\s*(\d+)\s*[-–]\s*(\d+)\s*[)(]?')

# Question markers: Hebrew pages render "1." as ".1"; English pages keep "1.".
Q_MARK = re.compile(r'^\s*(?:\.(\d{1,2})|(\d{1,2})\.)\s+(?=\S)')
# Option markers: Hebrew "(1)" comes out mirrored as ")1(".
OPT_MARK = re.compile(r'[)(](\d)[)(]\s*')

ANSWER_KEY_PAGE = re.compile(r'מפתח\s+תשובות\s+נכונות')
BLANK_PAGE = re.compile(r'עמוד\s+ריק')

NOISE = [
    re.compile(r'כל\s+הזכויות\s+שמורות'),
    re.compile(r'אין\s+להעתיק\s+או\s+להפיץ'),
    re.compile(r'^\s*-?\s*\d+\s*-?\s*$'),
    re.compile(r'^\s*מועד\s+\S+\s+\d{4}\s*$'),
    re.compile(r'הזמן\s+המוקצב'),
    re.compile(r'^\s*בפרק\s+זה\s+\d+\s+שאלות'),
    re.compile(r'^\s*This\s+section\s+contains'),
    re.compile(r'^\s*The\s+time\s+allotted'),
]

DOMAIN_OF_TYPE = {
    'analogy': 'verbal', 'logic': 'verbal', 'reading_question': None,
    'sentence_completion': None, 'problem': 'quantitative',
    'figure_question': 'quantitative', 'restatement': 'english',
}

# ---------------------------------------------------------------------------

def read_pdf(path):
    """Text layer, layout preserved. pdftotext first, pdfplumber as backup."""
    try:
        out = subprocess.run(['pdftotext', '-layout', path, '-'],
                             capture_output=True, check=True)
        text = out.stdout.decode('utf-8', 'replace')
        if len(text.strip()) > 500:
            return text
    except (FileNotFoundError, subprocess.CalledProcessError):
        pass
    try:
        import pdfplumber
    except ImportError:
        sys.exit('No text extracted and pdfplumber is not installed.\n'
                 'Try:  pip install pdfplumber\n'
                 'If the booklet is scanned, OCR it first:\n'
                 '  ocrmypdf -l heb+eng exam.pdf exam-ocr.pdf')
    with pdfplumber.open(path) as pdf:
        pages = [(p.extract_text(layout=True) or '') for p in pdf.pages]
    text = '\f'.join(pages)
    if not text.strip():
        sys.exit('This PDF has no text layer. OCR it first:\n'
                 '  ocrmypdf -l heb+eng exam.pdf exam-ocr.pdf')
    return text


def clean(line):
    line = unicodedata.normalize('NFC', line)
    line = re.sub(r'[\u200e\u200f\u202a-\u202e\u2066-\u2069]', '', line)  # bidi marks
    return line.rstrip()


def is_noise(line):
    return any(p.search(line) for p in NOISE)


# ---------------------------------------------------------------------------

RUNNING_HEADER = re.compile(r'(חשיבה\s+מילולית|חשיבה\s+כמותית|אנגלית|ENGLISH)'
                            r'.*?(?:-\s*\d+\s*-|מועד\s+\S+\s+\d{4})')


def split_pages(text):
    """pdftotext writes \\f between pages. Some dumps don't — fall back to
    splitting before every running header, which amounts to the same thing."""
    if '\f' in text:
        return text.split('\f')
    pages, cur = [], []
    for line in text.split('\n'):
        if (RUNNING_HEADER.search(line) or ANSWER_KEY_PAGE.search(line)) and cur:
            pages.append('\n'.join(cur))
            cur = []
        cur.append(line)
    if cur:
        pages.append('\n'.join(cur))
    return pages


def parse(text):
    pages = split_pages(text)
    chapters, answer_key = [], {}
    current = None

    for raw_page in pages:
        lines = [clean(l) for l in raw_page.split('\n')]
        joined = '\n'.join(lines)

        if ANSWER_KEY_PAGE.search(joined):
            answer_key.update(parse_answer_key(lines))
            continue
        if BLANK_PAGE.search(joined) and len([l for l in lines if l.strip()]) < 8:
            continue

        domain, chapter = page_tag(lines)
        if domain:
            key = (domain, chapter)
            if current is None or current['key'] != key:
                current = {'key': key, 'domain': domain, 'chapter': chapter, 'lines': []}
                chapters.append(current)
        if current is None:
            continue
        current['lines'].extend(l for l in lines if not is_noise(l))

    out = []
    for ch in chapters:
        items, stimuli, notes = parse_chapter(ch)
        if items:
            out.append({'domain': ch['domain'], 'chapter': ch['chapter'],
                        'items': items, 'stimuli': stimuli, 'notes': notes})
    return out, answer_key


def page_tag(lines):
    """Domain + chapter from the running header in the first few lines."""
    head = '\n'.join(lines[:4])
    domain = next((d for rx, d in DOMAIN_HEADERS if rx.search(head)), None)
    if not domain:
        return None, None
    chapter = 1
    for word, n in CHAPTER_WORDS.items():
        if re.search(r'(?:פרק|Section)\s+' + word, head):
            chapter = n
            break
    return domain, chapter


def type_ranges(lines, domain):
    """Map question number -> item type, from the sub-headers."""
    ranges = []
    for line in lines:
        m = RANGE.search(line)
        if not m:
            continue
        lo, hi = sorted((int(m.group(1)), int(m.group(2))))
        for rx, t in TYPE_HEADERS:
            if rx.search(line):
                ranges.append((lo, hi, t))
                break
    mapping = {}
    for lo, hi, t in ranges:
        for n in range(lo, hi + 1):
            mapping[n] = t
    # "הוראות לשאלות 10-12" overrides: those are sentence completions.
    for line in lines:
        m = INSTR_BLOCK.search(line)
        if m:
            lo, hi = sorted((int(m.group(1)), int(m.group(2))))
            for n in range(lo, hi + 1):
                mapping[n] = 'sentence_completion'
    return mapping


def parse_chapter(ch):
    lines, domain = ch['lines'], ch['domain']
    tmap = type_ranges(lines, domain)
    notes = []

    # Slice the chapter into blocks, one per question number.
    blocks, cur, num = [], [], None
    for line in lines:
        m = Q_MARK.match(line)
        if m:
            if num is not None:
                blocks.append((num, cur))
            num = int(m.group(1) or m.group(2))
            cur = [line[m.end():]]
        elif num is not None:
            cur.append(line)
    if num is not None:
        blocks.append((num, cur))

    items = []
    for n, body in blocks:
        item = parse_item(n, body, domain, ch['chapter'], tmap, notes)
        if item:
            items.append(item)

    # Reading passages / figures: the prose that sits between the sub-header
    # and the first question of a reading run. Extracted as a stimulus stub —
    # these always need a human pass, so they are flagged.
    stimuli = []
    reading = sorted(k for k, v in tmap.items()
                     if v in ('reading_question', 'figure_question'))
    if reading:
        sid = '%s%d-s1' % (domain[0], ch['chapter'])
        stimuli.append({
            'id': sid,
            'kind': 'figure' if tmap[reading[0]] == 'figure_question' else 'reading_passage',
            'title': 'קטע/תרשים — להשלמה',
            'body': '',
            'review': 'הקטע לא חולץ אוטומטית. הדביקו כאן את גוף הקטע, או תרשים ב-image.'
        })
        for it in items:
            if it['type'] in ('reading_question', 'figure_question'):
                it['stimulusId'] = sid
        notes.append('%s פרק %d: יש %d שאלות על קטע/תרשים — גוף הקטע דורש הדבקה ידנית.'
                     % (domain, ch['chapter'], len(reading)))
    return items, stimuli, notes


def parse_item(n, body_lines, domain, chapter, tmap, notes):
    text = '\n'.join(body_lines).strip()
    if not text:
        return None

    parts = list(OPT_MARK.finditer(text))
    # Keep the last clean run of markers numbered 1,2,3,4.
    idx = [i for i, m in enumerate(parts) if m.group(1) == '1']
    start = None
    for i in reversed(idx):
        seq = [m.group(1) for m in parts[i:i + 4]]
        if seq == ['1', '2', '3', '4']:
            start = i
            break

    item_id = '%s%d-%d' % (domain[0], chapter, n)
    item = {'id': item_id, 'number': n,
            'type': tmap.get(n), 'stem': '', 'options': [], 'answer': None}

    if start is None:
        item['stem'] = squash(text)
        item['options'] = ['', '', '', '']
        item['review'] = 'לא זוהו ארבעה מסיחים — השלימו ידנית.'
        notes.append('%s: לא זוהו מסיחים.' % item_id)
    else:
        run = parts[start:start + 4]
        item['stem'] = squash(text[:run[0].start()])
        opts = []
        for i, m in enumerate(run):
            end = run[i + 1].start() if i + 1 < len(run) else len(text)
            opts.append(squash(text[m.end():end]))
        item['options'] = opts

    if not item['type']:
        item['type'] = default_type(domain)
        item.setdefault('review', '')
        item['review'] = (item['review'] + ' ' if item['review'] else '') + \
            'סוג השאלה לא נקבע מכותרת משנה — נבחר %s כברירת מחדל.' % item['type']
        notes.append('%s: סוג לא ודאי.' % item_id)

    if not item['stem']:
        item['review'] = (item.get('review', '') + ' גוף השאלה ריק.').strip()
    return item


def default_type(domain):
    return {'verbal': 'logic', 'quantitative': 'problem',
            'english': 'sentence_completion'}[domain]


def squash(s):
    s = re.sub(r'[ \t]+', ' ', s)
    s = re.sub(r'\n{2,}', '\n\n', s)
    return s.strip()


def parse_answer_key(lines):
    """Rows of 1..N followed by a row of N answers in 1-4, under a section name."""
    key, section = {}, None
    ints = lambda l: [int(t) for t in re.findall(r'\b\d{1,2}\b', l)]

    for i, line in enumerate(lines):
        d = next((dm for rx, dm in DOMAIN_HEADERS if rx.search(line)), None)
        if d:
            chapter = 1
            for word, num in CHAPTER_WORDS.items():
                if re.search(r'(?:פרק|Section)\s+' + word, line):
                    chapter = num
                    break
            section = (d, chapter)
            continue
        if not section:
            continue
        nums = ints(line)
        if len(nums) >= 8 and nums == list(range(1, len(nums) + 1)):
            for j in range(i + 1, min(i + 5, len(lines))):
                ans = ints(lines[j])
                if len(ans) == len(nums) and all(1 <= a <= 4 for a in ans):
                    for q, a in zip(nums, ans):
                        key['%s%d-%d' % (section[0][0], section[1], q)] = a
                    break
    return key


# ---------------------------------------------------------------------------

def to_bank(chapters, answer_key, title):
    sections, missing = [], 0
    for ch in chapters:
        items = []
        for it in ch['items']:
            ans = answer_key.get(it['id'])
            if ans is None:
                missing += 1
                it['review'] = (it.get('review', '') + ' התשובה הנכונה לא נמצאה במפתח.').strip()
            out = {'id': it['id'], 'type': it['type'], 'stem': it['stem'],
                   'options': it['options'], 'answer': ans or 1}
            if it.get('stimulusId'):
                out['stimulusId'] = it['stimulusId']
            if it.get('review'):
                out['review'] = it['review'].strip()
            items.append(out)
        sections.append({
            'id': '%s%d' % (ch['domain'][0], ch['chapter']),
            'domain': ch['domain'],
            'title': '%s — פרק %d' % (ch['domain'], ch['chapter']),
            'stimuli': ch['stimuli'],
            'items': items,
        })
    return {'meta': {'id': 'extracted', 'title': title, 'language': 'he',
                     'source': 'pdf_to_bank.py'},
            'sections': sections}, missing


def report(bank, missing_answers):
    total = sum(len(s['items']) for s in bank['sections'])
    flagged = [(s['id'], i['id'], i['review'])
               for s in bank['sections'] for i in s['items'] if i.get('review')]
    stim = [(s['id'], t['id']) for s in bank['sections'] for t in s['stimuli'] if t.get('review')]

    print('חולצו %d שאלות ב-%d פרקים.' % (total, len(bank['sections'])))
    for s in bank['sections']:
        types = {}
        for i in s['items']:
            types[i['type']] = types.get(i['type'], 0) + 1
        print('  %-6s %2d שאלות  %s' % (s['id'], len(s['items']),
              ', '.join('%s×%d' % (k, v) for k, v in sorted(types.items()))))
    print()
    print('דורש בדיקה ידנית:')
    print('  %d שאלות מסומנות ב-review' % len(flagged))
    print('  %d שאלות בלי תשובה נכונה במפתח' % missing_answers)
    print('  %d קטעים/תרשימים להדבקה' % len(stim))
    if flagged:
        print('\nעשרת הראשונים:')
        for sid, iid, why in flagged[:10]:
            print('  %-10s %s' % (iid, why))
    print('\nחפשו "review" בקובץ, תקנו, ומחקו את השדה. ואז:')
    print('  node mapam.js validate <bank.json>')


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('pdf', nargs='?', help='booklet PDF')
    ap.add_argument('--from-text', help='skip extraction, parse this text dump')
    ap.add_argument('-o', '--out', help='write bank JSON here')
    ap.add_argument('--title', default='בחינה מחולצת')
    ap.add_argument('--report', action='store_true', help='only print what needs review')
    ap.add_argument('--dump-text', help='write the extracted text here and stop')
    a = ap.parse_args()

    if a.from_text:
        text = open(a.from_text, encoding='utf-8').read()
    elif a.pdf:
        text = read_pdf(a.pdf)
    else:
        ap.error('give a PDF or --from-text')

    if a.dump_text:
        open(a.dump_text, 'w', encoding='utf-8').write(text)
        print('wrote', a.dump_text)
        return

    chapters, key = parse(text)
    if not chapters:
        sys.exit('No chapters recognised. Check the running headers with --dump-text.')
    bank, missing = to_bank(chapters, key, a.title)

    if a.out:
        with open(a.out, 'w', encoding='utf-8') as f:
            json.dump(bank, f, ensure_ascii=False, indent=2)
        print('wrote %s' % a.out)
    elif not a.report:
        print(json.dumps(bank, ensure_ascii=False, indent=2))
    report(bank, missing)


if __name__ == '__main__':
    main()
