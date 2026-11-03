import { makePackage, registerChannel, channel, type AgencyChannel, type ChannelId, type FilingPackage } from '../federal/agency.ts';
import type { Finding } from '../federal/form941.ts';
import { loadProfile, modelledStates, type StateProfile } from './profile.ts';

/**
 * STATE AGENCY CHANNELS. A state profile lists the channels an employer files
 * through; this turns them into the same registry entries the federal layer uses, so
 * state filings run through the same lifecycle (`FilingBook`: draft, validated,
 * approved, rehearsed, transmitted, accepted) with the same honesty rules.
 *
 * No state transport is connected. A sandbox transport rehearses and says nothing
 * was sent; a live transport refuses and lists the enrollment steps the profile
 * records. Where a profile says a step or a specification was not read, the channel
 * says `not_read` instead of implying it is known.
 */

export function stateChannels(profile: StateProfile): AgencyChannel[] {
  const agency = profile.agencies.ui?.name ?? profile.agencies.withholding?.name ?? profile.name;
  const mandate = profile.mandates.efile?.text ?? profile.mandates.epay?.text;
  return profile.channels.map((c) => ({
    id: c.id as ChannelId,
    agencyId: profile.state,
    agency,
    purpose: c.description,
    forms: [c.function],
    enrollment: c.enrollment,
    specs: [{ name: `${profile.state} ${c.function}: file layouts and specifications`, availability: 'not_read' as const, note: c.specs }],
    mandate,
    sources: profile.sources.filter((s) => s.id === c.source).map((s) => ({ title: s.title, url: s.url })),
  }));
}

/** Register a state's channels with the shared registry. Idempotent. */
export function registerStateChannels(profile: StateProfile): AgencyChannel[] {
  const list = stateChannels(profile);
  for (const c of list) registerChannel(c);
  return list;
}

/** Register the channels of every modelled state. */
export function registerAllStateChannels(): string[] {
  const states = modelledStates();
  for (const s of states) registerStateChannels(loadProfile(s));
  return states;
}

export type StateFilingKind = 'state_return' | 'state_deposit' | 'state_new_hire';

/**
 * A filing package for the shared lifecycle. The channel must be one the profile
 * defines (and so a person has been told what enrolling in it requires).
 */
export function stateFilingPackage(args: {
  profile: StateProfile;
  channelSuffix: string;
  kind: StateFilingKind;
  /** The employer's EIN, which identifies the filing in the book. */
  ein: string;
  period: string;
  payload: unknown;
  fields: Record<string, unknown>;
  findings: Finding[];
}): FilingPackage {
  registerStateChannels(args.profile);
  const channelId = `state:${args.profile.state}:${args.channelSuffix}` as ChannelId;
  channel(channelId); // throws "Unknown channel" if the profile does not define it
  return makePackage({ kind: args.kind, ein: args.ein, period: `${args.profile.state}-${args.period}`, payload: args.payload, fields: args.fields, findings: args.findings, channelId });
}
