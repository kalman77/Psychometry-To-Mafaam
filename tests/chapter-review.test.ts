/* The review grid: the booklet's own chapters, marked with what the sitting did.
 *
 * The distinction that matters is between a question answered wrongly and one
 * this sitting never drew. Both are "not right", and conflating them would tell
 * a learner they failed questions they were never shown.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { reviewChapters } from '../src/presentation/web/views/results-view/chapter-review.ts';
import { renderQuestionDetail } from '../src/presentation/web/views/results-view/question-detail.ts';
import type { AnsweredItem } from '../src/domain/model/scoring/answered-item.ts';
import type { Bank } from '../src/domain/model/bank.ts';

const bank = {
  meta: { id: 'b', title: 'חוברת' },
  sections: [
    {
      id: 'v1',
      domain: 'verbal',
      title: 'מילולי — פרק ראשון',
      stimuli: [],
      items: [1, 2, 3, 4].map((n) => ({
        id: `v1-${n}`,
        type: 'analogy',
        stem: `שאלה ${n}`,
        options: ['א', 'ב', 'ג', 'ד'],
        answer: 2,
      })),
    },
    {
      id: 'v2',
      domain: 'verbal',
      title: 'מילולי — פרק שני',
      stimuli: [],
      items: [1, 2].map((n) => ({
        id: `v2-${n}`,
        type: 'analogy',
        stem: `שאלה ${n}`,
        options: ['א', 'ב', 'ג', 'ד'],
        answer: 3,
      })),
    },
  ],
} as unknown as Bank;

const answered = (itemId: string, given: number | null, correct: boolean): AnsweredItem =>
  ({
    itemId,
    domain: 'verbal',
    type: 'analogy',
    given,
    answer: 2,
    correct,
    scored: true,
  }) as AnsweredItem;

test('a chapter shows every question, asked or not', () => {
  // The sitting drew two of the four in the first chapter.
  const [verbal] = reviewChapters(bank, [answered('v1-1', 2, true), answered('v1-3', 4, false)]);
  const first = verbal!.chapters[0]!;

  assert.equal(first.questions.length, 4, 'the whole printed chapter is shown');
  assert.deepEqual(
    first.questions.map((q) => q.status),
    ['correct', 'not-asked', 'wrong', 'not-asked'],
  );
  assert.equal(first.asked, 2, 'only two of them count as asked');
  assert.equal(first.correct, 1);
});

test('a question left blank is told apart from one answered wrongly', () => {
  const [verbal] = reviewChapters(bank, [answered('v1-1', null, false), answered('v1-2', 4, false)]);
  const statuses = verbal!.chapters[0]!.questions.map((q) => q.status);

  assert.equal(statuses[0], 'blank', 'running out of time is not a wrong answer');
  assert.equal(statuses[1], 'wrong');
});

test('a question the sitting never drew still carries its key', () => {
  // The whole chapter is there to be worked through, not only the part the
  // sampling happened to land on, so an unasked question opens like any other.
  const [verbal] = reviewChapters(bank, [answered('v1-1', 2, true)]);
  const [asked, notAsked] = verbal!.chapters[0]!.questions;

  assert.equal(asked!.answer, 2);
  assert.equal(notAsked!.status, 'not-asked');
  assert.equal(notAsked!.answer, 2, 'the key comes off the bank item');
  assert.equal(notAsked!.given, null, 'and nothing was picked, because it was never shown');
});

test('an unasked question says so rather than pretending it was marked', () => {
  const [verbal] = reviewChapters(bank, []);
  const html = renderQuestionDetail(bank, verbal!.chapters[0]!.questions[0]!, undefined);

  assert.match(html, /לא נכללה במבחן/);
  assert.ok(!html.includes('מה שסימנת'), 'nothing was picked, so nothing is marked as picked');
  assert.ok(html.includes('התשובה הנכונה'), 'but the key is shown');
});

test('the chapters stay separate, and the domain totals span them', () => {
  const [verbal] = reviewChapters(bank, [
    answered('v1-1', 2, true),
    answered('v2-1', 1, false),
    answered('v2-2', 3, true),
  ]);

  assert.equal(verbal!.chapters.length, 2, 'two printed chapters, shown apart');
  assert.deepEqual(
    verbal!.chapters.map((chapter) => chapter.sectionId),
    ['v1', 'v2'],
  );
  assert.equal(verbal!.asked, 3);
  assert.equal(verbal!.correct, 2);
  assert.equal(verbal!.percent, 67, 'two of three, rounded');
});

test('a domain nothing was drawn from reports no percentage rather than zero', () => {
  const [verbal] = reviewChapters(bank, []);
  assert.equal(verbal!.asked, 0);
  assert.equal(verbal!.percent, null, 'nothing asked is not the same as nothing right');
});

test('questions are shown in the booklet numbering, not bank order', () => {
  const shuffled = {
    sections: [
      {
        id: 'v1',
        domain: 'verbal',
        title: 'x',
        stimuli: [],
        items: [
          { id: 'v1-3', type: 'analogy', stem: 'c', options: ['1'], answer: 1 },
          { id: 'v1-1', type: 'analogy', stem: 'a', options: ['1'], answer: 1 },
          { id: 'v1-2', type: 'analogy', stem: 'b', options: ['1'], answer: 1 },
        ],
      },
    ],
  } as unknown as Bank;

  const [verbal] = reviewChapters(shuffled, []);
  assert.deepEqual(
    verbal!.chapters[0]!.questions.map((q) => q.number),
    [1, 2, 3],
  );
});

test('an opened question shows the pick and the key', () => {
  const [verbal] = reviewChapters(bank, [answered('v1-1', 4, false)]);
  const question = verbal!.chapters[0]!.questions[0]!;
  const html = renderQuestionDetail(bank, question, 42);

  assert.match(html, /שאלה 1/);
  assert.ok(html.includes('התשובה הנכונה'), 'the key is named');
  assert.ok(html.includes('מה שסימנת'), 'and so is the pick');
  // Option 2 is right, 4 was picked. Anchored so the class list of an option
  // row is not confused with `review-opts`, `review-opt-n` or `review-opt-tag`.
  const options = [...html.matchAll(/class="(review-opt(?: [a-z]+)*)"/g)]
    .map((m) => m[1]!)
    .filter((cls) => !/^review-opt[a-z-]/.test(cls));
  assert.ok(options[1]!.includes('right'), 'the second option is the key');
  assert.ok(options[3]!.includes('picked'), 'the fourth is what was picked');
});

test('a question answered correctly says so once, not twice', () => {
  const [verbal] = reviewChapters(bank, [answered('v1-1', 2, true)]);
  const html = renderQuestionDetail(bank, verbal!.chapters[0]!.questions[0]!, 10);

  assert.ok(html.includes('ענית נכון'));
  assert.ok(!html.includes('מה שסימנת'), 'the pick and the key are the same option');
});

test('a question the booklet no longer holds fails softly', () => {
  const html = renderQuestionDetail(bank, {
    itemId: 'gone-9',
    number: 9,
    status: 'wrong',
    given: 1,
    answer: 2,
  }, 0);
  assert.match(html, /לא נמצאה/);
});
