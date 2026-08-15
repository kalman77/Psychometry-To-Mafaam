#!/usr/bin/env node
/* CLI entry point. All it does is run the app and translate a failure into an
 * exit code — the wiring lives in app.ts.
 *
 *   mapam validate data/example-winter-2023.json
 *   mapam schedule data/example-winter-2023.json --blueprint standard --seed a
 *   mapam json     data/example-winter-2023.json > built-test.json
 */

import { InvalidBankError } from '../../domain/errors.ts';
import { run } from './app.ts';

run(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    if (error instanceof InvalidBankError)
      for (const problem of error.problems)
        console.error(`  ${problem.where}\n    ${problem.message}`);
    else console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
