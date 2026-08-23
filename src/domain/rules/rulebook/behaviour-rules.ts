/* What the learner is and isn't allowed to do mid-sitting. */

export interface BehaviourRules {
  /** One shot per question, no returning. */
  allowBack: boolean;
  /** Answering early lets you move on. */
  allowEarlyAdvance: boolean;
  autoAdvanceOnTimeout: boolean;
  /** The passage/table stays on screen during its questions. */
  keepStimulusVisible: boolean;
}
