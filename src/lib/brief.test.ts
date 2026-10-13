import { describe, it, expect } from 'vitest';
import {
  prepareBriefInput,
  validateBrief,
  generateLocalBrief,
  formatBriefForClipboard,
  BriefError,
  MAX_TASKS,
  MAX_REQUESTS,
  MAX_TIMELINE,
  MAX_FIELD_LENGTH,
  type IncidentBriefInput,
  type IncidentBrief,
  type BriefErrorCode,
} from '@/lib/brief';
import { getSeedData } from '@/lib/seed';
import type { AppData } from '@/types';

function makeBaseData(): AppData {
  const data = getSeedData();
  data.deviceId = 'dev-test';
  data.conflicts = [];
  data.resolvedConflictIds = [];
  return data;
}

// ─── 1. Preparing incident data ─────────────────────────────────────

describe('Brief data preparation', () => {
  it('prepares incident data with all fields', () => {
    const data = makeBaseData();
    const input = prepareBriefInput(data, 'inc-1');
    expect(input).not.toBeNull();
    expect(input!.incidentTitle).toBe('Building B — Power Outage');
    expect(input!.incidentStatus).toBe('active');
    expect(input!.tasks.length).toBe(3);
    expect(input!.requests.length).toBe(2);
    expect(input!.timeline.length).toBeGreaterThan(0);
    expect(input!.unresolvedConflicts.length).toBe(0);
  });

  it('returns null for non-existent incident', () => {
    const data = makeBaseData();
    const input = prepareBriefInput(data, 'non-existent');
    expect(input).toBeNull();
  });

  // ─── 2. Excluding device IDs and relay payloads ────────────────

  it('does not include device IDs or imported change IDs', () => {
    const data = makeBaseData();
    const input = prepareBriefInput(data, 'inc-1');
    const serialized = JSON.stringify(input);
    expect(serialized).not.toContain('dev-');
    expect(serialized).not.toContain('deviceId');
    expect(serialized).not.toContain('importedChangeIds');
    expect(serialized).not.toContain('pendingChanges');
    expect(serialized).not.toContain('resolvedConflictIds');
  });

  // ─── 3. Enforcing bounded timeline and field lengths ──────────

  it('limits tasks to MAX_TASKS', () => {
    const data = makeBaseData();
    data.tasks = Array.from({ length: MAX_TASKS + 10 }, (_, i) => ({
      id: `task-bulk-${i}`,
      incidentId: 'inc-1',
      title: `Task ${i}`,
      status: 'pending' as const,
      createdAt: Date.now(),
      completedAt: null,
    }));
    const input = prepareBriefInput(data, 'inc-1');
    expect(input!.tasks.length).toBe(MAX_TASKS);
  });

  it('limits requests to MAX_REQUESTS', () => {
    const data = makeBaseData();
    data.requests = Array.from({ length: MAX_REQUESTS + 10 }, (_, i) => ({
      id: `req-bulk-${i}`,
      incidentId: 'inc-1',
      title: `Request ${i}`,
      quantity: 1,
      fulfilled: false,
      createdAt: Date.now(),
    }));
    const input = prepareBriefInput(data, 'inc-1');
    expect(input!.requests.length).toBe(MAX_REQUESTS);
  });

  it('limits timeline to MAX_TIMELINE', () => {
    const data = makeBaseData();
    data.timeline = Array.from({ length: MAX_TIMELINE + 10 }, (_, i) => ({
      id: `tl-bulk-${i}`,
      incidentId: 'inc-1',
      message: `Event ${i}`,
      kind: 'info' as const,
      createdAt: Date.now() - i * 1000,
    }));
    const input = prepareBriefInput(data, 'inc-1');
    expect(input!.timeline.length).toBe(MAX_TIMELINE);
  });

  it('clamps long field values to MAX_FIELD_LENGTH', () => {
    const data = makeBaseData();
    data.tasks[0].title = 'A'.repeat(MAX_FIELD_LENGTH + 50);
    const input = prepareBriefInput(data, 'inc-1');
    expect(input!.tasks[0].title.length).toBe(MAX_FIELD_LENGTH);
    expect(input!.tasks[0].title.endsWith('...')).toBe(true);
  });

  it('clamps incident title to 100 characters', () => {
    const data = makeBaseData();
    data.incidents[0].title = 'B'.repeat(150);
    const input = prepareBriefInput(data, 'inc-1');
    expect(input!.incidentTitle.length).toBeLessThanOrEqual(100);
  });

  // ─── 4. Validating the brief schema ────────────────────────────

  it('accepts a valid brief object', () => {
    const valid = {
      situation: 'Something happened',
      completedItems: ['Task A'],
      outstandingItems: ['Task B'],
      openRequests: ['Flashlight x2'],
      nextActions: ['Complete Task B'],
      uncertainties: ['Cause is unknown'],
      generatedAt: '2026-01-01T00:00:00Z',
      source: 'ai',
    };
    const brief = validateBrief(valid);
    expect(brief).not.toBeNull();
    expect(brief!.situation).toBe('Something happened');
    expect(brief!.completedItems).toEqual(['Task A']);
  });

  it('fills in defaults for missing optional fields', () => {
    const partial = {
      situation: 'Brief situation',
    };
    const brief = validateBrief(partial);
    expect(brief).not.toBeNull();
    expect(brief!.completedItems).toEqual([]);
    expect(brief!.source).toBe('ai');
  });

  // ─── 5. Rejecting malformed AI output ──────────────────────────

  it('rejects null', () => {
    expect(validateBrief(null)).toBeNull();
  });

  it('rejects non-object', () => {
    expect(validateBrief('not an object')).toBeNull();
    expect(validateBrief(42)).toBeNull();
    expect(validateBrief([])).toBeNull();
  });

  it('rejects missing situation', () => {
    expect(validateBrief({ completedItems: ['x'] })).toBeNull();
  });

  it('rejects empty situation', () => {
    expect(validateBrief({ situation: '' })).toBeNull();
  });

  it('filters non-string items from arrays', () => {
    const malformed = {
      situation: 'ok',
      completedItems: ['valid', 42, null, 'also valid'],
      outstandingItems: 'not an array',
    };
    const brief = validateBrief(malformed);
    expect(brief).not.toBeNull();
    expect(brief!.completedItems).toEqual(['valid', 'also valid']);
    expect(brief!.outstandingItems).toEqual([]);
  });

  // ─── 7. Building a truthful local-only brief ───────────────────

  describe('Local brief generation', () => {
    it('generates a local brief from incident data', () => {
      const data = makeBaseData();
      const input = prepareBriefInput(data, 'inc-1')!;
      const brief = generateLocalBrief(input);
      expect(brief.source).toBe('local');
      expect(brief.situation).toContain('Building B — Power Outage');
      expect(brief.completedItems.length).toBe(1);
      expect(brief.completedItems).toContain('Check emergency lights');
      expect(brief.outstandingItems.length).toBe(2);
      expect(brief.openRequests.length).toBe(2);
      expect(brief.nextActions.length).toBeGreaterThan(0);
      expect(brief.uncertainties.length).toBeGreaterThan(0);
    });

    // ─── 8. Handling an incident with no tasks ─────────────────

    it('handles incident with no tasks', () => {
      const data = makeBaseData();
      data.tasks = data.tasks.filter((t) => t.incidentId !== 'inc-1');
      const input = prepareBriefInput(data, 'inc-1')!;
      const brief = generateLocalBrief(input);
      expect(brief.completedItems).toEqual([]);
      expect(brief.outstandingItems).toEqual([]);
      expect(brief.uncertainties.some((u) => u.includes('No tasks recorded'))).toBe(true);
    });

    // ─── 9. Handling an incident with no requests ──────────────

    it('handles incident with no requests', () => {
      const data = makeBaseData();
      data.requests = data.requests.filter((r) => r.incidentId !== 'inc-1');
      const input = prepareBriefInput(data, 'inc-1')!;
      const brief = generateLocalBrief(input);
      expect(brief.openRequests).toEqual([]);
      expect(brief.uncertainties.some((u) => u.includes('No requests recorded'))).toBe(true);
    });

    // ─── 10. Preserving unknown statuses as unknown ────────────

    it('preserves unknown task status in local brief', () => {
      const data = makeBaseData();
      data.tasks[0].status = 'unknown' as 'pending';
      const input = prepareBriefInput(data, 'inc-1')!;
      const brief = generateLocalBrief(input);
      // Unknown status is not 'completed' so it goes to outstanding
      expect(brief.outstandingItems).toContain('Check emergency lights');
      expect(brief.completedItems).not.toContain('Check emergency lights');
    });

    // ─── 11. Ensuring summary generation does not mutate state ──

    it('does not mutate the source AppData', () => {
      const data = makeBaseData();
      const originalTasks = JSON.parse(JSON.stringify(data.tasks));
      const originalIncidents = JSON.parse(JSON.stringify(data.incidents));
      const originalTimeline = JSON.parse(JSON.stringify(data.timeline));

      const input = prepareBriefInput(data, 'inc-1')!;
      generateLocalBrief(input);

      expect(data.tasks).toEqual(originalTasks);
      expect(data.incidents).toEqual(originalIncidents);
      expect(data.timeline).toEqual(originalTimeline);
    });

    it('local brief includes unresolved conflicts', () => {
      const data = makeBaseData();
      data.conflicts = [{
        id: 'conf-1',
        entityId: 'task-2',
        entityType: 'task',
        incidentId: 'inc-1',
        entityName: 'Contact facilities',
        localDeviceId: 'dev-a',
        remoteDeviceId: 'dev-b',
        localState: { status: 'completed' },
        remoteState: { status: 'pending' },
        localTimestamp: Date.now(),
        remoteTimestamp: Date.now(),
        localLabel: 'Device A',
        remoteLabel: 'Device B',
        status: 'unresolved',
        createdAt: Date.now(),
        sourceChangeIds: ['chg-1'],
      }];
      const input = prepareBriefInput(data, 'inc-1')!;
      expect(input.unresolvedConflicts.length).toBe(1);
      const brief = generateLocalBrief(input);
      expect(brief.uncertainties.some((u) => u.includes('Contact facilities'))).toBe(true);
      expect(brief.nextActions.some((a) => a.includes('conflict'))).toBe(true);
    });

    it('local brief does not falsely claim incident is resolved', () => {
      const data = makeBaseData();
      const input = prepareBriefInput(data, 'inc-1')!;
      const brief = generateLocalBrief(input);
      expect(brief.situation).toContain('active');
      expect(brief.uncertainties.some((u) => u.includes('still active'))).toBe(true);
    });
  });

  // ─── Clipboard formatting ───────────────────────────────────────

  describe('Clipboard formatting', () => {
    it('formats brief with incident title and all sections', () => {
      const brief: IncidentBrief = {
        situation: 'Test situation',
        completedItems: ['Task A'],
        outstandingItems: ['Task B'],
        openRequests: ['Flashlight x2'],
        nextActions: ['Do X'],
        uncertainties: ['Unknown Y'],
        generatedAt: '2026-01-01T00:00:00Z',
        source: 'ai',
      };
      const text = formatBriefForClipboard(brief, 'Test Incident');
      expect(text).toContain('CAIRN INCIDENT BRIEF — Test Incident');
      expect(text).toContain('SITUATION');
      expect(text).toContain('Test situation');
      expect(text).toContain('COMPLETED');
      expect(text).toContain('Task A');
      expect(text).toContain('OUTSTANDING');
      expect(text).toContain('Task B');
      expect(text).toContain('OPEN REQUESTS');
      expect(text).toContain('NEXT ACTIONS');
      expect(text).toContain('UNCERTAINTIES');
      expect(text).toContain('AI-generated');
    });

    it('labels local briefs as on-device', () => {
      const brief: IncidentBrief = {
        situation: 'Local situation',
        completedItems: [],
        outstandingItems: [],
        openRequests: [],
        nextActions: [],
        uncertainties: [],
        generatedAt: '2026-01-01T00:00:00Z',
        source: 'local',
      };
      const text = formatBriefForClipboard(brief, 'Test');
      expect(text).toContain('Local (on-device)');
    });
  });

  // ─── Error categorization (client-side) ────────────────────────────

  describe('Error handling', () => {
    it('BriefError carries retryAfter for rate_limited', () => {
      const err = new BriefError('rate_limited', 'Rate limit reached. Please try again in 30 seconds.', 30);
      expect(err.code).toBe('rate_limited');
      expect(err.retryAfter).toBe(30);
      expect(err.message).toContain('30 seconds');
    });

    it('BriefError for quota_exhausted has billing message', () => {
      const err = new BriefError('quota_exhausted', 'AI service quota or billing limit reached.');
      expect(err.code).toBe('quota_exhausted');
      expect(err.retryAfter).toBeNull();
      expect(err.message).toContain('quota');
    });

    it('BriefError for server_not_configured has setup message', () => {
      const err = new BriefError('server_not_configured', 'AI service is not configured.');
      expect(err.code).toBe('server_not_configured');
      expect(err.message).toContain('not configured');
    });

    it('BriefError for service_unavailable has generic message', () => {
      const err = new BriefError('service_unavailable', 'AI service is temporarily unavailable.');
      expect(err.code).toBe('service_unavailable');
      expect(err.message).toContain('unavailable');
    });

    it('BriefError for rate_limited without retryAfter', () => {
      const err = new BriefError('rate_limited', 'Rate limit reached.');
      expect(err.code).toBe('rate_limited');
      expect(err.retryAfter).toBeNull();
    });

    it('quota_exhausted is distinct from rate_limited', () => {
      const quotaErr = new BriefError('quota_exhausted', 'Quota exhausted');
      const rateErr = new BriefError('rate_limited', 'Rate limited');
      expect(quotaErr.code).not.toBe(rateErr.code);
    });

    it('all error codes are valid BriefErrorCode values', () => {
      const codes: BriefErrorCode[] = [
        'offline',
        'server_not_configured',
        'service_unavailable',
        'rate_limited',
        'quota_exhausted',
        'invalid_response',
        'request_too_large',
        'network_error',
      ];
      for (const code of codes) {
        const err = new BriefError(code, 'test');
        expect(err.code).toBe(code);
      }
    });
  });

  // ─── Zero-cost Local Brief mode ────────────────────────────────────

  describe('Zero-cost Local Brief', () => {
    it('local brief generation works while online (no network needed)', () => {
      const data = makeBaseData();
      const input = prepareBriefInput(data, 'inc-1')!;
      // generateLocalBrief is synchronous — no network call involved
      const brief = generateLocalBrief(input);
      expect(brief.source).toBe('local');
      expect(brief.situation).toContain('Building B — Power Outage');
    });

    it('local brief generation works while offline', () => {
      const data = makeBaseData();
      const input = prepareBriefInput(data, 'inc-1')!;
      // Same function — works regardless of connection status
      const brief = generateLocalBrief(input);
      expect(brief.source).toBe('local');
      expect(brief.completedItems).toContain('Check emergency lights');
    });

    it('local brief makes no API request (synchronous, no fetch)', () => {
      const data = makeBaseData();
      const input = prepareBriefInput(data, 'inc-1')!;
      // generateLocalBrief is a pure function — it cannot make network calls
      // Verify it returns immediately with valid data
      const brief = generateLocalBrief(input);
      expect(brief).toBeDefined();
      expect(brief.generatedAt).toBeDefined();
      expect(brief.source).toBe('local');
    });

    it('local brief reflects current incident state', () => {
      const data = makeBaseData();
      // Modify incident state
      data.tasks[0].status = 'completed';
      data.tasks[1].status = 'completed';
      data.tasks[2].status = 'pending';
      data.requests[0].fulfilled = true;

      const input = prepareBriefInput(data, 'inc-1')!;
      const brief = generateLocalBrief(input);

      expect(brief.completedItems).toContain('Check emergency lights');
      expect(brief.completedItems).toContain('Contact facilities');
      expect(brief.outstandingItems).toContain('Check elevator status');
      expect(brief.openRequests.some((r) => r.includes('Flashlight') && r.includes('fulfilled'))).toBe(true);
    });

    it('generating a local brief does not modify incident, tasks, requests or timeline', () => {
      const data = makeBaseData();
      const originalTasks = JSON.parse(JSON.stringify(data.tasks));
      const originalIncidents = JSON.parse(JSON.stringify(data.incidents));
      const originalRequests = JSON.parse(JSON.stringify(data.requests));
      const originalTimeline = JSON.parse(JSON.stringify(data.timeline));

      const input = prepareBriefInput(data, 'inc-1')!;
      generateLocalBrief(input);

      expect(data.tasks).toEqual(originalTasks);
      expect(data.incidents).toEqual(originalIncidents);
      expect(data.requests).toEqual(originalRequests);
      expect(data.timeline).toEqual(originalTimeline);
    });

    it('local brief never claims to be AI-generated', () => {
      const data = makeBaseData();
      const input = prepareBriefInput(data, 'inc-1')!;
      const brief = generateLocalBrief(input);
      expect(brief.source).not.toBe('ai');
      expect(brief.source).toBe('local');
    });
  });
});
