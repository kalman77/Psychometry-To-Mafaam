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
  4. Items          Split on question markers, then on option markers. RTL
                    pages come out of pdftotext in *visual* order, so the
                    markers sit at the end of the line, not the start — the
                    Hebrew and English paths differ for exactly that reason.
  5. Answer key     The "מפתח תשובות נכונות" page is parsed and merged in. Its
                    rows run right-to-left on an RTL page, i.e. 23..1.
  6. Writing task   The "מטלת כתיבה" page gives the essay: standing
                    instructions, the framed passage, and the question.
  7. Figures        --images crops diagrams out of the page scan. Every crop is
                    a guess at a region, so every one is flagged for review.
                    --question-images goes further and takes the questions and
                    the reading passages as pictures too, which is the honest
                    thing to do with an RTL booklet: the text layer reorders
                    Hebrew prose, the scan does not.

Everything the parser is unsure about is written into the JSON as a "review"
field rather than silently guessed. Grep for it, fix it, delete it.
"""

import argparse, base64, json, os, re, subprocess, sys, unicodedata

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

# The sub-header that opens a chart run — also marks the page the chart is on.
FIGURE_HEADER = re.compile(r'הסקה\s+מ(תרשים|טבלה)')

# Sub-header -> item type. The captured range decides which items get it.
TYPE_HEADERS = [
    (re.compile(r'אנלוגיות'), 'analogy'),
    (re.compile(r'שאלות\s+הבנה\s+והסקה'), 'logic'),
    (re.compile(r'קטע\s+קריאה'), 'reading_question'),
    (re.compile(r'שאלות\s+ובעיות'), 'problem'),
    (FIGURE_HEADER, 'figure_question'),
    (re.compile(r'Sentence\s+Completions?'), 'sentence_completion'),
    (re.compile(r'Restatements?'), 'restatement'),
    (re.compile(r'Reading\s+Comprehension|^\s*Text\s+[IV]+'), 'reading_question'),
]

# "הוראות לשאלות 10-12:" introduces sentence-completion items inside a
# logic run — the one case where a sub-header range is not the whole story.
INSTR_BLOCK = re.compile(r'הוראות\s+לשאלות\s*:?\s*(\d+)\s*[-–]\s*(\d+)')

# "Sentence Completions (Questions 1-8)" on an LTR page; the same sub-header on
# an RTL page comes out as "אנלוגיות (שאלות )6-1" — mirrored paren in the middle,
# range reversed. Both are read here; callers sort the pair.
RANGE = re.compile(r'(?:שאלות|Questions)\s*[)(]?\s*(\d+)\s*[-–]\s*(\d+)')

# Question markers. An LTR page keeps "1." at the head of the line. An RTL page
# is laid out right-to-left, so the number is drawn at the highest x and lands
# at the *end* of the extracted line, mirrored: "בית ספר : השכלה -   .1".
Q_MARK = re.compile(r'^\s*(?:\.(\d{1,2})|(\d{1,2})\.)\s+(?=\S)')
# On a figure-heavy page a stray label ("A", "x") can be drawn further right
# than the number, so allow a tail of one- or two-character debris. A line that
# mixes directions sometimes puts the number at the head instead.
RTL_Q_MARK = re.compile(r'(?:^|\s)\.(\d{1,2})(?:\s+\S{1,2})*\s*$')
RTL_Q_HEAD = re.compile(r'^\s*\.(\d{1,2})\s*(?=\S)')

# Option markers. LTR: "(1) body". RTL puts the digit last, with the body either
# outside the mirrored parens ("חדר הלבשה : בגדים  ()1") or inside them ("(5 )1").
OPT_MARK = re.compile(r'[)(](\d)[)(]\s*')
RTL_OPT_MARK = re.compile(r'\(([^()]*)\)\s*(\d)\s*$')
# An option long enough to wrap keeps its marker at the head of the line.
RTL_OPT_HEAD = re.compile(r'^\s*\(\s*\)\s*(\d)\s*(?=\S)')

# The writing-task page. Its instructions are boilerplate and always open the
# same way; whatever follows the last of them is the essay itself.
WRITING_PAGE = re.compile(r'מטלת\s+כתיבה|WRITING\s+TASK')
WRITING_MINUTES = re.compile(r'הזמן\s+המוקצב\s+הוא\s*(\d+)\s*דקות')
WRITING_MIN_LINES = re.compile(r'אורך\s+החיבור\s+הנדרש\s*[-–]?\s*(\d+)\s*[-–]?\s*שורות')
WRITING_INSTRUCTION = re.compile(r'^(?:קראו\s+בעיון|אורך\s+החיבור|כתבו)')
WRITING_QUESTION = re.compile(r'^לדעתכם')
# 30 is standard; the longer values are approved accommodations. Anything else
# read off the page is a misparse, so it is dropped rather than written out.
WRITING_ALLOWED_MINUTES = (30, 35, 40, 45)
# Niqqud is dropped before matching ("כִּתבו" -> "כתבו") and kept in the output.
NIQQUD = re.compile(r'[\u0591-\u05c7]')

# Standing instructions above a passage — not part of it.
PASSAGE_INSTRUCTION = re.compile(
    r'קראו\s+בעיון\s+את\s+הקטע'
    r'|עיינו\s+היטב'
    r'|Reading\s+Comprehension'
    r'|^\s*This\s+part\s+consists'
    r'|^\s*question,\s+choose')
# The booklet numbers every fifth line of a passage in the margin: "(5)" on an
# LTR page, and the mirrored "()5" — often with the digits dropped — on an RTL one.
PASSAGE_LINE_NO = re.compile(r'^\s*\(\d{1,3}\)[\s\t]*')
PASSAGE_LINE_NO_RTL = re.compile(r'\s{3,}\(\s*\)?\s*\d{0,3}\s*$')
# "השאלות" closes a Hebrew passage; the questions start on the next line.
PASSAGE_END = re.compile(r'^\s*השאלות\s*$')

ANSWER_KEY_PAGE = re.compile(r'מפתח\s+תשובות\s+נכונות')
BLANK_PAGE = re.compile(r'עמוד\s+ריק')
# The quantitative chapters open with a formula sheet, itself a numbered list
# (".11 זוויות פנימיות..."). It runs to the foot of the page.
FORMULA_SHEET = re.compile(r'^\s*נוסחאות\s*$')

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


def bare(line):
    """Vowel-pointing off, for matching only."""
    return NIQQUD.sub('', line).strip()


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
    chapters, answer_key, writing = [], {}, None
    current = None

    for page_no, raw_page in enumerate(pages, 1):
        lines = [clean(l) for l in raw_page.split('\n')]
        joined = '\n'.join(lines)

        if ANSWER_KEY_PAGE.search(joined):
            answer_key.update(parse_answer_key(lines))
            continue
        if WRITING_PAGE.search(joined):
            # Its running header says "חשיבה מילולית", so without this the essay
            # would be swept into the first verbal chapter.
            if writing is None:
                writing = parse_writing_task(lines)
                if writing:
                    writing['page'] = page_no
            continue
        if BLANK_PAGE.search(joined) and len([l for l in lines if l.strip()]) < 8:
            continue

        domain, chapter = page_tag(lines)
        if domain:
            key = (domain, chapter)
            if current is None or current['key'] != key:
                current = {'key': key, 'domain': domain, 'chapter': chapter,
                           'lines': [], 'pages': [], 'runs': []}
                chapters.append(current)
        if current is None:
            continue
        cut = next((i for i, l in enumerate(lines) if FORMULA_SHEET.match(l)), None)
        if cut is not None:
            lines = lines[:cut]
        else:
            # The formula sheet is a numbered list too, so it is kept out of the
            # figure pass as firmly as it is kept out of the item pass.
            current['pages'].append(page_no)
        # Where each passage or chart run opens — the page its stimulus is on.
        for _, lo, hi, kind in sub_headers(lines):
            if kind in ('reading_question', 'figure_question'):
                current['runs'].append((page_no, lo, hi))
        current['lines'].extend(l for l in lines if not is_noise(l))

    out = []
    for ch in chapters:
        items, stimuli, notes = parse_chapter(ch)
        if items:
            out.append({'domain': ch['domain'], 'chapter': ch['chapter'],
                        'pages': ch['pages'], 'runs': ch['runs'],
                        'items': items, 'stimuli': stimuli, 'notes': notes})
    return out, answer_key, writing


def parse_writing_task(lines):
    """The essay page: a clock, standing instructions, the framed passage, and
    the question. The instructions are boilerplate, so the last of them is the
    seam — everything past it is the task itself."""
    body = [l.strip() for l in lines if l.strip()]

    def first(rx):
        for line in body:
            m = rx.search(bare(line))
            if m:
                return int(m.group(1))
        return None

    minutes, min_lines = first(WRITING_MINUTES), first(WRITING_MIN_LINES)

    body = [l for l in body if not is_noise(l) and not WRITING_PAGE.search(l)]
    seam = None
    for i, line in enumerate(body):
        if WRITING_INSTRUCTION.match(bare(line)):
            seam = i
    if seam is None or seam + 1 >= len(body):
        return None

    task = {'prompt': join_writing(body[seam + 1:])}
    intro = squash(' '.join(body[:seam + 1]))
    if intro:
        task['intro'] = intro
    if minutes in WRITING_ALLOWED_MINUTES:
        task['minutes'] = minutes
    if min_lines:
        task['minLines'] = min_lines
    return task


def join_writing(tail):
    """Passage and question are one field, split by a blank line the way the
    hand-written banks do it."""
    cut = next((i for i, l in enumerate(tail) if WRITING_QUESTION.match(bare(l))), None)
    if cut is None or cut == 0:
        return squash(' '.join(tail))
    return squash(' '.join(tail[:cut])) + '\n\n' + squash(' '.join(tail[cut:]))


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


def sub_headers(lines):
    """[(line index, lo, hi, type)] — every "אנלוגיות (שאלות 1-6)" in order.

    The index matters as much as the range: a reading run's passage is the
    prose between its sub-header and its first question."""
    found = []
    for i, line in enumerate(lines):
        m = RANGE.search(line)
        if not m:
            continue
        lo, hi = sorted((int(m.group(1)), int(m.group(2))))
        for rx, t in TYPE_HEADERS:
            if rx.search(line):
                found.append((i, lo, hi, t))
                break
    return found


def type_ranges(lines, domain):
    """Map question number -> item type, from the sub-headers."""
    ranges = [(lo, hi, t) for _, lo, hi, t in sub_headers(lines)]
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


def is_rtl(lines):
    """Which way round is this chapter? Ask the question markers, not the
    domain — a booklet is free to mix."""
    ltr = sum(1 for l in lines if Q_MARK.match(l))
    rtl = sum(1 for l in lines if RTL_Q_MARK.search(l))
    return rtl > ltr


def split_questions(lines, rtl):
    """Chapter -> blocks, one per question number. On an RTL page the marker
    ends the line, so the text that belongs to it is what came before."""
    blocks, cur, num = [], [], None
    for line in lines:
        m = RTL_Q_MARK.search(line) if rtl else Q_MARK.match(line)
        head = RTL_Q_HEAD.match(line) if rtl and not m else None
        if m or head:
            if num is not None:
                blocks.append((num, cur))
            hit = m or head
            num = int(next(g for g in hit.groups() if g))
            cur = [line[:hit.start()] if m and rtl else line[hit.end():]]
        elif num is not None:
            cur.append(line)
    if num is not None:
        blocks.append((num, cur))
    return blocks


def parse_chapter(ch):
    lines, domain = ch['lines'], ch['domain']
    tmap = type_ranges(lines, domain)
    notes = []
    rtl = is_rtl(lines)

    items = []
    for n, body in split_questions(lines, rtl):
        item = parse_item(n, body, domain, ch['chapter'], tmap, notes, rtl)
        if item:
            items.append(item)

    stimuli = read_stimuli(lines, domain, ch['chapter'], rtl, notes)
    for stimulus in stimuli:
        lo, hi = stimulus['range']
        for it in items:
            if lo <= it['number'] <= hi:
                it['stimulusId'] = stimulus['id']
    return items, stimuli, notes


def passage_body(lines, start, rtl):
    """The prose between a reading sub-header and its first question.

    An English chapter carries two passages, so this runs per sub-header rather
    than once per chapter — that is what keeps "Text I" and "Text II" apart."""
    body = []
    for line in lines[start + 1:]:
        if RTL_Q_MARK.search(line) if rtl else Q_MARK.match(line):
            break
        if PASSAGE_END.match(line):
            break
        if PASSAGE_INSTRUCTION.search(line):
            continue
        line = PASSAGE_LINE_NO_RTL.sub('', line) if rtl else PASSAGE_LINE_NO.sub('', line)
        body.append(line.strip())

    # Blank lines separate paragraphs; runs of them do not.
    out, blank = [], False
    for line in body:
        if not line:
            blank = bool(out)
            continue
        out.append(('\n\n' if blank else ' ') + line if out else line)
        blank = False
    return ''.join(out).strip()


def read_stimuli(lines, domain, chapter, rtl, notes):
    """One stimulus per reading or figure run, with its question range.

    A chart cannot be read out of a text layer, so a figure run keeps whatever
    prose introduces it and waits for --images to supply the picture."""
    stimuli = []
    for start, lo, hi, kind in sub_headers(lines):
        if kind not in ('reading_question', 'figure_question'):
            continue
        figure = kind == 'figure_question'
        sid = '%s%d-s%d' % (domain[0], chapter, len(stimuli) + 1)
        body = passage_body(lines, start, rtl)
        stimulus = {
            'id': sid,
            'kind': 'figure' if figure else 'reading_passage',
            'title': 'תרשים' if figure else 'קטע קריאה',
            'body': body,
            'range': (lo, hi),
        }
        if figure:
            stimulus['review'] = 'התרשים עצמו דורש --images או הדבקה ידנית ב-image.'
        elif not body:
            stimulus['review'] = 'גוף הקטע לא חולץ — הדביקו אותו כאן.'
            notes.append('%s%d: קטע הקריאה לשאלות %d-%d ריק.' % (domain[0], chapter, lo, hi))
        stimuli.append(stimulus)
    return stimuli


def last_clean_run(digits):
    """Index of the last '1','2','3','4' in a row, or None."""
    for i in range(len(digits) - 4, -1, -1):
        if digits[i:i + 4] == ['1', '2', '3', '4']:
            return i
    return None


def split_options_ltr(text):
    """Markers are inline, so slice the block by marker offsets."""
    parts = list(OPT_MARK.finditer(text))
    start = last_clean_run([m.group(1) for m in parts])
    if start is None:
        return None, None
    run = parts[start:start + 4]
    opts = []
    for i, m in enumerate(run):
        end = run[i + 1].start() if i + 1 < len(run) else len(text)
        opts.append(squash(text[m.end():end]))
    return squash(text[:run[0].start()]), opts


def split_options_rtl(body_lines):
    """One option per line, digit last. Anything between two options is a
    wrapped continuation of the earlier one; anything after the fourth is
    layout debris and is dropped."""
    marks = []                                  # (line index, digit, body)
    for i, line in enumerate(body_lines):
        m = RTL_OPT_MARK.search(line)
        if m:
            marks.append((i, m.group(2), (line[:m.start()] + ' ' + m.group(1)).strip()))
            continue
        m = RTL_OPT_HEAD.match(line)
        if m:
            marks.append((i, m.group(1), line[m.end():].strip()))

    start = last_clean_run([d for _, d, _ in marks])
    if start is None:
        return None, None
    run = marks[start:start + 4]

    opts = []
    for i, (li, _, body) in enumerate(run):
        end = run[i + 1][0] if i + 1 < len(run) else li + 1
        wrapped = [l for l in body_lines[li + 1:end] if l.strip()]
        opts.append(squash(' '.join([body] + wrapped)))
    return squash('\n'.join(body_lines[:run[0][0]])), opts


def parse_item(n, body_lines, domain, chapter, tmap, notes, rtl):
    text = '\n'.join(body_lines).strip()
    if not text:
        return None

    item_id = '%s%d-%d' % (domain[0], chapter, n)
    item = {'id': item_id, 'number': n,
            'type': tmap.get(n), 'stem': '', 'options': [], 'answer': None}

    stem, opts = (split_options_rtl(body_lines) if rtl else split_options_ltr(text))

    if opts is None:
        item['stem'] = squash(text)
        item['options'] = ['', '', '', '']
        item['review'] = 'לא זוהו ארבעה מסיחים — השלימו ידנית.'
        notes.append('%s: לא זוהו מסיחים.' % item_id)
    else:
        item['stem'] = stem
        item['options'] = opts
        if any(not o.strip() for o in opts):
            item['review'] = 'מסיח אחד או יותר יצא ריק — השלימו ידנית.'
            notes.append('%s: מסיח ריק.' % item_id)

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
    """Rows of 1..N followed by a row of N answers in 1-4, under a section name.

    On an RTL page the header row comes out reversed (23..1) and the answer row
    is reversed with it, so the two still line up column for column."""
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
        if len(nums) >= 8 and sorted(nums) == list(range(1, len(nums) + 1)):
            for j in range(i + 1, min(i + 5, len(lines))):
                ans = ints(lines[j])
                if len(ans) == len(nums) and all(1 <= a <= 4 for a in ans):
                    for q, a in zip(nums, ans):
                        key['%s%d-%d' % (section[0][0], section[1], q)] = a
                    break
    return key


# ---------------------------------------------------------------------------
# Figures.
#
# A NITE booklet is a page scan with an invisible text layer laid over it, so a
# diagram is not an object we can lift out with pdfimages — it is a *region* of
# the page, and the only way to get it is to crop. `pdftotext -bbox-layout`
# gives every word's box, which is enough to say where the region is:
#
#   * A per-item figure (geometry, a number line) sits in its own column to the
#     left of the question text. Cluster the word boxes of one question's band
#     by x and the gutter between the two columns falls out.
#   * A stimulus figure (a chart with a legend) spans the page and lives on a
#     page of its own, with no question numbers on it at all.
# ---------------------------------------------------------------------------

BBOX_PAGE = re.compile(r'<page width="([\d.]+)" height="([\d.]+)">(.*?)</page>', re.S)
BBOX_WORD = re.compile(r'<word xMin="([\d.-]+)" yMin="([\d.-]+)"'
                       r' xMax="([\d.-]+)" yMax="([\d.-]+)">(.*?)</word>', re.S)
# ".7" in the right margin of an RTL page, "7." in the left margin of an LTR one.
BBOX_QN = re.compile(r'^\.(\d{1,2})$')
BBOX_QN_LTR = re.compile(r'^(\d{1,2})\.$')
# Option markers survive into the box dump as ")1(" — the mirrored "(1)".
BBOX_OPT = re.compile(r'^[)(]\d[)(]$')
# A sub-header ends the run above it. The box dump reverses Hebrew, so
# "שאלות" arrives as "תולאש".
BBOX_SUBHEAD = re.compile(r'תולאש|Questions')
# A stem that says "in the drawing" has a figure even if the columns ran together.
FIGURE_WORDS = re.compile(r'בסרטוט|בתרשים|בגרף|שלפניכם')

PAGE_MARGIN = 60.0      # points of running header / copyright footer to skip
GUTTER = 10.0           # x-gap that separates the figure column from the text
PAD = 8.0               # breathing room around a crop
PROSE_CHARS = 40        # a row this long is a sentence, not a chart label
MIN_FIGURE_HEIGHT = 120.0   # anything shorter is not the chart we came for
MAX_FIGURE_WIDTH = 0.5  # of the page: wider than this and the "gutter" was noise
MIN_INK = 600           # dark pixels at 150 dpi below which the crop is blank


def read_boxes(path):
    """[(width, height, [(x0, y0, x1, y1, text)])] — one entry per PDF page.

    pdftotext writes the odd raw control character into this XML, so it is read
    with regexes rather than a parser that would (rightly) reject it."""
    out = subprocess.run(['pdftotext', '-bbox-layout', path, '-'],
                         capture_output=True, check=True)
    raw = out.stdout.decode('utf-8', 'replace')
    pages = []
    for w, h, body in BBOX_PAGE.findall(raw):
        words = [(float(a), float(b), float(c), float(d), clean(txt).strip())
                 for a, b, c, d, txt in BBOX_WORD.findall(body)]
        pages.append((float(w), float(h), words))
    return pages


def question_bands(page):
    """Question number -> the vertical strip of the page that belongs to it.

    The numbers sit in the margin the page reads from — right on an RTL page,
    left on an LTR one. Anything else shaped like ".7" is a figure label or the
    end of a sentence, so the x test is what makes this reliable."""
    width, height, words = page

    def number(x0, txt):
        if BBOX_QN.match(txt) and x0 > 0.8 * width:
            return int(BBOX_QN.match(txt).group(1))
        if BBOX_QN_LTR.match(txt) and x0 < 0.2 * width:
            return int(BBOX_QN_LTR.match(txt).group(1))
        return None

    marks = sorted((y0, n, x0)
                   for x0, y0, x1, y1, txt in words
                   for n in [number(x0, txt)] if n is not None)
    # The sub-header that opens the next run also closes this one, so the last
    # question of a run does not swallow it.
    heads = sorted(w[1] for w in words if BBOX_SUBHEAD.search(w[4]))

    bands = {}
    for i, (top, n, _) in enumerate(marks):
        bottom = marks[i + 1][0] if i + 1 < len(marks) else height - PAGE_MARGIN
        head = next((y for y in heads if y > top + PAD), None)
        if head is not None:
            bottom = min(bottom, head)

        # The last question on a page otherwise reaches the foot of it, and all
        # that blank paper is what the picture gets scaled down to fit.
        content = [w[3] for w in words if top <= w[1] and w[3] <= bottom]
        if content:
            bottom = min(bottom, max(content) + PAD)
        bands[n] = (top - PAD / 2, bottom)
    return bands


def x_clusters(spans, gap=GUTTER):
    merged = []
    for a, b in sorted(spans):
        if merged and a - merged[-1][1] <= gap:
            merged[-1][1] = max(merged[-1][1], b)
        else:
            merged.append([a, b])
    return merged


def figure_box(page, band):
    """The drawing's box inside one question's band, or None.

    The text column is the cluster that runs to the right margin; whatever sits
    to the left of it is the drawing. A "drawing" that turns out to be half the
    page wide is a wrapped fraction or a stray option, not a figure — the two
    columns simply never separated, so there is nothing to crop."""
    width, height, words = page
    top, bottom = band
    inside = [w for w in words if w[1] >= top and w[3] <= bottom
              and not BBOX_QN.match(w[4])]
    if not inside:
        return None

    clusters = x_clusters([(w[0], w[2]) for w in inside])
    text_col = next((c for c in reversed(clusters) if c[1] > 0.7 * width), None)
    left = [w for w in inside if text_col and w[2] <= text_col[0]]
    if not left:
        return None

    # A drawing belongs to the stem, so it starts above the first option. One
    # that starts level with them is a wrapped fraction, not a figure. The
    # options do not bound the box, though — a figure may well run past them.
    options = [w[1] for w in inside if BBOX_OPT.match(w[4])]

    if options and min(w[1] for w in left) >= min(options):
        return None

    box = (min(w[0] for w in left) - PAD, min(w[1] for w in left) - PAD,
           max(w[2] for w in left) + PAD, max(w[3] for w in left) + PAD)
    return box if box[2] - box[0] <= MAX_FIGURE_WIDTH * width else None


def band_box(page, band):
    """The whole strip a question occupies — the fallback when the stem
    promises a drawing that the columns failed to isolate."""
    width, height, _ = page
    return (PAGE_MARGIN / 2, band[0], width - PAGE_MARGIN / 2, band[1])


def ink(png, dpi):
    """Dark pixels in a crop. A box built from word positions can still land on
    blank paper — a rule, a watermark, the tail of a fraction — and this is what
    tells the difference between a diagram and an empty rectangle."""
    try:
        from PIL import Image
    except ImportError:
        return None
    import io
    grey = Image.open(io.BytesIO(png)).convert('L')
    return sum(grey.histogram()[:140]) * (150.0 / dpi) ** 2


def text_lines(words, tol=3.0):
    """Word boxes grouped into rows by their top edge."""
    rows = []
    for w in sorted(words, key=lambda w: (w[1], w[0])):
        if rows and abs(w[1] - rows[-1][0][1]) <= tol:
            rows[-1].append(w)
        else:
            rows.append([w])
    return rows


def stimulus_box(page):
    """The chart on a stimulus page.

    Everything on such a page is either a paragraph of prose — the intro above
    and the "שימו לב" note below — or part of the chart itself: a legend, an
    axis label, a percentage. Prose runs long, chart text does not, so the
    chart is the tallest unbroken stretch of short rows. Its own axis labels
    reach as far right as prose does, which is why length decides and position
    does not."""
    width, height, words = page
    body = [w for w in words if PAGE_MARGIN <= w[1] <= height - PAGE_MARGIN]
    if not body:
        return None

    runs, current = [], []
    for row in text_lines(body):
        if sum(len(w[4]) for w in row) >= PROSE_CHARS:
            if current:
                runs.append(current)
            current = []
        else:
            current.append(row)
    if current:
        runs.append(current)
    if not runs:
        return None

    def span(run):
        flat = [w for row in run for w in row]
        return min(w[1] for w in flat), max(w[3] for w in flat)

    top, bottom = max((span(r) for r in runs), key=lambda s: s[1] - s[0])
    if bottom - top < MIN_FIGURE_HEIGHT:
        return None
    return (PAGE_MARGIN / 2, top - PAD, width - PAGE_MARGIN / 2, bottom + PAD)


def passage_box(page):
    """A reading passage: everything under its sub-header, down to the first
    question or the foot of the page.

    Hebrew prose survives the text layer badly — punctuation migrates across
    the line and a stem with a gap in it comes out reordered — so for a scanned
    booklet the page itself is the more faithful source."""
    width, height, words = page
    heads = sorted(w[3] for w in words if BBOX_SUBHEAD.search(w[4]))
    if not heads:
        return None
    top = heads[0] + PAD

    bands = question_bands(page)
    bottom = min([b[0] for b in bands.values()] or [height - PAGE_MARGIN])
    body = [w[3] for w in words if top <= w[1] and w[3] <= bottom]
    if not body:
        return None
    bottom = min(bottom, max(body) + PAD)
    if bottom - top < MIN_FIGURE_HEIGHT:
        return None
    return (PAGE_MARGIN / 2, top, width - PAGE_MARGIN / 2, bottom)


def writing_box(page):
    """The essay task: the page it is printed on, less header and copyright.

    Those sit outside PAGE_MARGIN, so the body of the page is the task."""
    width, height, words = page
    body = [w for w in words if PAGE_MARGIN <= w[1] and w[3] <= height - PAGE_MARGIN]
    if not body:
        return None
    return (PAGE_MARGIN / 2, min(w[1] for w in body) - PAD,
            width - PAGE_MARGIN / 2, max(w[3] for w in body) + PAD)


def crop(pdf, page_no, box, dpi, fmt='png'):
    """pdftocairo crops in device pixels, so the box goes points -> pixels.

    Line art stays PNG; a whole question is a photograph of a page and costs a
    third as much as JPEG."""
    scale = dpi / 72.0
    x0, y0, x1, y1 = box
    args = ['-x', str(int(x0 * scale)), '-y', str(int(y0 * scale)),
            '-W', str(max(1, int((x1 - x0) * scale))),
            '-H', str(max(1, int((y1 - y0) * scale)))]
    out = subprocess.run(['pdftocairo', '-' + fmt, '-r', str(dpi), '-singlefile',
                          '-f', str(page_no), '-l', str(page_no)] + args
                         + [pdf, '-'], capture_output=True, check=True)
    return out.stdout, 'image/jpeg' if fmt == 'jpeg' else 'image/png'


def data_uri(payload):
    blob, mime = payload
    return 'data:%s;base64,%s' % (mime, base64.b64encode(blob).decode('ascii'))


def add_writing_image(writing, pdf, dpi):
    """The essay prompt as printed. Its Hebrew comes off the text layer with
    the punctuation shuffled, exactly as the questions did."""
    page_no = writing.get('page')
    if not page_no:
        return False
    try:
        pages = read_boxes(pdf)
    except (FileNotFoundError, subprocess.CalledProcessError):
        return False
    if page_no > len(pages):
        return False
    box = writing_box(pages[page_no - 1])
    if box is None:
        return False
    writing['image'] = data_uri(crop(pdf, page_no, box, dpi, 'jpeg'))
    writing['prompt'] = ''
    writing.pop('intro', None)
    return True


def add_figures(chapters, pdf, dpi, whole=False):
    """Crop what the parser found and hang it on the items and stimuli.

    With `whole`, every question is replaced by a picture of itself. An RTL page
    comes out of the text layer in visual order, so a stem with a gap in it — a
    sentence completion, a formula — can be reordered past readability. The scan
    has no such problem: it is what the candidate actually sees."""
    try:
        pages = read_boxes(pdf)
    except (FileNotFoundError, subprocess.CalledProcessError):
        return 0, 0, 0, ['pdftotext -bbox-layout failed — no figures extracted.']

    items_done, items_wide, stimuli_done, notes = 0, 0, 0, []
    for ch in chapters:
        by_number = {it['number']: it for it in ch['items']}

        for stimulus in ch['stimuli']:
            page_no = next((p for p, lo, hi in ch['runs']
                            if (lo, hi) == tuple(stimulus['range'])), None)
            if page_no is None or page_no > len(pages):
                continue
            page = pages[page_no - 1]
            figure = stimulus.get('kind') == 'figure'
            if not figure and not whole:
                continue                      # its text came out fine; leave it

            # With `whole`, a stimulus is taken as its whole region of the page —
            # for a chart that means the paragraphs explaining it as well as the
            # drawing, since those read no better off the text layer than the
            # questions did. Otherwise only the chart itself is cropped and the
            # prose beside it stays as text.
            box = passage_box(page) if whole else stimulus_box(page)
            if box is None:
                notes.append('%s: אזור הגירוי לא אותר בעמוד %d.'
                             % (stimulus['id'], page_no))
                continue
            stimulus['image'] = data_uri(crop(pdf, page_no, box, dpi,
                                              'png' if figure and not whole else 'jpeg'))
            if whole:
                # The picture is the stimulus; the reflowed text would fight it.
                stimulus['body'] = ''
            stimulus.pop('review', None)
            stimuli_done += 1

        for page_no in sorted(set(ch['pages'])):
            if page_no > len(pages):
                continue
            page = pages[page_no - 1]

            for n, band in question_bands(page).items():
                item = by_number.get(n)
                if item is None or item.get('image'):
                    continue

                if whole:
                    item['image'] = data_uri(
                        crop(pdf, page_no, band_box(page, band), dpi, 'jpeg'))
                    # The picture carries the question; the scrambled text that
                    # came off the page would only contradict it.
                    item['stem'] = ''
                    item['options'] = ['', '', '', '']
                    item.pop('review', None)
                    items_done += 1
                    continue

                wanted = bool(FIGURE_WORDS.search(item['stem']))

                box = figure_box(page, band)
                if box is not None:
                    png = crop(pdf, page_no, box, dpi)
                    drawn = ink(png[0], dpi)
                    if drawn is None or drawn >= MIN_INK:
                        item['image'] = data_uri(png)
                        item['review'] = ((item.get('review', '') + ' ').lstrip()
                                          + 'הסרטוט נחתך אוטומטית — ודאו שהוא שלם ושייך לשאלה.')
                        items_done += 1
                        continue

                # The stem promises a drawing the columns could not isolate.
                # A crop of the whole strip always contains it, at the cost of
                # repeating the question text, so it is left flagged.
                if wanted:
                    png = crop(pdf, page_no, band_box(page, band), dpi)
                    item['image'] = data_uri(png)
                    item['review'] = ((item.get('review', '') + ' ').lstrip()
                                      + 'התמונה היא רצועת העמוד כולה — חתכו אותה לסרטוט בלבד.')
                    items_wide += 1
                elif box is not None:
                    notes.append('%s: אזור הסרטוט יצא ריק — לא צורף.' % item['id'])

    return items_done, items_wide, stimuli_done, notes


# ---------------------------------------------------------------------------

def to_bank(chapters, answer_key, title, writing=None):
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
            if it.get('image'):
                out['image'] = it['image']
            if it.get('stimulusId'):
                out['stimulusId'] = it['stimulusId']
            if it.get('review'):
                out['review'] = it['review'].strip()
            items.append(out)
        sections.append({
            'id': '%s%d' % (ch['domain'][0], ch['chapter']),
            'domain': ch['domain'],
            'title': '%s — פרק %d' % (ch['domain'], ch['chapter']),
            'stimuli': [{k: v for k, v in s.items() if k != 'range'} for s in ch['stimuli']],
            'items': items,
        })
    bank = {'meta': {'id': 'extracted', 'title': title, 'language': 'he',
                     'source': 'pdf_to_bank.py'}}
    if writing:
        bank['writingTask'] = {k: v for k, v in writing.items() if k != 'page'}
    bank['sections'] = sections
    return bank, missing


def report(bank, missing_answers):
    total = sum(len(s['items']) for s in bank['sections'])
    flagged = [(s['id'], i['id'], i['review'])
               for s in bank['sections'] for i in s['items'] if i.get('review')]
    stim = [(s['id'], t['id']) for s in bank['sections'] for t in s['stimuli']
            if not (t.get('body') or t.get('html') or t.get('image'))]

    print('חולצו %d שאלות ב-%d פרקים.' % (total, len(bank['sections'])))
    task = bank.get('writingTask')
    if task:
        shape = 'תמונה' if task.get('image') else '%d תווים' % len(task.get('prompt') or '')
        print('  מטלת כתיבה: %d דקות, %d שורות, %s.'
              % (task.get('minutes', 30), task.get('minLines', 25), shape))
    for s in bank['sections']:
        types = {}
        for i in s['items']:
            types[i['type']] = types.get(i['type'], 0) + 1
        print('  %-6s %2d שאלות  %s' % (s['id'], len(s['items']),
              ', '.join('%s×%d' % (k, v) for k, v in sorted(types.items()))))
    print()
    print('דורש בדיקה ידנית:')
    if not bank.get('writingTask'):
        print('  מטלת הכתיבה לא חולצה — הוסיפו writingTask ידנית.')
    print('  %d שאלות מסומנות ב-review' % len(flagged))
    print('  %d שאלות בלי תשובה נכונה במפתח' % missing_answers)
    print('  %d קטעים/תרשימים להדבקה' % len(stim))
    cropped = [i['id'] for s in bank['sections'] for i in s['items'] if i.get('image')]
    if cropped:
        print('  %d תמונות שנחתכו אוטומטית' % len(cropped))
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
    ap.add_argument('--images', action='store_true',
                    help='crop diagrams out of the page scan and embed them')
    ap.add_argument('--question-images', action='store_true',
                    help='show every question as a picture of the page instead '
                         'of as text (RTL text layers reorder badly)')
    ap.add_argument('--image-dpi', type=int, default=150,
                    help='resolution for those crops (default 150)')
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

    chapters, key, writing = parse(text)
    if not chapters:
        sys.exit('No chapters recognised. Check the running headers with --dump-text.')

    figures = None
    if a.images or a.question_images:
        if not a.pdf:
            ap.error('--images needs the PDF itself, not --from-text')
        figures = add_figures(chapters, a.pdf, a.image_dpi, whole=a.question_images)
        if a.question_images and writing:
            add_writing_image(writing, a.pdf, a.image_dpi)

    bank, missing = to_bank(chapters, key, a.title, writing)
    if figures:
        items_done, items_wide, stimuli_done, figure_notes = figures
        if a.question_images:
            print('%d שאלות ו-%d קטעים/תרשימים הומרו לתמונות.'
                  % (items_done, stimuli_done))
        else:
            print('חולצו %d סרטוטים, %d רצועות עמוד ו-%d תרשימים.'
                  % (items_done, items_wide, stimuli_done))
        for note in figure_notes:
            print('  %s' % note)

    if a.out:
        with open(a.out, 'w', encoding='utf-8') as f:
            json.dump(bank, f, ensure_ascii=False, indent=2)
        print('wrote %s' % a.out)
    elif not a.report:
        print(json.dumps(bank, ensure_ascii=False, indent=2))
    report(bank, missing)


if __name__ == '__main__':
    main()
