/* How one question of the original booklet came out of this sitting. */

export type QuestionStatus =
  /** Asked, and answered correctly. */
  | 'correct'
  /** Asked, and answered wrongly. */
  | 'wrong'
  /** Asked, and left blank. Scored as wrong, but worth telling apart: running
   *  out of time is a different problem from picking the wrong option. */
  | 'blank'
  /** In the booklet chapter, but this sitting did not draw it. */
  | 'not-asked';
