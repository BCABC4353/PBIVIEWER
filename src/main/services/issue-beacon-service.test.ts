import { describe, it, expect, vi } from 'vitest';
import { IssueBeaconService, type IssueBeaconDeps } from './issue-beacon-service';

function makeDeps(over: Partial<IssueBeaconDeps> = {}): {
  deps: IssueBeaconDeps;
  posts: Array<{ url: string; body: any }>;
  saved: { issueNumber: number | null };
} {
  const posts: Array<{ url: string; body: any }> = [];
  // In-memory stand-in for the beacon store's persisted issue number, shared
  // across service instances built from the same deps (simulates a restart).
  const saved: { issueNumber: number | null } = { issueNumber: null };
  let clock = 1_000_000;
  const deps: IssueBeaconDeps = {
    enabled: true,
    includeNames: true,
    repo: 'owner/telemetry',
    token: 'tok',
    appVersion: '2.1.8',
    platform: 'win32',
    installId: 'abcd1234',
    postJson: vi.fn(async (url: string, _t: string, body: unknown) => {
      posts.push({ url, body });
      // Mimic GitHub: creating an issue returns the new issue's number in the
      // response body; creating a comment returns a body the service ignores.
      return url.endsWith('/issues')
        ? { status: 201, body: { number: 1347 } }
        : { status: 201 };
    }),
    loadIssueNumber: () => saved.issueNumber,
    saveIssueNumber: vi.fn((issueNumber: number) => {
      saved.issueNumber = issueNumber;
    }),
    now: () => clock,
    logger: { warn: vi.fn(), info: vi.fn() },
    ...over,
  };
  // Expose a clock-advance hook via a property the tests can poke.
  (deps as unknown as { advance: (ms: number) => void }).advance = (ms: number) => {
    clock += ms;
  };
  return { deps, posts, saved };
}

describe('IssueBeaconService', () => {
  it('is a no-op when disabled — never records or posts', async () => {
    const { deps, posts } = makeDeps({ enabled: false });
    const svc = new IssueBeaconService(deps);
    svc.record({ code: 'X' });
    await svc.flush();
    expect(posts).toHaveLength(0);
    expect(deps.postJson).not.toHaveBeenCalled();
  });

  it('opens one issue for the install, then appends comments on later flushes', async () => {
    const { deps, posts, saved } = makeDeps();
    const advance = (deps as unknown as { advance: (ms: number) => void }).advance;
    const svc = new IssueBeaconService(deps);

    svc.record({ code: 'REPORT_EMBED_ERROR', httpStatus: 403, itemName: 'Sales Daily' });
    await svc.flush();
    expect(posts).toHaveLength(1);
    expect(posts[0]!.url).toBe('https://api.github.com/repos/owner/telemetry/issues');
    expect(posts[0]!.body.title).toContain('install abcd1234');
    expect(posts[0]!.body.body).toContain('REPORT_EMBED_ERROR');
    expect(posts[0]!.body.body).toContain('HTTP 403');
    expect(posts[0]!.body.body).toContain('Sales Daily');
    // The created issue's number was captured AND persisted.
    expect(saved.issueNumber).toBe(1347);

    // Second flush (past the rate-limit gap) must COMMENT on the created
    // issue, not open another one — the original "new issue every flush" bug.
    svc.record({ code: 'SECOND_BATCH' });
    advance(60_000);
    await svc.flush();
    expect(posts).toHaveLength(2);
    expect(posts[1]!.url).toBe(
      'https://api.github.com/repos/owner/telemetry/issues/1347/comments',
    );
    expect(posts[1]!.body.body).toContain('SECOND_BATCH');
    expect(posts[1]!.body.title).toBeUndefined();
  });

  it('resumes the persisted issue thread after a restart (no duplicate issue)', async () => {
    const { deps, posts } = makeDeps();
    const svc = new IssueBeaconService(deps);
    svc.record({ code: 'FIRST_SESSION' });
    await svc.flush();
    expect(posts[0]!.url).toBe('https://api.github.com/repos/owner/telemetry/issues');

    // "Restart": a fresh service instance over the same persisted state. Its
    // first flush must comment on the existing thread, not open a new issue.
    const svc2 = new IssueBeaconService(deps);
    svc2.record({ code: 'SECOND_SESSION' });
    await svc2.flush();
    expect(posts).toHaveLength(2);
    expect(posts[1]!.url).toBe(
      'https://api.github.com/repos/owner/telemetry/issues/1347/comments',
    );
    expect(posts[1]!.body.body).toContain('SECOND_SESSION');
  });

  it('redacts tokens/emails/GUIDs from names and context before transmission', async () => {
    const { deps, posts } = makeDeps();
    const svc = new IssueBeaconService(deps);
    svc.record({
      code: 'APP_WEBVIEW_ERROR',
      itemName: 'user@client.com report',
      context: 'Bearer abc.def.ghi failed for 11111111-2222-3333-4444-555555555555',
    });
    await svc.flush();
    const body = posts[0]!.body.body as string;
    expect(body).not.toContain('user@client.com');
    expect(body).not.toContain('11111111-2222-3333-4444-555555555555');
    expect(body).toContain('[EMAIL]');
    expect(body).toContain('[GUID]');
    expect(body).toContain('Bearer [REDACTED]');
  });

  it('drops item names when includeNames is false (regulated-data mode)', async () => {
    const { deps, posts } = makeDeps({ includeNames: false });
    const svc = new IssueBeaconService(deps);
    svc.record({ code: 'REPORT_EMBED_ERROR', itemName: 'Patient Readmissions' });
    await svc.flush();
    const body = posts[0]!.body.body as string;
    expect(body).not.toContain('Patient Readmissions');
    expect(body).toContain('REPORT_EMBED_ERROR');
  });

  it('rate-limits: a second flush within the min gap does not post again', async () => {
    const { deps, posts } = makeDeps();
    const svc = new IssueBeaconService(deps);
    svc.record({ code: 'A' });
    await svc.flush(); // posts (creates issue)
    svc.record({ code: 'B' });
    await svc.flush(); // within MIN_POST_GAP → suppressed
    expect(posts).toHaveLength(1);
  });

  it('re-queues the batch when the post fails, so nothing is lost', async () => {
    const { deps, posts } = makeDeps({
      postJson: vi.fn(async (url: string, _t, body: unknown) => {
        posts.push({ url, body });
        return { status: 500 }; // server error
      }),
    });
    const advance = (deps as unknown as { advance: (ms: number) => void }).advance;
    const svc = new IssueBeaconService(deps);
    svc.record({ code: 'KEEPME' });
    await svc.flush(); // fails, re-queues
    expect(posts).toHaveLength(1);

    advance(60_000); // clear the rate-limit window
    (deps.postJson as ReturnType<typeof vi.fn>).mockImplementationOnce(async (url: string, _t, body: unknown) => {
      posts.push({ url, body });
      return { status: 201, body: { number: 7 } };
    });
    await svc.flush();
    // The retried post still carries the original event.
    expect(posts).toHaveLength(2);
    expect(JSON.stringify(posts[1]!.body)).toContain('KEEPME');
  });
});
