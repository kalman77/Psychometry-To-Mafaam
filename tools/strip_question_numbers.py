#!/usr/bin/env python3
"""Take the printed question number out of an old bank's question pictures.

Only banks extracted before the number was left out of the crop: the extractor
stamps `meta.numbersCropped` on everything it produces now, and a bank carrying
that stamp is left alone. The stamp is what makes this safe — on a bank already
cleaned, the outermost thing on a line is the question itself, and a detector
loose enough to find every number would start cutting into it.


The extractor now leaves it outside the crop, but a bank extracted before that
carries it inside the JPEG, and the booklet it came from is long gone — so the
number has to be found in the picture itself.

It is findable because of where it sits: a column of ink on its own at the
margin, a wide band of blank paper between it and the question. Hebrew prints
it against the right edge, English against the left. Anything that is not a
narrow, isolated cluster on the expected side is left alone, so a bank that has
already been cleaned passes through untouched and a diagram is never mistaken
for a number.

    python3 tools/strip_question_numbers.py bank.json            # what would change
    python3 tools/strip_question_numbers.py bank.json --apply    # write it
"""

import argparse
import base64
import io
import json
import re
import sys

DARK = 140          # a pixel this dark or darker counts as ink
# Ink pixels a column needs before it counts as holding anything. These scans
# carry a faint diagonal watermark that puts two or three dark pixels in every
# column of the page; below this the whole picture reads as one solid block and
# no blank paper can be found in it at all.
MIN_COLUMN = 4
# What a column needs before it counts as *type*. The rule printed under a
# question runs the width of the page and would otherwise read as the page
# reaching all the way into the margin.
TYPE_COLUMN = 9
MAX_NUMBER_W = 0.11  # a number is never wider than this share of the picture
MIN_GAP = 0.014     # blank paper between the number and the question
# A number sits on the first line and nowhere else. The option markers — the
# other narrow, isolated thing at a margin — run down the whole picture, and
# these are what tell the two apart.
NUMBER_TOP = 0.45    # the number's line starts in the top of the picture
MIN_SPECK_W = 0.006  # narrower than this is a speck or a binding mark, not print
OUTER = 0.35         # how far in from the margin the number can be looked for
# How much further into the margin the number reaches than the page below it.
# Small: it is set just outside the text block, not far off in the margin.
PROTRUDE = 0.004
MIN_LINE_H = 8       # a rule or a scanner mark is thinner than a line of type
# Which margin the number is printed against, by domain.
RIGHT_SIDE = ('verbal', 'quantitative')

DATA_URI = re.compile(r'^data:(image/\w+);base64,(.*)$', re.S)


