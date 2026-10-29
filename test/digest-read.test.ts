import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

const temps: string[] = [];
function tempRuns(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  temps.push(dir);
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('readNight', () => {
  it('reads runs/2026-10-28.jsonl: 5 jobs, 1 bad line', () => {
    const night = readNight('runs', '2026-10-28');
    expect(night).not.toBeNull();
    if (night === null) return;
    expect(night.night).toBe('2026-10-28');
    expect(night.badLines).toBe(1);
    expect(night.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    const byJob = new Map(night.rows.map((r) => [r.job, r]));
    expect(byJob.get('fixtures/refresh')).toMatchObject({
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(byJob.get('notes/backup')).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
    expect(byJob.get('digest/render')).toMatchObject({ owner: null, lastError: null });
    expect(byJob.get('lane/sync')?.firstAt).toBe('2026-10-28T23:00:06+01:00');
  });

  it('returns null for a night with no file', () => {
    expect(readNight('runs', '1999-01-01')).toBeNull();
  });

  it('an empty file gives no rows and no bad lines', () => {
    const dir = tempRuns({ '2026-01-01.jsonl': '' });
    expect(readNight(dir, '2026-01-01')).toEqual({ night: '2026-01-01', rows: [], badLines: 0 });
  });

  it('counts invalid lines and skips blank trailing lines', () => {
    const lines = [
      '{"at":"2026-01-02T01:00:00+01:00","job":"a","status":"ok","owner":"rook"}',
      'not json',
      '{"at":"2026-01-02T01:00:00+01:00","job":"a","status":"done","owner":"rook"}',
      '{"job":"a","status":"ok","owner":"rook"}',
      '{"at":"2026-01-02T01:00:00+01:00","status":"ok","owner":"rook"}',
      '[1,2]',
      '',
      '',
    ];
    const dir = tempRuns({ '2026-01-02.jsonl': lines.join('\n') });
    const night = readNight(dir, '2026-01-02');
    expect(night?.badLines).toBe(5);
    expect(night?.rows).toHaveLength(1);
  });
});
