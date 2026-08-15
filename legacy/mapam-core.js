/* ============================================================================
 * mapam-core.js — turn any psychometric item bank into a מפע"ם (MAPAM) run.
 *
 * Works in the browser (window.MapamCore) and in Node (module.exports).
 * No dependencies.
 *
 * Pipeline:  bank (JSON)  ->  validateBank  ->  buildTest  ->  steps[]  ->  runner
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MapamCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* --------------------------------------------------------------------------
   * 1. The MAPAM rulebook.
   *    Everything the format dictates lives here and nowhere else. Change a
   *    number here and the whole system follows.
   * ------------------------------------------------------------------------ */

  var RULES = {
    // Seconds allotted per item type. Source: NITE MAPAM time-per-question table.
    time: {
      verbal: {
        analogy:             90,   // אנלוגיה                        1.5 דק'
        reading_passage:     420,  // קטע קריאה (זמן קריאה)            7 דק'
        reading_question:    240,  // שאלה על קטע קריאה                4 דק'
        logic:               240,  // שאלת הבנה והסקה                  4 דק'
        sentence_completion: 180   // השלמת משפטים                    3 דק'
      },
      quantitative: {
        problem:             240,  // שאלות ובעיות                    4 דק'
        figure:              300,  // עיון בתרשים/טבלה                5 דק'
        figure_question:     240   // שאלת הסקה מתרשים/טבלה            4 דק'
      },
      english: {
        sentence_completion: 120,  // השלמת משפטים                    2 דק'
        reading_passage:     420,  // קטע קריאה                       7 דק'
        reading_question:    240,  // שאלה על קטע קריאה                4 דק'
        restatement:         240   // ניסוח מחדש                      4 דק'
      }
    },

    // Writing task. 30 is standard; the longer values are approved accommodations.
    writing: { defaultMinutes: 30, allowedMinutes: [30, 35, 40, 45], minLines: 25 },

    // Breaks.
    breaks: {
      majorSeconds: 300,   // 5 min — after the writing task, after verbal, after quantitative
      microSeconds: 150,   // 2.5 min — between chapters inside verbal / quantitative / english
      skippable: true      // "נבחנים המעוניינים לקצר את ההפסקה יוכלו לעשות זאת"
    },

    // Behaviour of the computerised format.
    behaviour: {
      allowBack: false,          // one shot per question, no returning
      allowEarlyAdvance: true,   // answering early lets you move on
      autoAdvanceOnTimeout: true,
      keepStimulusVisible: true  // the passage/table stays on screen during its questions
    },

    // Order of the domains in a sitting.
    domainOrder: ['writing', 'verbal', 'quantitative', 'english'],

    // A sitting is capped: "לא תמיד אפשר להניח להיבחן במשך יותר מחמש שעות וחצי".
    session: { maxSeconds: 5.5 * 3600, typicalSeconds: 3.5 * 3600 }
  };

  /* Blueprint: how many items of each type a MAPAM sitting draws from the bank.
   * `reading_passage` / `figure` are counts of stimuli; `*_question` are the
   * total questions drawn across them. `chapters` is how many timed chapters
   * the domain is split into (micro-breaks go between them).
   *
   * These counts are calibrated so the whole sitting lands on the 5.5-hour
   * ceiling. Tune them per institution and the rest of the system follows. */
  var BLUEPRINTS = {
    standard: {
      verbal:       { chapters: 2, analogy: 6, sentence_completion: 5, logic: 7, reading_passage: 2, reading_question: 6 },
      quantitative: { chapters: 2, problem: 15, figure: 2, figure_question: 5 },
      english:      { chapters: 2, sentence_completion: 10, restatement: 7, reading_passage: 2, reading_question: 7 }
    },
    // Half-length dry run: same proportions, roughly half the clock.
    half: {
      verbal:       { chapters: 1, analogy: 3, sentence_completion: 3, logic: 4, reading_passage: 1, reading_question: 3 },
      quantitative: { chapters: 1, problem: 8, figure: 1, figure_question: 3 },
      english:      { chapters: 1, sentence_completion: 5, restatement: 4, reading_passage: 1, reading_question: 4 }
    },
    // Take everything in the bank, in bank order. No sampling.
    full: null
  };

  // Order the item types appear in within a chapter, per domain.
  var TYPE_ORDER = {
    verbal:       ['analogy', 'sentence_completion', 'logic', 'reading_passage'],
    quantitative: ['problem', 'figure'],
    english:      ['sentence_completion', 'restatement', 'reading_passage']
  };

  // Which item types hang off a stimulus (passage / figure / table).
  var STIMULUS_TYPES = {
    reading_passage: { domains: ['verbal', 'english'], childType: 'reading_question' },
    figure:          { domains: ['quantitative'],      childType: 'figure_question' }
  };

  // Human labels, for the UI and for reports.
  var LABELS = {
    domain: { writing: 'מטלת כתיבה', verbal: 'חשיבה מילולית', quantitative: 'חשיבה כמותית', english: 'אנגלית' },
    type: {
      analogy: 'אנלוגיה',
      reading_passage: 'קטע קריאה',
      reading_question: 'שאלה על קטע קריאה',
      logic: 'שאלת הבנה והסקה',
      sentence_completion: 'השלמת משפטים',
      problem: 'שאלות ובעיות',
      figure: 'עיון בתרשים/טבלה',
      figure_question: 'שאלת הסקה מתרשים/טבלה',
      restatement: 'ניסוח מחדש'
    }
  };

  /* --------------------------------------------------------------------------
   * 2. Validation — say exactly what is wrong and where.
   * ------------------------------------------------------------------------ */

  function validateBank(bank) {
    var problems = [];
    var at = function (where, msg) { problems.push({ where: where, message: msg }); };

    if (!bank || typeof bank !== 'object') { at('bank', 'הבנק ריק או אינו אובייקט.'); return problems; }
    if (!Array.isArray(bank.sections) || !bank.sections.length) at('bank.sections', 'חסרים פרקים.');

    if (bank.writingTask) {
      var m = bank.writingTask.minutes;
      if (m != null && RULES.writing.allowedMinutes.indexOf(m) === -1)
        at('writingTask.minutes', 'זמן כתיבה ' + m + ' אינו אחד מ־' + RULES.writing.allowedMinutes.join('/') + '.');
      if (!bank.writingTask.prompt) at('writingTask.prompt', 'חסרה מטלת הכתיבה.');
    }

    var seenIds = Object.create(null);
    (bank.sections || []).forEach(function (sec, si) {
      var where = 'sections[' + si + ']' + (sec.id ? ' (' + sec.id + ')' : '');
      if (!sec.domain || !RULES.time[sec.domain]) at(where, 'domain חייב להיות verbal / quantitative / english.');
      if (!Array.isArray(sec.items) || !sec.items.length) at(where, 'לפרק אין שאלות.');

      var stimIds = Object.create(null);
      (sec.stimuli || []).forEach(function (st, ti) {
        if (!st.id) at(where + '.stimuli[' + ti + ']', 'לגירוי חסר id.');
        else if (stimIds[st.id]) at(where + '.stimuli[' + ti + ']', 'id כפול: ' + st.id + '.');
        stimIds[st.id] = true;
        var kind = st.kind || 'reading_passage';
        if (!STIMULUS_TYPES[kind]) at(where + '.stimuli[' + ti + ']', 'kind לא מוכר: ' + kind + '.');
        else if (STIMULUS_TYPES[kind].domains.indexOf(sec.domain) === -1)
          at(where + '.stimuli[' + ti + ']', kind + ' לא קיים בתחום ' + sec.domain + '.');
        if (!st.body && !st.html && !st.image) at(where + '.stimuli[' + ti + ']', 'לגירוי אין תוכן (body / html / image).');
      });

      (sec.items || []).forEach(function (it, ii) {
        var iw = where + '.items[' + ii + ']' + (it.id ? ' (' + it.id + ')' : '');
        if (!it.id) at(iw, 'לשאלה חסר id.');
        else if (seenIds[it.id]) at(iw, 'id כפול בכל הבחינה: ' + it.id + '.');
        seenIds[it.id] = true;

        if (!it.type) at(iw, 'לשאלה חסר type.');
        else if (!RULES.time[sec.domain] || RULES.time[sec.domain][it.type] == null)
          at(iw, 'type "' + it.type + '" אינו קיים בתחום ' + sec.domain + '.');

        if (!it.stem) at(iw, 'חסר גוף שאלה (stem).');
        if (!Array.isArray(it.options) || it.options.length !== 4) at(iw, 'צריך בדיוק 4 מסיחים.');
        if (!(it.answer >= 1 && it.answer <= 4)) at(iw, 'answer חייב להיות 1–4.');

        var needsStim = it.type === 'reading_question' || it.type === 'figure_question';
        if (needsStim && !it.stimulusId) at(iw, 'שאלה מסוג ' + it.type + ' חייבת stimulusId.');
        if (it.stimulusId && !stimIds[it.stimulusId]) at(iw, 'stimulusId לא קיים בפרק: ' + it.stimulusId + '.');
      });
    });

    return problems;
  }

  /* --------------------------------------------------------------------------
   * 3. Build — bank -> flat, timed, ordered list of steps.
   * ------------------------------------------------------------------------ */

  /* A "group" is the smallest unit that must stay intact: either one standalone
   * question, or one stimulus plus the questions hanging off it. */
  function poolGroups(bank, domain, rules) {
    var groups = [];
    (bank.sections || []).filter(function (s) { return s.domain === domain; }).forEach(function (sec) {
      var stim = {}, byStim = {};
      (sec.stimuli || []).forEach(function (st) {
        stim[st.id] = st;
        byStim[st.id] = { kind: 'stimulus', type: st.kind || 'reading_passage', stimulus: st, items: [], sectionId: sec.id };
      });
      (sec.items || []).forEach(function (it) {
        if (it.stimulusId && byStim[it.stimulusId]) byStim[it.stimulusId].items.push(it);
        else groups.push({ kind: 'single', type: it.type, stimulus: null, items: [it], sectionId: sec.id });
      });
      Object.keys(byStim).forEach(function (id) { if (byStim[id].items.length) groups.push(byStim[id]); });
    });
    groups.forEach(function (g) { g.seconds = groupSeconds(g, domain, rules); });
    return groups;
  }

  function groupSeconds(g, domain, rules) {
    var t = rules.time[domain], total = 0;
    if (g.kind === 'stimulus') total += (g.stimulus.seconds || t[g.type] || 0);
    g.items.forEach(function (it) { total += it.seconds || t[it.type] || 0; });
    return total;
  }

  /* Deterministic PRNG so a given seed always yields the same sitting. */
  function rngFrom(seed) {
    var h = 2166136261 >>> 0, s = String(seed == null ? 'mapam' : seed);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return function () { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
  }
  function pick(arr, n, rng) {
    if (n >= arr.length) return arr.slice();
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a.slice(0, n);
  }

  /* Blueprint -> the groups this sitting will actually use. */
  function selectGroups(groups, bp, domain, rng, notes) {
    if (!bp) return groups;
    var chosen = [], order = TYPE_ORDER[domain] || [];

    order.forEach(function (type) {
      var want = bp[type] || 0;
      if (!want) return;
      var stimSpec = STIMULUS_TYPES[type];
      var avail = groups.filter(function (g) { return g.type === type; });

      if (!stimSpec) {                                   // standalone questions
        var got = pick(avail, want, rng);
        if (got.length < want) notes.push(domain + ': ביקשת ' + want + ' × ' + (LABELS.type[type] || type) + ', בבנק יש ' + got.length + '.');
        chosen = chosen.concat(got);
        return;
      }

      var qWant = bp[stimSpec.childType] || 0;           // stimulus + its questions
      var stims = pick(avail, want, rng);
      if (stims.length < want) notes.push(domain + ': ביקשת ' + want + ' × ' + (LABELS.type[type] || type) + ', בבנק יש ' + stims.length + '.');
      if (!stims.length) return;

      var per = Math.floor(qWant / stims.length), extra = qWant % stims.length, drawn = 0;
      stims.forEach(function (g, i) {
        var take = per + (i < extra ? 1 : 0);
        var kept = pick(g.items, take, rng);
        drawn += kept.length;
        chosen.push({ kind: 'stimulus', type: g.type, stimulus: g.stimulus, items: kept, sectionId: g.sectionId });
      });
      if (drawn < qWant) notes.push(domain + ': ביקשת ' + qWant + ' שאלות על ' + (LABELS.type[type] || type) + ', בבנק יש ' + drawn + '.');
    });

    return chosen;
  }

  /* Deal groups into n chapters, round-robin per type, then order each chapter
   * by the domain's canonical type order — so every chapter looks like a real
   * chapter rather than "all the analogies, then all the passages". */
  function intoChapters(groups, n, domain) {
    n = Math.max(1, n || 1);
    var chapters = [], byType = {};
    for (var i = 0; i < n; i++) chapters.push([]);
    groups.forEach(function (g) { (byType[g.type] = byType[g.type] || []).push(g); });
    Object.keys(byType).forEach(function (type) {
      byType[type].forEach(function (g, i) { chapters[i % n].push(g); });
    });
    var order = TYPE_ORDER[domain] || [];
    chapters.forEach(function (ch) {
      ch.forEach(function (g, i) { g._i = i; });
      ch.sort(function (a, b) {
        var d = order.indexOf(a.type) - order.indexOf(b.type);
        return d !== 0 ? d : a._i - b._i;
      });
    });
    return chapters.filter(function (ch) { return ch.length; });
  }

  function buildTest(bank, options) {
    var opt = options || {};
    var rules = deepMerge(clone(RULES), opt.rules || {});
    var bp = opt.blueprint === undefined ? null
           : (typeof opt.blueprint === 'string' ? BLUEPRINTS[opt.blueprint] : opt.blueprint);
    var rng = rngFrom(opt.seed);
    var notes = [], steps = [], order = 0;

    function push(step) { step.index = order++; steps.push(step); return step; }

    // -- writing task -------------------------------------------------------
    if (bank.writingTask && opt.includeWriting !== false) {
      var minutes = opt.writingMinutes || bank.writingTask.minutes || rules.writing.defaultMinutes;
      push({
        kind: 'writing', domain: 'writing', seconds: minutes * 60,
        prompt: bank.writingTask.prompt,
        intro: bank.writingTask.intro || null,
        minLines: bank.writingTask.minLines || rules.writing.minLines
      });
      push({ kind: 'break', seconds: rules.breaks.majorSeconds, label: 'הפסקה', after: 'writing' });
    }

    // -- multiple-choice domains -------------------------------------------
    var domains = rules.domainOrder.filter(function (d) {
      return d !== 'writing' && (bank.sections || []).some(function (s) { return s.domain === d; });
    });

    domains.forEach(function (domain, di) {
      var pool = poolGroups(bank, domain, rules);
      var chosen = selectGroups(pool, bp && bp[domain], domain, rng, notes);
      var chapters = intoChapters(chosen, bp && bp[domain] ? bp[domain].chapters : (opt.chapters || 1), domain);

      chapters.forEach(function (ch, ci) {
        if (ci > 0) push({ kind: 'break', seconds: rules.breaks.microSeconds, label: 'הפסקה', after: 'chapter' });
        var sectionId = domain + '-' + (ci + 1);
        var itemCount = ch.reduce(function (n, g) { return n + g.items.length; }, 0);

        push({
          kind: 'section-intro', domain: domain, sectionId: sectionId,
          title: LABELS.domain[domain] + (chapters.length > 1 ? ' — פרק ' + ['ראשון','שני','שלישי','רביעי'][ci] : ''),
          subtitle: chapterSubtitle(ch),
          itemCount: itemCount,
          seconds: opt.introSeconds != null ? opt.introSeconds : 30
        });

        ch.forEach(function (g) {
          if (g.kind === 'stimulus') {
            var st = g.stimulus, kind = g.type;
            push({
              kind: 'stimulus', domain: domain, sectionId: sectionId,
              stimulusId: st.id, stimulusKind: kind,
              seconds: st.seconds || rules.time[domain][kind],
              title: st.title || LABELS.type[kind],
              body: st.body || null, html: st.html || null, image: st.image || null, dir: st.dir || null
            });
          }
          g.items.forEach(function (it) {
            push({
              kind: 'item', domain: domain, sectionId: sectionId,
              itemId: it.id, type: it.type,
              seconds: it.seconds || rules.time[domain][it.type],
              stem: it.stem, instruction: it.instruction || null,
              options: it.options, answer: it.answer,
              stimulusId: g.stimulus ? g.stimulus.id : null,
              image: it.image || null, dir: it.dir || null,
              scored: it.scored !== false      // "הפריט אינו נכלל בחישוב הציון"
            });
          });
        });
      });

      if (di < domains.length - 1)
        push({ kind: 'break', seconds: rules.breaks.majorSeconds, label: 'הפסקה', after: 'domain' });
    });

    push({ kind: 'end' });

    var summary = summarize(steps);
    summary.maxSeconds = rules.session.maxSeconds;
    summary.overBudget = summary.totalSeconds > rules.session.maxSeconds;
    summary.notes = notes;

    return { meta: clone(bank.meta || {}), rules: rules, blueprint: bp, seed: opt.seed || null, steps: steps, summary: summary };
  }

  function chapterSubtitle(ch) {
    var seen = [], out = [];
    ch.forEach(function (g) {
      g.items.forEach(function (it) {
        if (seen.indexOf(it.type) === -1) { seen.push(it.type); out.push(LABELS.type[it.type] || it.type); }
      });
    });
    return out.join(' · ');
  }

  function summarize(steps) {
    var out = { totalSeconds: 0, breakSeconds: 0, byDomain: {}, counts: { items: 0, stimuli: 0, breaks: 0 } };
    steps.forEach(function (s) {
      var sec = s.seconds || 0;
      out.totalSeconds += sec;
      if (s.kind === 'break') { out.breakSeconds += sec; out.counts.breaks++; return; }
      if (s.kind === 'item') out.counts.items++;
      if (s.kind === 'stimulus') out.counts.stimuli++;
      if (!s.domain) return;
      var d = out.byDomain[s.domain] || (out.byDomain[s.domain] = { seconds: 0, items: 0 });
      d.seconds += sec;
      if (s.kind === 'item') d.items++;
    });
    return out;
  }

  /* --------------------------------------------------------------------------
   * 4. Scoring — raw -> uniform scale -> weighted -> estimated general score.
   *    Tables are NITE's published conversion tables; swap them per sitting.
   * ------------------------------------------------------------------------ */

  // index = raw score; value = uniform score (null = raw impossible in that domain)
  var SCALE = {
    verbal:       [50,51,53,55,57,59,61,63,65,67,69,71,73,76,78,80,82,85,87,90,92,94,97,99,102,104,106,109,111,114,116,118,121,123,126,128,130,133,135,138,140,142,143,145,146,148,150],
    quantitative: [50,52,54,56,58,61,64,67,70,73,76,78,81,83,86,88,90,93,95,98,100,102,104,107,109,111,114,116,119,121,124,126,129,131,134,136,138,141,144,147,150],
    english:      [50,52,54,56,58,60,62,65,68,71,74,76,78,81,83,85,87,89,91,93,95,97,99,101,103,105,107,109,112,114,116,118,120,123,125,127,129,131,134,136,138,141,144,147,150]
  };

  // weighted uniform score -> [minGeneral, maxGeneral], for 200–800 estimation
  var GENERAL_BANDS = [
    [50, 50, 200, 200], [51, 55, 221, 248], [56, 60, 249, 276], [61, 65, 277, 304],
    [66, 70, 305, 333], [71, 75, 334, 361], [76, 80, 362, 389], [81, 85, 390, 418],
    [86, 90, 419, 446], [91, 95, 447, 474], [96, 100, 475, 503], [101, 105, 504, 531],
    [106, 110, 532, 559], [111, 115, 560, 587], [116, 120, 588, 616], [121, 125, 617, 644],
    [126, 130, 645, 672], [131, 135, 673, 701], [136, 140, 702, 729], [141, 145, 730, 761],
    [146, 149, 762, 795], [150, 150, 800, 800]
  ];

  function scale(domain, raw) {
    var t = SCALE[domain];
    if (!t) return null;
    return t[Math.max(0, Math.min(t.length - 1, raw))];
  }

  /* The published table is banded on whole numbers, but a weighted score is
   * fractional. Read each band as the continuous interval [lo, hi+1) and
   * interpolate inside it, so nothing falls through the cracks. */
  function generalScore(weighted) {
    var w = Math.max(50, Math.min(150, weighted));
    for (var i = 0; i < GENERAL_BANDS.length; i++) {
      var b = GENERAL_BANDS[i];
      if (w > b[1]) continue;
      if (b[0] === b[1]) return b[2];
      var t = Math.max(0, Math.min(1, (w - b[0]) / (b[1] + 1 - b[0])));
      return Math.round(b[2] + t * (b[3] - b[2]));
    }
    return GENERAL_BANDS[GENERAL_BANDS.length - 1][3];
  }

  /**
   * responses: { itemId: 1..4 | null }
   * Returns raw + uniform + weighted + estimated general scores.
   */
  function score(test, responses) {
    var raw = { verbal: 0, quantitative: 0, english: 0 };
    var seen = { verbal: 0, quantitative: 0, english: 0 };
    var detail = [];

    test.steps.forEach(function (s) {
      if (s.kind !== 'item') return;
      var given = responses[s.itemId] != null ? responses[s.itemId] : null;
      var correct = given === s.answer;
      if (s.scored) { seen[s.domain]++; if (correct) raw[s.domain]++; }
      detail.push({
        itemId: s.itemId, domain: s.domain, type: s.type,
        given: given, answer: s.answer, correct: correct, scored: s.scored
      });
    });

    var V = scale('verbal', raw.verbal),
        Q = scale('quantitative', raw.quantitative),
        E = scale('english', raw.english);

    var composites = {
      multi:            (2 * V + 2 * Q + E) / 5,
      verbalEmphasis:   (3 * V + Q + E) / 5,
      quantEmphasis:    (3 * Q + V + E) / 5
    };

    return {
      raw: raw, attempted: seen, uniform: { verbal: V, quantitative: Q, english: E },
      composites: composites,
      general: {
        multi:          generalScore(composites.multi),
        verbalEmphasis: generalScore(composites.verbalEmphasis),
        quantEmphasis:  generalScore(composites.quantEmphasis)
      },
      detail: detail
    };
  }

  /* ------------------------------------------------------------------------ */

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function deepMerge(a, b) {
    Object.keys(b || {}).forEach(function (k) {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) a[k] = deepMerge(a[k] || {}, b[k]);
      else a[k] = b[k];
    });
    return a;
  }
  function fmt(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* What does the bank actually contain? Feeds the blueprint UI and the
   * "you asked for 8 but only have 5" warnings. */
  function inventory(bank) {
    var inv = {};
    (bank.sections || []).forEach(function (sec) {
      var d = inv[sec.domain] = inv[sec.domain] || { types: {}, stimuli: {} };
      (sec.stimuli || []).forEach(function (st) {
        var k = st.kind || 'reading_passage';
        d.stimuli[k] = (d.stimuli[k] || 0) + 1;
      });
      (sec.items || []).forEach(function (it) { d.types[it.type] = (d.types[it.type] || 0) + 1; });
    });
    return inv;
  }

  return {
    RULES: RULES, LABELS: LABELS, STIMULUS_TYPES: STIMULUS_TYPES,
    BLUEPRINTS: BLUEPRINTS, TYPE_ORDER: TYPE_ORDER,
    SCALE: SCALE, GENERAL_BANDS: GENERAL_BANDS,
    validateBank: validateBank, buildTest: buildTest, summarize: summarize,
    inventory: inventory, score: score, scale: scale, generalScore: generalScore, fmt: fmt
  };
});
