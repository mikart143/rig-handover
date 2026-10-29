import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RunStatus } from './types.js';

export type NightCounts = Record<RunStatus, number>;

const STATUSES: readonly string[] = ['ok', 'retry', 'fail'];

// Counts log lines by status for runs/<night>.jsonl. Bad lines are ignored.
// Returns null when the file can't be read.
export function countNight(runsDir: string, night: string): NightCounts | null {
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (typeof parsed !== 'object' || parsed === null) continue;
      const status = (parsed as Record<string, unknown>).status;
      if (typeof status === 'string' && STATUSES.includes(status)) counts[status as RunStatus]++;
    } catch {
      // bad line: skipped
    }
  }
  return counts;
}
