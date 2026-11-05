import { addDays } from '../federal/calendar.ts';
import type { StateProfile } from './profile.ts';

/**
 * New-hire reporting: "within 20 calendar days of the start-of-work date" is
 * California's own wording (DE 44); each state states its own number of days. The
 * deadline is calendar days from the start of work and is not moved off weekends,
 * because the agency's rule does not say it is.
 */

export interface NewHireDeadline {
  state: string;
  form: string;
  startOfWork: string;
  dueDate: string;
  daysFromStart: number;
}

export function newHireDeadline(profile: StateProfile, startOfWork: string): NewHireDeadline {
  if (!profile.newHire) {
    throw new Error(`NOT MODELLED: ${profile.state} has no new-hire reporting rule in its profile. Do not assume the federal 20 days: read the state's own rule.`);
  }
  return {
    state: profile.state,
    form: profile.newHire.form,
    startOfWork,
    dueDate: addDays(startOfWork, profile.newHire.daysFromStart),
    daysFromStart: profile.newHire.daysFromStart,
  };
}

export type NewHireState = 'on_time' | 'late' | 'due_soon' | 'open' | 'overdue';

export function newHireStatus(profile: StateProfile, startOfWork: string, asOf: string, reportedOn?: string): { deadline: NewHireDeadline; state: NewHireState } {
  const deadline = newHireDeadline(profile, startOfWork);
  if (reportedOn) return { deadline, state: reportedOn <= deadline.dueDate ? 'on_time' : 'late' };
  if (asOf > deadline.dueDate) return { deadline, state: 'overdue' };
  const days = Math.round((Date.parse(`${deadline.dueDate}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`)) / 86_400_000);
  return { deadline, state: days <= 5 ? 'due_soon' : 'open' };
}
