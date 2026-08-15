# מפע״ם builder — turn any psychometric test into a timed MAPAM sitting

A paper psychometric test gives you 20 minutes for a whole chapter. MAPAM gives each
question its own clock, moves on when the clock runs out, and never lets you go back.
Converting between them is not formatting — it's re-planning the sitting.

This repo does that in four stages:

```
 bank.json ──▶ validate ──▶ select (blueprint) ──▶ schedule (timing + breaks) ──▶ run
   your          catch          MAPAM-length          per-question clocks,        browser
   items       problems         subset of items       stimuli, breaks             runner
```

## Layout

TypeScript throughout, laid out in the four rings of clean architecture. The rule
is one-directional: **nothing points outwards.** The domain has no idea a browser,
a file system or a CLI exists, which is why the whole engine is testable without
any of them.

```
src/
  domain/          the format itself — rulebook, blueprints, scales, validator,
                   builder, scoring. Zero imports from anywhere else.
  application/     use cases (validate / build / score) and the ports they
                   need (BankRepository, RandomSource).
  infrastructure/  adapters that satisfy those ports: fs, seeded PRNG, DOM,
                   FileReader, download.
  presentation/    the CLI and the browser runner — views, controller, and the
                   two composition roots that wire everything together.
```

| | |
|---|---|
| `src/domain/rules/` | The rulebook, the blueprints, the labels, the conversion tables. **Everything format-specific lives here.** |
| `src/domain/services/` | Validator, builder, scoring — pure functions over the model. |
| `src/presentation/cli/` | `mapam validate` / `schedule` / `json`. |
| `src/presentation/web/` | The runner: views per screen, one controller, ports for clock and screen. |
| `schema/bank.schema.json` | JSON Schema for the input format. |
| `data/example-winter-2023.json` | A short excerpt of the Winter 2023 practice test, showing every item type. |
| `app/mapam-runner.template.html` | The runner's shell: markup and the whole stylesheet. |
| `mapam-runner.html` | **Built, standalone runner.** Open it in a browser — no server, no install. |
| `scripts/build-runner.mjs` | Bundles the web layer and inlines it + a bank into that one file. |
| `tools/pdf_to_bank.py` | **PDF → bank extractor.** Tuned to NITE booklet layout. |
| `tests/` | Pipeline tests, plus a headless walk through the built runner. |
| `legacy/` | The original JavaScript, kept for reference. Nothing imports it. |

## Start here

Node 24+ runs the TypeScript sources directly — no build step for the CLI.

```bash
npm install
npm run mapam -- validate data/example-winter-2023.json
npm run mapam -- schedule data/example-winter-2023.json --blueprint standard --seed a
npm run build                                   # type-check + rebuild mapam-runner.html
node scripts/build-runner.mjs data/my-bank.json # rebuild it with your bank embedded
```

Or just open `mapam-runner.html` and drag a bank file onto it.

## The rulebook

All of it is the `RULES` object in `src/domain/rules/rulebook.ts`. Change a number
there and the schedule, the runner and the CLI all follow.

**Time per question** (minutes)

| | verbal | quantitative | english |
|---|---|---|---|
| analogy | 1.5 | | |
| sentence completion | 3 | | 2 |
| logic / inference | 4 | | |
| restatement | | | 4 |
| problem | | 4 | |
| reading a passage | 7 | | 7 |
| studying a figure/table | | 5 | |
| question on a passage | 4 | | 4 |
| question on a figure/table | | 4 | |

**Writing task** — 30 minutes standard; 35/40/45 are the approved accommodations.

**Breaks** — 5 minutes after the writing task, after verbal and after quantitative;
2.5 minutes between chapters inside a domain. Breaks can be cut short.

**Behaviour** — no going back, answering early advances, running out of time advances,
and the passage or table stays on screen while its questions are answered.

## Blueprints: why a converted test isn't the whole test

Run a full paper test at MAPAM's per-question rates and you get a nine-hour sitting.
A real sitting is capped at five and a half hours. So the converter *selects* rather
than copies:

```ts
BLUEPRINTS.standard = {
  verbal:       { chapters: 2, analogy: 6, sentence_completion: 5, logic: 7,
                  reading_passage: 2, reading_question: 6 },
  quantitative: { chapters: 2, problem: 15, figure: 2, figure_question: 5 },
  english:      { chapters: 2, sentence_completion: 10, restatement: 7,
                  reading_passage: 2, reading_question: 7 }
}
```

That lands on 5h26m including the writing task and breaks — just inside the ceiling.
`half` is a warm-up run at roughly half the clock. `full` takes the bank as-is, which
is what you want for a single-chapter drill.

`reading_passage` and `figure` count *stimuli*; `reading_question` and `figure_question`
count questions drawn across them, spread as evenly as the bank allows. Selection is
seeded, so `--seed a` and `--seed b` give two different sittings from one bank and each
is reproducible. If the bank is short, the builder says so instead of silently shrinking
the test.

Blueprint counts are calibrated against the time ceiling, not published by NITE. Tune
them and re-run `npm run mapam -- schedule` — it reports whether you're inside the cap.

## Adding a test

Write a bank against `schema/bank.schema.json`. The shape per question:

