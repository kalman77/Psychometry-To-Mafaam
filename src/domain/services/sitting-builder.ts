/* Build — bank -> flat, timed, ordered list of steps.
 *
 * This is the whole conversion: which items the sitting draws, what order they
 * come in, how long each one is on screen, and where the breaks fall. */

import type { Bank, Domain, SittingDomain } from '../model/bank.ts';
import type { Sitting, SittingSummary, Step } from '../model/sitting.ts';
import { CHAPTER_ORDINALS, DOMAIN_LABELS, typeLabel } from '../rules/labels.ts';
import { RULES, type Rulebook } from '../rules/rulebook.ts';
import { clone, deepMerge } from '../support/objects.ts';
import { poolGroups, type ItemGroup } from './grouping.ts';
import type { RandomSource } from './random.ts';
import { intoChapters, selectGroups } from './selection.ts';
import { summarize } from './summary.ts';

import type { BuildOptions } from './sitting-builder/build-options.ts';

export type { BuildOptions } from './sitting-builder/build-options.ts';

export function buildSitting(
  bank: Bank,
  options: BuildOptions,
  random: RandomSource,
): Sitting {
  const rules: Rulebook = deepMerge(clone(RULES), options.rules ?? {});
  const blueprint = options.blueprint ?? null;
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
    });
    push({ kind: 'break', seconds: rules.breaks.majorSeconds, label: 'הפסקה', after: 'writing' });
  }

  // -- multiple-choice domains ---------------------------------------------
  const domains = rules.domainOrder.filter(
    (domain: SittingDomain): domain is Domain =>
      domain !== 'writing' && (bank.sections ?? []).some((s) => s.domain === domain),
  );

  domains.forEach((domain, di) => {
    const domainBlueprint = blueprint ? blueprint[domain] : null;
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
