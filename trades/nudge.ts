/**
 * Hour-log nudges — the small thing that saves a shop the Monday-morning
 * scramble. A crew that doesn't log hours the day they work them is a crew
 * reconstructing the week from memory on payday, which is how hours get
 * wrong and prevailing-wage certified payroll gets late. So at the end of
 * each work day, anyone who was on the active roster and logged nothing gets
 * a friendly text: two taps and you're done.
 *
 * The DECISION (who gets nudged, and what it says) is real and lives here.
 * The DELIVERY (handing the message to an SMS carrier) is a boundary this
 * project draws the same way site/server.ts draws it around Stripe and email:
 * a real send needs a carrier account and credentials that aren't wired into
 * this environment, so the default sender logs the message and reports itself
 * as not-delivered rather than pretending a text went out. Set a carrier up
 * (a Twilio client, say) and pass it as the sender; nothing else changes.
 *
 * THE 5 PM PART is a schedule, not code that lives here: a cron (or the
 * harness's own scheduler) calls the nudge endpoint once a day at 17:00 in the
 * shop's timezone. This module is what that call runs.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Friendly "Fri Jan 9" from an ISO date, in UTC so it never drifts a day by timezone. */
function friendlyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${WEEKDAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** A worker who could be nudged — name and (optionally) a mobile number. */
export interface NudgeWorker {
  employeeId: string;
  name: string;
  phone?: string;
}

export interface NudgeCandidate {
  employeeId: string;
  name: string;
  phone: string | null;
  text: string;
}

/** The reminder text. Uses the first name, names the day, and keeps it to one friendly line. */
export function renderNudgeText(name: string, date: string): string {
  const first = name.trim().split(/\s+/)[0] || name;
  return `Hey ${first} — no hours logged for ${friendlyDate(date)} yet. Two taps in Crewtally and payday stays on time. 👷`;
}

/**
 * Who to nudge for `date`: every active worker whose id is NOT in
 * `loggedEmployeeIds`. Pure — the caller supplies the active roster and the
 * set of ids that already logged something that day (from the worked-hours
 * store), so this makes no I/O and is trivially testable.
 */
export function computeMissingHoursNudges(
  workers: readonly NudgeWorker[],
  loggedEmployeeIds: Iterable<string>,
  date: string,
): NudgeCandidate[] {
  const logged = new Set(loggedEmployeeIds);
  return workers
    .filter((w) => !logged.has(w.employeeId))
    .map((w) => ({ employeeId: w.employeeId, name: w.name, phone: w.phone ?? null, text: renderNudgeText(w.name, date) }));
}

export interface NudgeSendResult {
  employeeId: string;
  phone: string | null;
  /** true only once a real carrier has accepted the message. The default sender is honest: it never claims delivery. */
  delivered: boolean;
  /** How it went out (or didn't) — e.g. 'console (no SMS carrier configured)' or 'twilio'. */
  via: string;
  text: string;
}

export interface NudgeSender {
  send(candidate: NudgeCandidate): NudgeSendResult;
}

/**
 * The default sender: logs the message and reports delivered:false. This is the
 * disclosed boundary — a real deployment swaps in a carrier-backed sender. It
 * still returns a result per candidate so the caller (and the UI) can show
 * exactly who WOULD be texted and what they'd receive.
 */
export const consoleNudgeSender: NudgeSender = {
  send(candidate) {
    const target = candidate.phone ?? '(no number on file)';
    // eslint-disable-next-line no-console
    console.log(`[nudge] would text ${target}: ${candidate.text}`);
    return { employeeId: candidate.employeeId, phone: candidate.phone, delivered: false, via: 'console (no SMS carrier configured)', text: candidate.text };
  },
};

/** Send (or, with the default sender, stage) a nudge to each candidate. */
export function sendNudges(candidates: readonly NudgeCandidate[], sender: NudgeSender = consoleNudgeSender): NudgeSendResult[] {
  return candidates.map((c) => sender.send(c));
}
