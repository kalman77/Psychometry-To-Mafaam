#!/usr/bin/env node
/* mapam.js — validate a bank and print the MAPAM schedule it produces.
 *
 *   node mapam.js validate data/example-winter-2023.json
 *   node mapam.js schedule data/example-winter-2023.json [--writing 40] [--no-writing]
 *   node mapam.js json     data/example-winter-2023.json > built-test.json
 */
const fs = require('fs');
const M = require('./src/mapam-core.js');

const [cmd, file, ...rest] = process.argv.slice(2);
if (!cmd || !file) { usage(); process.exit(1); }

const bank = JSON.parse(fs.readFileSync(file, 'utf8'));
const problems = M.validateBank(bank);

if (cmd === 'validate') {
  if (!problems.length) { console.log('✓ תקין — ' + count(bank) + ' שאלות'); process.exit(0); }
  console.log('✗ ' + problems.length + ' בעיות:');
  problems.forEach(p => console.log('  ' + p.where + '\n    ' + p.message));
  process.exit(1);
}

if (problems.length) { console.error('Bank is invalid. Run: node mapam.js validate ' + file); process.exit(1); }

const opt = {};
const flag = (name) => { const i = rest.indexOf('--' + name); return i > -1 ? rest[i + 1] : null; };
if (flag('writing')) opt.writingMinutes = +flag('writing');
if (flag('blueprint')) opt.blueprint = flag('blueprint');
if (flag('seed')) opt.seed = flag('seed');
if (rest.includes('--no-writing')) opt.includeWriting = false;

const test = M.buildTest(bank, opt);

if (cmd === 'json') { console.log(JSON.stringify(test, null, 2)); process.exit(0); }

if (cmd === 'schedule') {
  let t = 0;
  console.log(pad('#', 4) + pad('at', 8) + pad('len', 7) + pad('kind', 15) + 'what');
  console.log('-'.repeat(78));
  test.steps.forEach(s => {
    if (s.kind === 'end') return;
    const what =
      s.kind === 'item'         ? s.itemId + '  (' + (M.LABELS.type[s.type] || s.type) + ')' :
      s.kind === 'stimulus'     ? s.title :
      s.kind === 'section-intro'? s.title :
      s.kind === 'writing'      ? 'מטלת כתיבה' :
      s.kind === 'break'        ? 'הפסקה (' + s.after + ')' : '';
    console.log(pad(s.index, 4) + pad(M.fmt(t), 8) + pad(s.seconds ? M.fmt(s.seconds) : '—', 7) + pad(s.kind, 15) + what);
    t += s.seconds || 0;
  });
  console.log('-'.repeat(78));
  const s = test.summary;
  console.log('סה״כ ' + M.fmt(s.totalSeconds) + '  (' + Math.round(s.totalSeconds / 60) + ' דק׳), מתוכן ' +
              Math.round(s.breakSeconds / 60) + ' דק׳ הפסקות · ' + s.counts.items + ' שאלות');
  Object.keys(s.byDomain).forEach(d =>
    console.log('  ' + pad(M.LABELS.domain[d] || d, 16) + pad(s.byDomain[d].items + ' שאלות', 12) + M.fmt(s.byDomain[d].seconds)));
  console.log((s.overBudget ? '✗ חורג' : '✓ בתוך') + ' תקרת ' + Math.round(s.maxSeconds / 60) + ' דק׳ למושב.');
  s.notes.forEach(n => console.log('  ! ' + n));
  process.exit(0);
}

usage(); process.exit(1);

function pad(v, n) { v = String(v); return v + ' '.repeat(Math.max(1, n - v.length)); }
function count(b) { return (b.sections || []).reduce((n, s) => n + (s.items || []).length, 0); }
function usage() {
  console.log('usage:\n  node mapam.js validate <bank.json>\n  node mapam.js schedule <bank.json> [--writing 30|35|40|45] [--no-writing]\n  node mapam.js json     <bank.json>');
}
