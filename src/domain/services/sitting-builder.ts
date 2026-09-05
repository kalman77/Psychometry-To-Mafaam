/* Build — bank -> flat, timed, ordered list of steps.
 *
 * This is the whole conversion: which items the sitting draws, what order they
 * come in, how long each one is on screen, and where the breaks fall. */

import type { Bank, Domain, SittingDomain } from '../model/bank.ts';
import type { Sitting, SittingSummary, Step } from '../model/sitting.ts';
import type { Blueprint } from '../rules/blueprints.ts';
import { CHAPTER_ORDINALS, DOMAIN_LABELS, typeLabel } from '../rules/labels.ts';
import { RULES, type Rulebook } from '../rules/rulebook.ts';
import { clone, deepMerge } from '../support/objects.ts';
import { poolGroups, type ItemGroup } from './grouping.ts';
import type { RandomSource } from './random.ts';
import { resolveBlueprint } from './resolve-blueprint.ts';
import { intoChapters, selectGroups } from './selection.ts';
import { summarize } from './summary.ts';

import type { BuildOptions } from './sitting-builder/build-options.ts';

export type { BuildOptions } from './sitting-builder/build-options.ts';

/** Everything in a sitting whose length is settled before a single question is
 *  chosen: the writing task and its break, a break between domains, a micro
 *  break between chapters, and one title card each. */
function fixedSeconds(
  bank: Bank,
  blueprint: Blueprint | null,
  rules: Rulebook,
  options: BuildOptions,
): number {
  const introSeconds = options.introSeconds ?? 30;
  let total = 0;

  if (bank.writingTask && options.includeWriting !== false) {
    const minutes =
      options.writingMinutes || bank.writingTask.minutes || rules.writing.defaultMinutes;
    total += minutes * 60 + rules.breaks.majorSeconds;
  }

  const domains = (['verbal', 'quantitative', 'english'] as Domain[]).filter(
    (domain) =>
      (!options.domains || options.domains.includes(domain)) &&
      (bank.sections ?? []).some((section) => section.domain === domain),
  );
  domains.forEach((domain, index) => {
    const chapters = blueprint?.[domain]?.chapters ?? options.chapters ?? 1;
    total += chapters * introSeconds + Math.max(0, chapters - 1) * rules.breaks.microSeconds;
    if (index < domains.length - 1) total += rules.breaks.majorSeconds;
  });
  return total;
}

