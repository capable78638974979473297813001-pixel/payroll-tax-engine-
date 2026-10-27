import { paycheckRequestSchema } from './api-spec.ts';

/**
 * Model Context Protocol over streamable HTTP (POST /mcp), JSON-RPC 2.0.
 * This module is the protocol only: it parses a message, answers the
 * handshake and the tool list, and hands a tool call to the function the
 * server gives it. It has no idea what a paycheck is, and it never touches
 * billing or keys.
 *
 * What is supported: initialize, ping, tools/list, tools/call, and the
 * notifications a client sends (acknowledged, nothing to do). One JSON-RPC
 * message per request; batches were removed from the protocol in 2025-06-18
 * and are refused. Replies are plain JSON, which a streamable-HTTP client
 * accepts; there is no server-initiated stream, so GET /mcp is a 405.
 */

export const SERVER_INFO = { name: 'omnia-tax', title: 'Omnia payroll tax engine', version: '1.0.0' };
export const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const;

export type ToolName = 'calculate_paycheck' | 'compare_paychecks' | 'gross_up' | 'employer_taxes' | 'lookup_address' | 'coverage';

export interface ToolOutcome {
  /** True when the call was refused or failed; the body explains. */
  isError: boolean;
  body: unknown;
}

export interface RpcResult {
  /** null for a notification: answer 202 with no body. */
  response: Record<string, unknown> | null;
  httpStatus: number;
}

const { $schema: _s, $id: _i, examples: _e, ...paycheckSchema } = paycheckRequestSchema as Record<string, unknown>;

const changeNote =
  'Use after for a full second request, or change for only the fields that differ: it is merged onto before (objects merge, arrays and values replace, null removes a field).';