def columns_with_ink(image, floor=MIN_COLUMN):
    """For each column of the picture, whether it holds anything printed.

    `floor` is how much ink a column needs. Raise it to look past the rules and
    watermarks that run across a whole page: they leave a pixel or three in
    every column, where a letter leaves ten."""
    grey = image.convert('L')
    width, height = grey.size
    pixels = grey.load()
    needed = max(floor, height // 120)
    out = []
    for x in range(width):
        found = 0
        for y in range(height):
            if pixels[x, y] <= DARK:
                found += 1
                if found >= needed:
                    break
        out.append(found >= needed)
    return out


def runs_of(inked):
    """The stretches of columns that hold ink, as (start, end) pairs."""
    spans, start = [], None
    for x, has in enumerate(inked):
        if has and start is None:
            start = x
        elif not has and start is not None:
            spans.append((start, x))
            start = None
    if start is not None:
        spans.append((start, len(inked)))
    return spans


def rows_with_ink(image):
    """For each row of the picture, whether it holds anything printed."""
    grey = image.convert('L')
    width, height = grey.size
    pixels = grey.load()
    needed = max(2, width // 200)
    out = []
    for y in range(height):
        found = 0
        for x in range(width):
            if pixels[x, y] <= DARK:
                found += 1
                if found >= needed:
                    break
        out.append(found >= needed)
    return out


def first_line(image):
    """The rows the topmost line of type occupies, or None if there is none.

    Skips anything too thin to be type — the rule under a question, a mark left
    by the scanner — which would otherwise be read as the first line and leave
    nothing to look at."""
    for line in runs_of(rows_with_ink(image)):
        if line[1] - line[0] >= MIN_LINE_H:
            return line
    return None


def has_ink(image, box):
    """Whether a region holds anything more than a stray speck."""
    if box[2] - box[0] < 1 or box[3] - box[1] < 1:
        return False
    grey = image.crop(box).convert('L')
    return sum(grey.histogram()[: DARK + 1]) > MIN_SPECK


def clusters_from_margin(cols, right_side, gap):
    """Printed things on a line, in order outwards-in, as (near, far, band).

    `near` is the edge closest to the margin, `far` the one furthest, and
    `band` the blank stretch that closes it off."""
    order = list(range(len(cols) - 1, -1, -1) if right_side else range(len(cols)))
    out = []
    near = far = None
    blank = 0
    for x in order:
        if cols[x]:
            if near is None:
                near, blank = x, 0
            far = x
            blank = 0
        elif near is not None:
            blank += 1
            if blank >= gap:
                band = (x, far) if right_side else (far, x)
                out.append((near, far, band))
                near = far = None
                blank = 0
    return out


def margin_reach(image, top, bottom, right_side):
    """How far into the margin the page below the first line reaches.

    Specks and binding marks are skipped: they sit further out than anything
    printed, and taken at face value they would make every number look as
    though it were tucked inside the text rather than set outside it."""
    width = image.size[0]
    if top >= bottom:
        return None
    cols = columns_with_ink(image.crop((0, top, width, bottom)), TYPE_COLUMN)
    for near, far, _ in clusters_from_margin(cols, right_side, 1):
        if abs(far - near) >= MIN_SPECK_W * width:
            return near
    return None


def number_free_box(image, right_side):
    """Where to cut, or None when there is nothing that looks like a number.

    The number is looked for on the first printed line, working in from the
    margin it is set against. Whatever is met first is not always it — a page
    scan carries specks and binding marks out in the margin — so each printed
    thing is considered in turn until one looks like a number or the search
    runs too far into the page.

    What makes it a number is reach: it is set outside the text block, so it
    stands further into the margin than anything below it. The option markers,
    the other narrow isolated thing at a margin, line up with the page instead."""
    width, height = image.size
    line = first_line(image)
    if line is None or line[0] > NUMBER_TOP * height:
        return None

    top, bottom = line
    cols = columns_with_ink(image.crop((0, top, width, bottom)))
    gap = max(1, int(MIN_GAP * width))

    edge = margin_reach(image, bottom, height, right_side)

    for near, far, band in clusters_from_margin(cols, right_side, gap):
        first, last = min(near, far), max(near, far)
        # Out past the search window is the question itself, not its number.
        if abs(near - (width if right_side else 0)) > OUTER * width:
            return None
        if last - first < MIN_SPECK_W * width:
            continue           # a speck or a binding mark; keep looking
        if last - first > MAX_NUMBER_W * width:
            return None        # too wide: the question, or a drawing
        if edge is not None:
            out = (near - edge) if right_side else (edge - near)
            if out < max(2, PROTRUDE * width):
                return None    # in line with the page below it, so not a number
        cut = (band[0] + band[1]) // 2
        return (0, 0, cut, height) if right_side else (cut, 0, width, height)
    return None


def strip(uri, right_side):
    """The picture without its number, or None when nothing was found."""
    from PIL import Image

    match = DATA_URI.match(uri or '')
    if not match:
        return None
    mime, payload = match.group(1), match.group(2)
    image = Image.open(io.BytesIO(base64.b64decode(payload)))

    box = number_free_box(image, right_side)
    if box is None:
        return None

    buffer = io.BytesIO()
    fmt = 'JPEG' if mime == 'image/jpeg' else 'PNG'
    cropped = image.crop(box)
    cropped.convert('RGB').save(buffer, fmt, quality=82) if fmt == 'JPEG' \
        else cropped.save(buffer, fmt)
    return 'data:%s;base64,%s' % (mime, base64.b64encode(buffer.getvalue()).decode())


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('bank', help='bank JSON to clean')
    ap.add_argument('--apply', action='store_true', help='write the file back')
    ap.add_argument('-o', '--out', help='write here instead of in place')
    a = ap.parse_args()

    try:
        from PIL import Image  # noqa: F401
    except ImportError:
        sys.exit('Pillow is needed to read the pictures: pip install pillow')

    with open(a.bank, encoding='utf-8') as f:
        bank = json.load(f)

    if bank.get('meta', {}).get('numbersCropped'):
        print('%s: החוברת כבר נקייה ממספרי שאלות.' % a.bank)
        return

    changed = untouched = 0
    for section in bank.get('sections', []):
        right = section.get('domain') in RIGHT_SIDE
        for item in section.get('items', []):
            if not item.get('image'):
                continue
            cleaned = strip(item['image'], right)
            if cleaned is None:
                untouched += 1
            else:
                item['image'] = cleaned
                changed += 1

    print('%d תמונות נוקו, %d נותרו כמות שהן.' % (changed, untouched))
    if not (a.apply or a.out):
        print('לא נכתב דבר. הריצו שוב עם --apply.')
        return

    # Stamped whether or not every picture gave up its number: the pass has
    # been made, and running it again would only start cutting into questions.
    bank.setdefault('meta', {})['numbersCropped'] = True
    out = a.out or a.bank
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(bank, f, ensure_ascii=False)
    print('wrote %s' % out)


if __name__ == '__main__':
    main()