export function buildSitting(
  bank: Bank,
  options: BuildOptions,
  random: RandomSource,
): Sitting {
  const rules: Rulebook = deepMerge(clone(RULES), options.rules ?? {});
  const blueprint = options.blueprint ?? null;
  // First call on the random source, before anything reads the bank: the counts
  // a blueprint's ranges resolve to must depend on the seed alone, so that the
  // same seed rebuilds the same sitting and so they stay recomputable when the
  // booklet is gone.
  //
  // What is left for questions after everything whose length is already known:
  // the writing task, the breaks around and between the domains, and a title
  // card per chapter. Ranges are drawn against that, so a sitting varies in
  // what it asks without varying in how long it runs.
  const resolved = resolveBlueprint(
    blueprint,
    random,
    // No budget when the ceiling has been lifted: the ranges stand as drawn.
    options.uncapped
      ? undefined
      : {
          seconds: rules.session.maxSeconds - fixedSeconds(bank, blueprint, rules, options),
          rules,
        },
  );
  const notes: string[] = [];
  const steps: Step[] = [];

  const push = <T extends Omit<Step, 'index'>>(step: T): void => {
    steps.push({ ...step, index: steps.length } as Step);
  };

  // -- writing task ---------------------------------------------------------
  if (bank.writingTask && options.includeWriting !== false) {
    const minutes =
      options.writingMinutes || bank.writingTask.minutes || rules.writing.defaultMinutes;
    push({
      kind: 'writing',
      domain: 'writing',
      seconds: minutes * 60,
      prompt: bank.writingTask.prompt,
      intro: bank.writingTask.intro ?? null,
      minLines: bank.writingTask.minLines ?? rules.writing.minLines,
      image: bank.writingTask.image ?? null,
      essay: '',
      canSend: false,
    });
    push({ kind: 'break', seconds: rules.breaks.majorSeconds, label: 'הפסקה', after: 'writing' });
  }

  // -- multiple-choice domains ---------------------------------------------
  const has = (domain: SittingDomain) => (bank.sections ?? []).some((s) => s.domain === domain);
  const domains = rules.domainOrder.filter(
    (domain: SittingDomain): domain is Domain =>
      domain !== 'writing' &&
      (!options.domains || options.domains.includes(domain as Domain)) &&
      has(domain),
  );
  // A domain asked for that the booklet has none of. `selectGroups` only counts
  // what falls short *within* a domain, so a missing one leaves no trace at all
  // — the sitting just comes out short and says nothing.
  for (const domain of options.domains ?? [])
    if (!has(domain)) notes.push(`${DOMAIN_LABELS[domain] ?? domain}: אין פרקים כאלה בחוברת.`);

  domains.forEach((domain, di) => {
    const domainBlueprint = resolved ? resolved[domain] : null;
    const pool = poolGroups(bank, domain, rules);
    const chosen = selectGroups(pool, domainBlueprint, domain, rules, random, notes);
    const chapters = intoChapters(
      chosen,
      domainBlueprint ? domainBlueprint.chapters : (options.chapters ?? 1),
      domain,
    );

    chapters.forEach((chapter, ci) => {
      if (ci > 0)
        push({
          kind: 'break',
          seconds: rules.breaks.microSeconds,
          label: 'הפסקה',
          after: 'chapter',
        });

      const sectionId = `${domain}-${ci + 1}`;
      const itemCount = chapter.reduce((n, group) => n + group.items.length, 0);

      push({
        kind: 'section-intro',
        domain,
        sectionId,
        title:
          DOMAIN_LABELS[domain] +
          (chapters.length > 1 ? ` — פרק ${CHAPTER_ORDINALS[ci]}` : ''),
        subtitle: chapterSubtitle(chapter),
        itemCount,
        seconds: options.introSeconds ?? 30,
      });

      for (const group of chapter) {
        if (group.kind === 'stimulus' && group.stimulus) {
          const stimulus = group.stimulus;
          push({
            kind: 'stimulus',
            domain,
            sectionId,
            stimulusId: stimulus.id,
            stimulusKind: group.type as 'reading_passage' | 'figure',
            seconds: stimulus.seconds ?? rules.time[domain][group.type] ?? 0,
            title: stimulus.title ?? typeLabel(group.type),
            body: stimulus.body ?? null,
            html: stimulus.html ?? null,
            image: stimulus.image ?? null,
            dir: stimulus.dir ?? null,
          });
        }

        for (const item of group.items) {
          push({
            kind: 'item',
            domain,
            sectionId,
            itemId: item.id,
            type: item.type,
            seconds: item.seconds ?? rules.time[domain][item.type] ?? 0,
            stem: item.stem,
            instruction: item.instruction ?? null,
            options: item.options,
            answer: item.answer,
            stimulusId: group.stimulus ? group.stimulus.id : null,
            image: item.image ?? null,
            dir: item.dir ?? null,
            scored: item.scored !== false, // "הפריט אינו נכלל בחישוב הציון"
          });
        }
      }
    });

    if (di < domains.length - 1)
      push({ kind: 'break', seconds: rules.breaks.majorSeconds, label: 'הפסקה', after: 'domain' });
  });

  push({ kind: 'end' });

  const totals = summarize(steps);
  const summary: SittingSummary = {
    ...totals,
    maxSeconds: rules.session.maxSeconds,
    overBudget: totals.totalSeconds > rules.session.maxSeconds,
    notes,
  };

  return {
    meta: clone(bank.meta ?? {}),
    scale: bank.scale ? clone(bank.scale) : null,
    // What the ranges came out as this time, so nothing downstream has to
    // re-derive it — the results screen reports it and scoring needs it.
    resolvedBlueprint: resolved,
    rules,
    blueprint,
    seed: options.seed ?? null,
    steps,
    summary,
  };
}

/** "אנלוגיה · השלמת משפטים · שאלה על קטע קריאה" — the types this chapter holds. */
function chapterSubtitle(chapter: ItemGroup[]): string {
  const seen: string[] = [];
  for (const group of chapter)
    for (const item of group.items)
      if (!seen.includes(item.type)) seen.push(item.type);
  return seen.map(typeLabel).join(' · ');
}
