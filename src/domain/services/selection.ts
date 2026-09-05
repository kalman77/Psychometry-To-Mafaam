/* Blueprint -> the groups this sitting will actually use, dealt into chapters.
 *
 * Run a full paper test at MAPAM's per-question rates and you get a nine-hour
 * sitting, so the converter selects rather than copies. When the bank is too
 * small it says so (into `notes`) instead of silently shrinking the test. */

import type { Domain } from '../model/bank.ts';
import type { ResolvedDomainBlueprint } from '../rules/blueprints.ts';
import type { Rulebook } from '../rules/rulebook.ts';
import { typeLabel } from '../rules/labels.ts';
import { STIMULUS_TYPES, TYPE_ORDER, stimulusSpec } from '../rules/taxonomy.ts';
import { groupSeconds, type ItemGroup } from './grouping.ts';
import { sample, type RandomSource } from './random.ts';

export function selectGroups(
  groups: ItemGroup[],
  blueprint: ResolvedDomainBlueprint | null | undefined,
  domain: Domain,
  rules: Rulebook,
  random: RandomSource,
  notes: string[],
): ItemGroup[] {
  if (!blueprint) return groups;

  const chosen: ItemGroup[] = [];

  for (const type of TYPE_ORDER[domain] ?? []) {
    const want = blueprint[type] ?? 0;
    if (!want) continue;

    const available = groups.filter((group) => group.type === type);
    const spec = type in STIMULUS_TYPES ? stimulusSpec(type) : null;

    if (!spec) {
      // Standalone questions: take `want` of them.
      const taken = sample(available, want, random);
      if (taken.length < want)
        notes.push(
          `${domain}: ביקשת ${want} × ${typeLabel(type)}, בבנק יש ${taken.length}.`,
        );
      chosen.push(...taken);
      continue;
    }

    // A stimulus plus its questions: pick the stimuli, then spread the question
    // quota across them as evenly as the bank allows.
    const questionsWanted = blueprint[spec.childType] ?? 0;
    const stimuli = sample(available, want, random);
    if (stimuli.length < want)
      notes.push(`${domain}: ביקשת ${want} × ${typeLabel(type)}, בבנק יש ${stimuli.length}.`);
    if (!stimuli.length) continue;

    const per = Math.floor(questionsWanted / stimuli.length);
    const extra = questionsWanted % stimuli.length;
    let drawn = 0;

    stimuli.forEach((group, i) => {
      const take = per + (i < extra ? 1 : 0);
      const kept = sample(group.items, take, random);
      drawn += kept.length;
      const trimmed = {
        kind: 'stimulus' as const,
        type: group.type,
        stimulus: group.stimulus,
        items: kept,
        sectionId: group.sectionId,
      };
      chosen.push({ ...trimmed, seconds: groupSeconds(trimmed, domain, rules) });
    });

    if (drawn < questionsWanted)
      notes.push(
        `${domain}: ביקשת ${questionsWanted} שאלות על ${typeLabel(type)}, בבנק יש ${drawn}.`,
      );
  }

  return chosen;
}

/** Deal groups into n chapters, round-robin per type, then order each chapter
 *  by the domain's canonical type order — so every chapter looks like a real
 *  chapter rather than "all the analogies, then all the passages". */
export function intoChapters(
  groups: ItemGroup[],
  chapterCount: number,
  domain: Domain,
): ItemGroup[][] {
  const n = Math.max(1, chapterCount || 1);
  const chapters: ItemGroup[][] = Array.from({ length: n }, () => []);

  const byType = new Map<string, ItemGroup[]>();
  for (const group of groups) {
    const bucket = byType.get(group.type);
    if (bucket) bucket.push(group);
    else byType.set(group.type, [group]);
  }
  for (const [type, bucket] of byType)
    bucket.forEach((group, i) =>
      // A passage or a chart closes the section: it goes in the last half,
      // where `TYPE_ORDER` then puts it after the standalone questions.
      // Everything else deals evenly across the halves.
      (type in STIMULUS_TYPES ? chapters[n - 1]! : chapters[i % n]!).push(group),
    );

  const order = TYPE_ORDER[domain] ?? [];
  for (const chapter of chapters) {
    const dealt = new Map(chapter.map((group, i) => [group, i]));
    chapter.sort((a, b) => {
      const byOrder = order.indexOf(a.type) - order.indexOf(b.type);
      return byOrder !== 0 ? byOrder : dealt.get(a)! - dealt.get(b)!;
    });
  }

  return chapters.filter((chapter) => chapter.length > 0);
}
