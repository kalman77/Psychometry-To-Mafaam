/* A "group" is the smallest unit that must stay intact: either one standalone
 * question, or one stimulus plus the questions hanging off it. Selection and
 * chapter-dealing both work in groups, never in loose items. */

import type { Bank, Domain } from '../model/bank.ts';
import type { Rulebook } from '../rules/rulebook.ts';
import { DEFAULT_STIMULUS_KIND } from '../rules/taxonomy.ts';
import type { ItemGroup } from './grouping/item-group.ts';

export type { ItemGroup } from './grouping/item-group.ts';

export function groupSeconds(
  group: Omit<ItemGroup, 'seconds'>,
  domain: Domain,
  rules: Rulebook,
): number {
  const table = rules.time[domain];
  let total = 0;
  if (group.kind === 'stimulus' && group.stimulus) {
    total += group.stimulus.seconds ?? table[group.type] ?? 0;
  }
  for (const item of group.items) total += item.seconds ?? table[item.type] ?? 0;
  return total;
}

function withSeconds(
  group: Omit<ItemGroup, 'seconds'>,
  domain: Domain,
  rules: Rulebook,
): ItemGroup {
  return { ...group, seconds: groupSeconds(group, domain, rules) };
}

/** Every group the bank offers in this domain, in bank order: standalone
 *  questions as they appear, then each stimulus that actually has questions. */
export function poolGroups(bank: Bank, domain: Domain, rules: Rulebook): ItemGroup[] {
  const groups: Omit<ItemGroup, 'seconds'>[] = [];

  for (const section of bank.sections ?? []) {
    if (section.domain !== domain) continue;

    const byStimulus = new Map<string, Omit<ItemGroup, 'seconds'>>();
    for (const stimulus of section.stimuli ?? []) {
      byStimulus.set(stimulus.id, {
        kind: 'stimulus',
        type: stimulus.kind ?? DEFAULT_STIMULUS_KIND,
        stimulus,
        items: [],
        sectionId: section.id,
      });
    }

    for (const item of section.items ?? []) {
      const parent = item.stimulusId ? byStimulus.get(item.stimulusId) : undefined;
      if (parent) parent.items.push(item);
      else
        groups.push({
          kind: 'single',
          type: item.type,
          stimulus: null,
          items: [item],
          sectionId: section.id,
        });
    }

    for (const group of byStimulus.values()) if (group.items.length) groups.push(group);
  }

  return groups.map((group) => withSeconds(group, domain, rules));
}
