import { calculatePaycheck } from '../../src/calculate.ts';
import type { PaycheckInput } from '../../src/types.ts';
import type { Faq } from './seo-pages.ts';
import { table, code, type Helpers, type TopicDef } from './seo-topics.ts';

/**
 * Shared pieces for the additional search-intent pages. Each page is one intent a payroll
 * professional or developer types into a search box, answered with figures the engine returns:
 * the worked examples are run through the engine at build time, so a page cannot show a number the
 * engine would not return.
 */

export type Result = ReturnType<typeof calculatePaycheck>;
export type Group = TopicDef['group'];

export const W4 = { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 } as const;

export const run = (input: PaycheckInput): Result => calculatePaycheck(input);
export const line = (r: Result, id: string) => r.taxes.find((t) => t.id === id);
export const sum = (r: Result, pred: (t: Result['taxes'][number]) => boolean) => r.taxes.filter(pred).reduce((a, t) => a + t.amount, 0);

/** A paycheck request; `extra` is spread over it last so a scenario can add earnings, deductions or a YTD. */
export function inp(h: Helpers, state: string, certificate: Record<string, unknown> = {}, gross = 300_000, extra: Record<string, unknown> = {}): PaycheckInput {
  return { ...h.exampleInput(state, certificate, gross, 0), ...extra } as PaycheckInput;
}

/** Table of the non-zero tax lines of a result. `who` limits it to one payer. */
export function taxTable(h: Helpers, r: Result, who?: 'employee' | 'employer'): string {
  const rows = r.taxes
    .filter((t) => t.amount > 0 && (!who || t.payer === who))
    .map((t) => [h.esc(t.name), t.payer === 'employer' ? 'Employer' : 'Employee', h.money(t.taxableWages), h.money(t.amount)]);
  return table(h, ['Tax', 'Paid by', 'Taxable wages', 'Amount'], rows, 2);
}

/** Table of chosen lines from a result, by id. Missing ids are skipped. */
export function pick(h: Helpers, r: Result, ids: string[]): string {
  const rows = ids.flatMap((id) => {
    const t = line(r, id);
    return t ? [[h.esc(t.name), h.money(t.taxableWages), h.money(t.amount)]] : [];
  });
  return table(h, ['Tax', 'Taxable wages', 'Amount'], rows, 1);
}

export interface Spec {
  path: string;
  label: string;
  group: Group;
  /** Title without the brand suffix; " | Omnia.tax" is added. */
  title: string;
  description: string;
  h1: string;
  sub: string;
  /** Opening paragraph(s), already HTML. */
  lead: string;
  /** [heading, html] pairs. */
  sections: Array<[string, string]>;
  faq: Faq[];
  related: string[];
}

export function def(s: Spec): TopicDef {
  const body = [s.lead, ...s.sections.map(([h2, html]) => `<h2>${h2}</h2>\n    ${html}`)].map((x) => `    ${x.trim()}`).join('\n');
  return {
    path: s.path, label: s.label, group: s.group,
    title: `${s.title} | Omnia.tax`, description: s.description, h1: s.h1, eyebrow: s.group, sub: s.sub,
    body: `\n${body}`, faq: s.faq, related: s.related,
  };
}

/** A paragraph. */
export const p = (html: string) => `<p>${html}</p>`;
/** A bullet list. */
export const ul = (items: string[]) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
/** A two-column table with left-aligned cells. */
export const kv = (h: Helpers, headers: [string, string], rows: string[][]) => table(h, headers, rows, 1).replace(/text-align:right/g, 'text-align:left');
export { table, code };
export type { Helpers, TopicDef };