```json
{ "id": "v1-1", "type": "analogy",
  "stem": "עוגן : להפליג —",
  "options": ["תריס : להחשיך", "קשר : להתיר", "מפתח : לנעול", "פקק : למזוג"],
  "answer": 4 }
```

Questions that hang off a passage or table carry `"stimulusId"`, and the stimulus is
declared once in the section's `stimuli` array. Tables go in `html`; scanned figures go
in `image` as a URL or a `data:` URI. `"scored": false` reproduces
*הפריט אינו נכלל בחישוב הציון*.

Run `npm run mapam -- validate` on it. The validator names the item and the problem —
duplicate ids, an item type that doesn't exist in its domain, a `stimulusId` pointing at
nothing, an answer outside 1–4.

## PDF → bank

```bash
python3 tools/pdf_to_bank.py exam.pdf -o data/my-bank.json
```

Five stages, and it tells you where each one gave up:

1. **Text layer** — `pdftotext -layout`, falling back to `pdfplumber`. A scanned booklet
   with no text layer needs OCR first: `ocrmypdf -l heb+eng exam.pdf exam-ocr.pdf`.
2. **Page tagging** — the running header on every page (`חשיבה מילולית - פרק ראשון`)
   gives the domain and the chapter.
3. **Type ranges** — this is the part that makes it work. NITE prints
   `אנלוגיות (שאלות 1-6)` above each run, so the item types are *read*, not guessed.
   `הוראות לשאלות 10-12` overrides the enclosing run, which is the one case where the
   sub-header isn't the whole story.
4. **Items** — split on the question markers, then on the option markers. Hebrew pages
   come out of `pdftotext` with mirrored punctuation, so `(1)` arrives as `)1(` and
   `1.` as `.1`; the parser expects both.
5. **Answer key** — the `מפתח תשובות נכונות` page is parsed and merged in by section.

Anything it isn't sure about lands in the JSON as a `"review"` field instead of being
silently guessed. Fix it, delete the field, then `npm run mapam -- validate`.

**What it will not do for you:** passage and figure bodies. Reading questions get wired
to a stimulus stub with a `review` note, and you paste the passage in (or point `image`
at a cropped scan). Multi-column booklet layouts scramble prose badly enough that
automatic extraction would quietly corrupt it, and a corrupted passage is worse than an
empty one.

To see the shape of the output before pointing it at your own booklet:

```bash
python3 tools/pdf_to_bank.py --from-text tools/fixtures/nite-sample.txt -o /tmp/b.json
python3 tools/test_parser.py     # 13 items across all three domains, ids/types/answers
```

If nothing is recognised, run `--dump-text` and look at what the running headers actually
say — that's the hook everything else hangs off, and it's one regex in `DOMAIN_HEADERS`.

## Scoring

`ScoreAttemptUseCase` returns raw scores, uniform scores (50–150), the three weighted
composites, and estimated general scores (200–800).

The conversion tables in `src/domain/rules/scales.ts` are the ones printed with the
Winter 2023 booklet — **they're sitting-specific, so swap them when you swap tests.**
The published general-score table is banded on whole numbers while a weighted score is
fractional, so the code reads each band as a continuous interval and interpolates inside
it. Checked against the booklet's own worked example (V=130, Q=109, E=112): all three
composites land inside the bands it prints.

Two honest caveats. The estimate assumes you answered every question in a full-length
test, so a `half` sitting will read low. And the writing task isn't scored — the booklet
assumes it matches your verbal level.

## The runner

`mapam-runner.html` is one file with no dependencies. It loads webfonts from Google when
online and falls back to system faces when not, so it still works on a locked-down exam
machine.

**The design brief was: don't raise the pulse.** A per-question countdown is inherently
stressful, so everything else is built to take pressure off.

- **Palette** — desaturated eucalyptus on warm paper. The only saturated colour in the
  whole interface is the sage used for the answer you selected.
- **Type** — Bellefair for headings (a delicate Hebrew serif), Rubik for the interface
  (rounded terminals, easy to read fast), Noto Serif Hebrew for passages and question
  stems, Outfit for numerals.
- **The time dial**, top corner: a ring that unwinds, easing sage → sand → dusty rose as
  time goes. It never turns alarm red — you can see you're near the end without being
  startled at it.
- **The journey rail**, a 2px line across the top, fills across the *whole* sitting. Knowing
  how much is left overall is the thing that actually reduces anxiety; the per-question
  clock only tells you about the next four minutes.
- **Breaks breathe.** The break screen carries a circle expanding and contracting on a
  four-seconds-in, four-seconds-out cycle. A break is exactly when you should regulate,
  so the screen gives you something to breathe with instead of a bare countdown.
- **Motion** — screens rise into place, answers cascade in, the selected pip springs.
  All of it collapses under `prefers-reduced-motion`.

Keyboard: `1`–`4` to answer, `Enter` to advance, `Ctrl+Enter` to finish the essay.

At the end: the score breakdown, a per-question review with the time you actually spent on
each, and a downloadable JSON of the attempt.

## Tests

```bash
npm test          # pipeline tests + a headless walk through every runner screen
npm run typecheck # strict tsc over src/ and tests/
python3 tools/test_parser.py
```

`tests/runner.smoke.test.ts` drives the **built** `mapam-runner.html` in jsdom:
setup, the writing task, questions by keyboard, breaks, and the score at the end.
Rebuild before running it if you changed anything under `src/presentation/web/`.
