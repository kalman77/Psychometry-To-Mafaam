/* Free-form provenance for a bank. Nothing here drives behaviour. */

export interface BankMeta {
  id?: string;
  title?: string;
  language?: string;
  source?: string;
  /** The sitting this booklet belongs to, e.g. "מועד אביב 2025". */
  session?: string;
  note?: string;
}
