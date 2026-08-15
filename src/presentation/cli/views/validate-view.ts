/* Renders a validation report as the lines the CLI prints. */

import type { ValidationReport } from '../../../application/use-cases/validate-bank.ts';

export function renderValidation(report: ValidationReport): string {
  if (report.valid) return `✓ תקין — ${report.itemCount} שאלות`;

  return [
    `✗ ${report.problems.length} בעיות:`,
    ...report.problems.map((p) => `  ${p.where}\n    ${p.message}`),
  ].join('\n');
}
