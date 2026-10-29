import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const night = '2026-10-28';

let runsDir: string;

function app() {
  return createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
}

function writeNight(body: string) {
  writeFileSync(join(runsDir, `${night}.jsonl`), body);
}

beforeEach(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
});

afterEach(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('digest routes', () => {
  it('a normal night: the page and the JSON list both jobs in the same order', async () => {
    // File order is deliberately not job order, so the sort has to happen.
    writeNight(
      [
        '{"at":"2026-10-28T23:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
        '{"at":"2026-10-28T23:05:00+01:00","job":"digest/render","status":"retry","owner":null,"error":"timeout"}',
        '{"at":"2026-10-28T23:10:00+01:00","job":"digest/render","status":"ok","owner":null}',
        '{"at":"2026-10-28T23:20:00+01:00","job":"notes/backup","status":"fail","owner":"rook","error":"quota exceeded"}',
        '',
      ].join('\n'),
    );

    const page = await app().request(`/digest/${night}`);
    const html = await page.text();
    expect(page.status).toBe(200);
    const jobs = ['digest/render', 'lane/sync', 'notes/backup'];
    for (const job of jobs) expect(html).toContain(job);
    const positions = jobs.map((job) => html.indexOf(job));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));

    const api = await app().request(`/api/digest/${night}`);
    expect(api.status).toBe(200);
    const body = (await api.json()) as { night: string; rows: { job: string }[]; badLines: number };
    expect(body.night).toBe(night);
    expect(body.rows.map((r) => r.job)).toEqual(jobs);
    expect(body.badLines).toBe(0);
    expect(body.rows[0]).toMatchObject({ job: 'digest/render', runs: 2, retries: 1, lastStatus: 'ok', lastError: 'timeout' });
  });

  it('a night with no file: 404 on both routes', async () => {
    const page = await app().request(`/digest/${night}`);
    expect(page.status).toBe(404);
    const api = await app().request(`/api/digest/${night}`);
    expect(api.status).toBe(404);
    expect(await api.json()).toEqual({ error: 'not found' });
  });

  it('an empty file: the page says nothing ran and the JSON has no rows', async () => {
    writeNight('');

    const page = await app().request(`/digest/${night}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('nothing ran');

    const api = await app().request(`/api/digest/${night}`);
    expect(api.status).toBe(200);
    expect(await api.json()).toEqual({ night, rows: [], badLines: 0 });
  });

  it('a night with one bad line: the page mentions it and the JSON counts it', async () => {
    writeNight(
      [
        '{"at":"2026-10-28T23:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
        'not json',
        '',
      ].join('\n'),
    );

    const page = await app().request(`/digest/${night}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toMatch(/1 line didn(&#39;|')t parse/);

    const api = await app().request(`/api/digest/${night}`);
    expect(api.status).toBe(200);
    const body = (await api.json()) as { rows: { job: string }[]; badLines: number };
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['lane/sync']);
  });

  it('an invalid night (path traversal) is 404 on both routes', async () => {
    const page = await app().request('/digest/..%2Fetc');
    expect(page.status).toBe(404);
    const api = await app().request('/api/digest/..%2Fetc');
    expect(api.status).toBe(404);
  });
});
