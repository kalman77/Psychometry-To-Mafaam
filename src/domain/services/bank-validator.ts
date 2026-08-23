/* Validation — say exactly what is wrong and where.
 *
 * The input is whatever JSON someone dropped on us, so everything here is
 * defensive. A bank that leaves this function without problems is a `Bank`. */

import type { Bank } from '../model/bank.ts';
import { RULES, type Rulebook } from '../rules/rulebook.ts';
import { DEFAULT_STIMULUS_KIND, requiresStimulus, stimulusSpec } from '../rules/taxonomy.ts';
import type { BankProblem } from './bank-validator/bank-problem.ts';

export type { BankProblem } from './bank-validator/bank-problem.ts';

type Record_ = Record<string, unknown>;

function asRecord(value: unknown): Record_ | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record_)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function validateBank(bank: unknown, rules: Rulebook = RULES): BankProblem[] {
  const problems: BankProblem[] = [];
  const at = (where: string, message: string) => problems.push({ where, message });

  const root = asRecord(bank);
  if (!root) {
    at('bank', 'הבנק ריק או אינו אובייקט.');
    return problems;
  }

  const sections = Array.isArray(root.sections) ? root.sections : null;
  if (!sections || !sections.length) at('bank.sections', 'חסרים פרקים.');

  const writingTask = asRecord(root.writingTask);
  if (writingTask) {
    const minutes = writingTask.minutes;
    if (minutes != null && !rules.writing.allowedMinutes.includes(minutes as number))
      at(
        'writingTask.minutes',
        `זמן כתיבה ${minutes} אינו אחד מ־${rules.writing.allowedMinutes.join('/')}.`,
      );
    // As with a scanned question, a picture of the task is the task.
    if (!writingTask.prompt && !writingTask.image)
      at('writingTask.prompt', 'חסרה מטלת הכתיבה (prompt או image).');
  }

  const seenIds = new Set<string>();

  (sections ?? []).forEach((rawSection, si) => {
    const section = asRecord(rawSection) ?? {};
    const sectionId = str(section.id);
    const where = `sections[${si}]${sectionId ? ` (${sectionId})` : ''}`;
    const domain = str(section.domain);

    const timeTable = rules.time[domain as keyof typeof rules.time];
    if (!domain || !timeTable) at(where, 'domain חייב להיות verbal / quantitative / english.');

    const items = asArray(section.items);
    if (!Array.isArray(section.items) || !items.length) at(where, 'לפרק אין שאלות.');

    const stimulusIds = new Set<string>();
    asArray(section.stimuli).forEach((rawStimulus, ti) => {
      const stimulus = asRecord(rawStimulus) ?? {};
      const stimulusWhere = `${where}.stimuli[${ti}]`;
      const id = str(stimulus.id);

      if (!id) at(stimulusWhere, 'לגירוי חסר id.');
      else if (stimulusIds.has(id)) at(stimulusWhere, `id כפול: ${id}.`);
      stimulusIds.add(id);

      const kind = str(stimulus.kind) || DEFAULT_STIMULUS_KIND;
      const spec = stimulusSpec(kind);
      if (!spec) at(stimulusWhere, `kind לא מוכר: ${kind}.`);
      else if (!spec.domains.includes(domain as never))
        at(stimulusWhere, `${kind} לא קיים בתחום ${domain}.`);

      if (!stimulus.body && !stimulus.html && !stimulus.image)
        at(stimulusWhere, 'לגירוי אין תוכן (body / html / image).');
    });

    items.forEach((rawItem, ii) => {
      const item = asRecord(rawItem) ?? {};
      const id = str(item.id);
      const itemWhere = `${where}.items[${ii}]${id ? ` (${id})` : ''}`;

      if (!id) at(itemWhere, 'לשאלה חסר id.');
      else if (seenIds.has(id)) at(itemWhere, `id כפול בכל הבחינה: ${id}.`);
      seenIds.add(id);

      const type = str(item.type);
      if (!type) at(itemWhere, 'לשאלה חסר type.');
      else if (!timeTable || timeTable[type as keyof typeof timeTable] == null)
        at(itemWhere, `type "${type}" אינו קיים בתחום ${domain}.`);

      // A scanned question carries everything in its image, so an empty stem
      // is only a problem when there is no picture to read it from.
      if (!item.stem && !item.image) at(itemWhere, 'חסר גוף שאלה (stem) ותמונה.');
      if (!Array.isArray(item.options) || item.options.length !== 4)
        at(itemWhere, 'צריך בדיוק 4 מסיחים.');

      const answer = item.answer;
      if (!(typeof answer === 'number' && answer >= 1 && answer <= 4))
        at(itemWhere, 'answer חייב להיות 1–4.');

      const stimulusId = str(item.stimulusId);
      if (requiresStimulus(type as never) && !stimulusId)
        at(itemWhere, `שאלה מסוג ${type} חייבת stimulusId.`);
      if (stimulusId && !stimulusIds.has(stimulusId))
        at(itemWhere, `stimulusId לא קיים בפרק: ${stimulusId}.`);
    });
  });

  return problems;
}

/** Questions in the bank, for the "✓ תקין — N שאלות" line. */
export function countItems(bank: Bank): number {
  return (bank.sections ?? []).reduce((n, section) => n + (section.items ?? []).length, 0);
}
