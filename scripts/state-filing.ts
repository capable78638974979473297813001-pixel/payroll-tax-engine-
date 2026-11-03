import { readFileSync } from 'node:fs';
import { writeStateFilingPacket, recordStateFilingReceipt } from '../payroll/stateFilingPackets.ts';

const [command, ...args] = process.argv.slice(2);
try {
  if (command === 'prepare' && args.length === 2) {
    const manifest = writeStateFilingPacket(JSON.parse(readFileSync(args[0], 'utf8')), args[1]);
    console.log(JSON.stringify({ status: manifest.status, state: manifest.state, form: manifest.form,
      recordCount: manifest.recordCount, sha256: manifest.sha256 }));
  } else if (command === 'receipt' && args.length === 3) {
    const event = recordStateFilingReceipt(args[0], JSON.parse(readFileSync(args[1], 'utf8')), readFileSync(args[2]));
    console.log(JSON.stringify({ status: event.status, sequence: event.sequence, source: event.source }));
  } else {
    throw new Error('Usage: state-filing.ts prepare INPUT.json NEW_OUTPUT_DIRECTORY | receipt PACKET_DIRECTORY RECEIPT.json EVIDENCE_FILE');
  }
} catch (error) {
  // JSON parse errors can contain snippets of employee data. Do not echo them.
  console.error(error instanceof SyntaxError ? 'Invalid JSON input' : error instanceof Error ? error.message : 'Filing command failed');
  process.exitCode = 1;
}
