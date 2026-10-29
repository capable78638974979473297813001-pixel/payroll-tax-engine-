import type { Helpers, TopicDef } from './seo-topics.ts';
import { devTopics } from './seo-more-dev.ts';
import { calcTopics } from './seo-more-calc.ts';
import { stateTopics } from './seo-more-states.ts';
import { roleTopics } from './seo-more-roles.ts';
import { addExtras } from './seo-more-extra.ts';

/**
 * The additional search-intent pages: one per way a payroll professional or developer names what they
 * need (an API in a language, a specific state program, a W-4 step, a role, a buying question).
 * Every figure is read from the engine's rule files and every worked example is run through the
 * engine at build time, exactly like the first topic pages.
 */
export function moreTopics(h: Helpers): TopicDef[] {
  const all = addExtras(h, [...devTopics(h), ...calcTopics(h), ...stateTopics(h), ...roleTopics(h)]);
  const seen = new Set<string>();
  for (const d of all) {
    if (seen.has(d.path)) throw new Error(`duplicate topic path ${d.path}`);
    seen.add(d.path);
  }
  const bad = all.flatMap((d) => [
    d.title.length > 70 ? `${d.path}: title is ${d.title.length} characters: ${d.title}` : '',
    d.description.length > 160 ? `${d.path}: description is ${d.description.length} characters: ${d.description}` : '',
  ]).filter(Boolean);
  if (bad.length) throw new Error(bad.join('\n'));
  return all;
}