export const TOOLS: Array<{ name: ToolName; title: string; description: string; inputSchema: Record<string, unknown>; annotations: Record<string, unknown> }> = [
  {
    name: 'calculate_paycheck',
    title: 'Calculate a paycheck',
    description:
      'Run one paycheck through the payroll tax engine: federal, state and local withholding, FICA, employer taxes, deductions and net pay, for the check date given. ' +
      'Amounts are integer cents. Pass the same body you would send to POST /v1/paycheck. Billed as one paycheck on a live key.',
    inputSchema: paycheckSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'compare_paychecks',
    title: 'Compare two paychecks and explain the difference',
    description:
      'Calculate two paychecks and explain what moved between them, tax by tax. The explanation applies each input difference to the first paycheck one at a time and re-runs the engine, so every figure is an engine result and the steps add up to the whole difference. ' +
      changeNote + ' Billed as two paychecks on a live key.',
    inputSchema: {
      type: 'object',
      properties: {
        before: { $ref: '#/$defs/paycheck' },
        after: { $ref: '#/$defs/paycheck', description: 'A full second paycheck request. Send this or change.' },
        change: { type: 'object', description: 'Only the fields that differ, merged onto before. Send this or after.' },
      },
      required: ['before'],
      $defs: { paycheck: paycheckSchema },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'gross_up',
    title: 'Find the gross pay for a take-home target',
    description:
      'Net to gross: find the amount of one earning that leaves the employee a given take-home pay. Send a paycheck request plus grossUp: { targetNetPay (integer cents), earningIndex (default 0) }; the amount in that earning is ignored. ' +
      'The engine is run on candidate amounts, so the answer and the full paycheck are engine results. Where a tax step skips the exact target, the smallest amount that reaches it is returned with exact: false. Billed as one paycheck on a live key.',
    inputSchema: {
      ...paycheckSchema,
      properties: {
        ...(paycheckSchema.properties as Record<string, unknown>),
        grossUp: {
          type: 'object',
          required: ['targetNetPay'],
          additionalProperties: false,
          properties: {
            targetNetPay: { type: 'integer', minimum: 0, description: 'The take-home pay wanted, in cents.' },
            earningIndex: { type: 'integer', minimum: 0, description: 'Which entry in earnings[] to solve for. Defaults to 0.' },
          },
        },
      },
      required: [...((paycheckSchema.required as string[] | undefined) ?? []), 'grossUp'],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'employer_taxes',
    title: 'Employer taxes on a quarter\'s payroll',
    description:
      'New York MCTMT and the Nevada Modified Business Tax: employer taxes charged on a quarter\'s total payroll, not on one paycheck. Send quarter ("2026-Q2") and mctmt { zone1PayrollExpense, zone2PayrollExpense } and/or nevadaMbt { category, grossWages, healthBenefitsPaid }, all money in integer cents. ' +
      'An estimate for planning and accruals; the state return is the filing. Not billed.',
    inputSchema: {
      type: 'object',
      required: ['quarter'],
      properties: {
        quarter: { type: 'string', pattern: '^\\d{4}-Q[1-4]$', description: 'The calendar quarter, e.g. 2026-Q2.' },
        mctmt: { type: 'object', properties: { zone1PayrollExpense: { type: 'integer', minimum: 0 }, zone2PayrollExpense: { type: 'integer', minimum: 0 } } },
        nevadaMbt: {
          type: 'object',
          required: ['category', 'grossWages'],
          properties: { category: { enum: ['general', 'financial'] }, grossWages: { type: 'integer', minimum: 0 }, healthBenefitsPaid: { type: 'integer', minimum: 0 } },
        },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'lookup_address',
    title: 'Resolve an address to its tax jurisdictions',
    description:
      'Turn a work address (and optionally a home address) into the state, the local jurisdictions and the certificate facts a paycheck needs. Returns what was matched, how precisely, and anything that could not be resolved. Not billed.',
    inputSchema: {
      type: 'object',
      properties: {
        workAddress: { type: 'string', maxLength: 200, description: 'One-line street address where the work is done.' },
        residenceAddress: { type: 'string', maxLength: 200, description: 'One-line street address where the employee lives.' },
        checkDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'ISO date the rules should apply on. Defaults to today.' },
      },
      anyOf: [{ required: ['workAddress'] }, { required: ['residenceAddress'] }],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: 'coverage',
    title: 'What the engine covers',
    description: 'The states and tax year this build can compute, and how complete each one is. Pass state (two letters) to get only that state. Not billed.',
    inputSchema: {
      type: 'object',
      properties: { state: { type: 'string', minLength: 2, maxLength: 2, description: 'Two-letter state code.' } },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const err = (id: unknown, code: number, message: string, data?: unknown) => ({
  jsonrpc: '2.0',
  id: id ?? null,
  error: { code, message, ...(data === undefined ? {} : { data }) },
});

export function negotiateVersion(requested: unknown): string {
  return typeof requested === 'string' && (SUPPORTED_VERSIONS as readonly string[]).includes(requested) ? requested : SUPPORTED_VERSIONS[0];
}

/** Handle one parsed JSON-RPC message. `call` runs a tool and records its usage. */
export async function handleRpc(
  message: unknown,
  call: (name: ToolName, args: Record<string, unknown>) => Promise<ToolOutcome>,
): Promise<RpcResult> {
  if (Array.isArray(message)) {
    return { httpStatus: 400, response: err(null, -32600, 'Batches are not supported. Send one JSON-RPC message per request.') };
  }
  if (!isObject(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return { httpStatus: 400, response: err(isObject(message) ? message.id : null, -32600, 'Not a JSON-RPC 2.0 request.') };
  }
  const { id, method } = message;
  const params = isObject(message.params) ? message.params : {};
  const isNotification = id === undefined;
  if (!isNotification && typeof id !== 'string' && typeof id !== 'number') {
    return { httpStatus: 400, response: err(null, -32600, 'id must be a string or a number.') };
  }

  // A client's notifications (initialized, cancelled, ...) need no answer.
  if (isNotification) return { httpStatus: 202, response: null };

  const ok = (result: unknown) => ({ httpStatus: 200, response: { jsonrpc: '2.0', id, result } as Record<string, unknown> });

  switch (method) {
    case 'initialize':
      return ok({
        protocolVersion: negotiateVersion(params.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          'Payroll tax calculations from the Omnia engine. All money is integer cents. Use calculate_paycheck for one paycheck, compare_paychecks to explain why two paychecks differ, ' +
          'lookup_address to resolve an employee\'s work and home address to jurisdictions, and coverage to see which states are supported.',
      });
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: TOOLS });
    case 'tools/call': {
      const name = params.name;
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return { httpStatus: 200, response: err(id, -32602, `Unknown tool: ${typeof name === 'string' ? name.slice(0, 80) : 'missing name'}.`) };
      const args = params.arguments === undefined ? {} : params.arguments;
      if (!isObject(args)) return { httpStatus: 200, response: err(id, -32602, 'arguments must be an object.') };
      const outcome = await call(tool.name, args);
      return ok({
        content: [{ type: 'text', text: JSON.stringify(outcome.body) }],
        structuredContent: isObject(outcome.body) ? outcome.body : { value: outcome.body },
        isError: outcome.isError,
      });
    }
    default:
      return { httpStatus: 200, response: err(id, -32601, `Method not found: ${method.slice(0, 80)}.`) };
  }
}
