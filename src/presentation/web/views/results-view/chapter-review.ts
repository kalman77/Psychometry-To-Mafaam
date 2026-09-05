/* The booklet's own chapters, marked up with what this sitting did to them.
 *
 * A sitting draws a sample, so the questions it asked are only part of each
 * printed chapter. Showing the chapter whole — asked and unasked together, in
 * the booklet's own numbering — is what makes the marks locatable in the paper
 * the learner was looking at. */

import type { AnsweredItem } from '../../../../domain/model/scoring/answered-item.ts';
import type { Bank, Domain, Item } from '../../../../domain/model/bank.ts';
import type { QuestionStatus } from './question-status.ts';

export interface ReviewedQuestion {
  itemId: string;
  /** The number printed beside it in the booklet. */
  number: number;
  status: QuestionStatus;
  /** What was picked, when it was asked and answered. */
  given: number | null;
  /** The key, for every question in the chapter — including the ones this
   *  sitting never drew, which are openable so the chapter can be worked
   *  through whole rather than only where the sampling happened to land. */
  answer: number | null;
}

export interface ReviewedChapter {
  sectionId: string;
  title: string;
  domain: Domain;
  questions: ReviewedQuestion[];
  asked: number;
  correct: number;
}

export interface ReviewedDomain {
  domain: Domain;
  label: string;
  chapters: ReviewedChapter[];
  asked: number;
  correct: number;
  /** Percent right of what was asked, or null when nothing in it was. */
  percent: number | null;
}

const DOMAIN_LABELS: Record<Domain, string> = {
  verbal: 'מילולי',
  quantitative: 'כמותי',
  english: 'אנגלית',
};

/** The number printed beside a question, taken off its id (`v1-7` → 7) and
 *  falling back to its place in the chapter when an id says nothing. */
function printedNumber(item: Item, index: number): number {
  const tail = /(\d+)\s*$/.exec(item.id ?? '');
  return tail ? Number(tail[1]) : index + 1;
}

/** The bank is a validated one by the time results are shown — a sitting was
 *  built from it, which does not happen otherwise. */
export function reviewChapters(
  bank: Bank | null,
  detail: readonly AnsweredItem[],
): ReviewedDomain[] {
  if (!bank?.sections?.length) return [];

  const asked = new Map(detail.map((item) => [item.itemId, item]));
  const byDomain = new Map<Domain, ReviewedChapter[]>();

  for (const section of bank.sections) {
    const domain = section.domain as Domain;
    if (!DOMAIN_LABELS[domain]) continue;

    const questions: ReviewedQuestion[] = (section.items ?? []).map((item, index) => {
      const outcome = asked.get(item.id);
      const status: QuestionStatus = !outcome
        ? 'not-asked'
        : outcome.given == null
          ? 'blank'
          : outcome.correct
            ? 'correct'
            : 'wrong';
      return {
        itemId: item.id,
        number: printedNumber(item, index),
        status,
        given: outcome?.given ?? null,
        answer: outcome ? outcome.answer : (item.answer ?? null),
      };
    });

    questions.sort((a, b) => a.number - b.number);

    const chapter: ReviewedChapter = {
      sectionId: section.id,
      title: section.title ?? section.id,
      domain,
      questions,
      asked: questions.filter((q) => q.status !== 'not-asked').length,
      correct: questions.filter((q) => q.status === 'correct').length,
    };
    byDomain.set(domain, [...(byDomain.get(domain) ?? []), chapter]);
  }

  return [...byDomain.entries()].map(([domain, chapters]) => {
    const askedCount = chapters.reduce((n, chapter) => n + chapter.asked, 0);
    const correct = chapters.reduce((n, chapter) => n + chapter.correct, 0);
    return {
      domain,
      label: DOMAIN_LABELS[domain],
      chapters,
      asked: askedCount,
      correct,
      percent: askedCount ? Math.round((correct / askedCount) * 100) : null,
    };
  });
}
