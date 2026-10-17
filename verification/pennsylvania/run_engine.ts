import { readFileSync, writeFileSync } from 'node:fs';
import { calculatePaycheck } from '../../src/calculate.ts';
const dir = process.env.OUT ?? new URL('./out', import.meta.url).pathname;
const scenarios = JSON.parse(readFileSync(`${dir}/rand_scenarios.json`, 'utf8'));
const out = scenarios.map((s: any) => {
  try {
    const r = calculatePaycheck(s.engine_input);
    const lines: Record<string, number> = {};
    for (const t of r.taxes) lines[t.id] = (lines[t.id] ?? 0) + t.amount;
    return { id: s.id, ok: true, lines, gross: r.grossPay, pretax: r.pretaxDeductions, post: r.posttaxDeductions, net: r.netPay, ee: r.employeeTaxTotal };
  } catch (e: any) {
    return { id: s.id, ok: false, error: String(e?.message ?? e).slice(0, 200) };
  }
});
writeFileSync(`${dir}/rand_engine.json`, JSON.stringify(out));
console.log(`${out.length} run; ${out.filter((r: any) => !r.ok).length} threw`);
