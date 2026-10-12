import { describe, it, expect, beforeEach } from 'vitest';
import { createRelayPayload, validatePayload, mergeRelayPayload, checkDuplicates, computeHash, createDemoRelayPayload } from '@/lib/relay';
import { getSeedData } from '@/lib/seed';
import type { AppData, RelayPayload, RelayChange } from '@/types';
import { RELAY_VERSION } from '@/types';

function makeSeedData(): AppData {
  return getSeedData();
}

function makeMinimalPayload(overrides: Partial<RelayPayload> = {}): RelayPayload {
  const changes: RelayChange[] = [
    {
      changeId: 'test-chg-1',
      type: 'INCIDENT_CREATED',
      entityId: 'test-inc-1',
      incidentId: 'test-inc-1',
      timestamp: Date.now() - 60000,
      payload: { title: 'Test Incident', location: 'Floor 1', status: 'active', members: 3 },
    },
    {
      changeId: 'test-chg-2',
      type: 'TASK_CREATED',
      entityId: 'test-task-1',
      incidentId: 'test-inc-1',
      timestamp: Date.now() - 50000,
      payload: { title: 'Test Task', status: 'pending', completedAt: null },
    },
    {
      changeId: 'test-chg-3',
      type: 'TIMELINE_EVENT',
      entityId: 'test-tl-1',
      incidentId: 'test-inc-1',
      timestamp: Date.now() - 40000,
      payload: { message: 'Incident created', kind: 'system' },
    },
  ];

  const partial = {
    version: RELAY_VERSION,
    relayId: 'test-rly-001',
    createdAt: new Date().toISOString(),
    sourceDeviceId: 'dev-test001',
    incidentId: 'test-inc-1',
    incidentTitle: 'Test Incident',
    changes,
  };

  return { ...partial, hash: '', ...overrides } as RelayPayload;
}

async function makeValidPayload(overrides: Partial<RelayPayload> = {}): Promise<RelayPayload> {
  const base = makeMinimalPayload(overrides);
  const { hash: _, ...rest } = base;
  const hash = await computeHash(rest);
  return { ...base, hash };
}

describe('Relay payload creation', () => {
  it('creates a valid payload from seed data', async () => {
    const data = makeSeedData();
    const payload = await createRelayPayload(data, 'inc-1', 'dev-test001');
    expect(payload).not.toBeNull();
    expect(payload!.version).toBe(RELAY_VERSION);
    expect(payload!.incidentId).toBe('inc-1');
    expect(payload!.incidentTitle).toBe('Building B — Power Outage');
    expect(payload!.changes.length).toBeGreaterThan(0);
    expect(payload!.hash).toBeTruthy();
    expect(payload!.sourceDeviceId).toBe('dev-test001');
  });

  it('includes INCIDENT_CREATED as first change', async () => {
    const data = makeSeedData();
    const payload = await createRelayPayload(data, 'inc-1', 'dev-test001');
    expect(payload!.changes[0].type).toBe('INCIDENT_CREATED');
  });

  it('includes TASK_COMPLETED for completed tasks', async () => {
    const data = makeSeedData();
    const payload = await createRelayPayload(data, 'inc-1', 'dev-test001');
    const completedChanges = payload!.changes.filter((c) => c.type === 'TASK_COMPLETED');
    expect(completedChanges.length).toBe(1);
    expect(completedChanges[0].entityId).toBe('task-1');
  });

  it('generates unique change IDs', async () => {
    const data = makeSeedData();
    const payload = await createRelayPayload(data, 'inc-1', 'dev-test001');
    const ids = payload!.changes.map((c) => c.changeId);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('returns null for non-existent incident', async () => {
    const data = makeSeedData();
    const payload = await createRelayPayload(data, 'nonexistent', 'dev-test001');
    expect(payload).toBeNull();
  });
});

describe('Relay payload validation', () => {
  it('validates a well-formed payload', async () => {
    const payload = await makeValidPayload();
    const result = await validatePayload(JSON.stringify(payload));
    expect(result.ok).toBe(true);
    expect(result.payload).toBeDefined();
    expect(result.payload!.relayId).toBe('test-rly-001');
  });

  it('rejects empty payload', async () => {
    const result = await validatePayload('');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('EMPTY_PAYLOAD');
  });

  it('rejects invalid JSON', async () => {
    const result = await validatePayload('not json at all');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_JSON');
  });

  it('rejects unsupported version', async () => {
    const payload = await makeValidPayload({ version: 999 });
    const result = await validatePayload(JSON.stringify(payload));
    expect(result.ok).toBe(false);
    expect(result.error).toBe('UNSUPPORTED_VERSION');
  });

  it('rejects missing required fields', async () => {
    const payload = await makeValidPayload();
    const bad = { ...payload, relayId: '' };
    const result = await validatePayload(JSON.stringify(bad));
    expect(result.ok).toBe(false);
    expect(result.error).toBe('MISSING_FIELD');
  });

  it('rejects hash mismatch (corrupted payload)', async () => {
    const payload = await makeValidPayload();
    const bad = { ...payload, hash: 'tampered12345' };
    const result = await validatePayload(JSON.stringify(bad));
    expect(result.ok).toBe(false);
    expect(result.error).toBe('HASH_MISMATCH');
  });

  it('rejects malformed changes array', async () => {
    const payload = await makeValidPayload();
    const bad = { ...payload, changes: 'not-an-array' };
    const result = await validatePayload(JSON.stringify(bad));
    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_CHANGES');
  });

  it('rejects empty changes array', async () => {
    const partial = {
      version: RELAY_VERSION,
      relayId: 'test-rly-002',
      createdAt: new Date().toISOString(),
      sourceDeviceId: 'dev-test001',
      incidentId: 'test-inc-1',
      incidentTitle: 'Test',
      changes: [],
    };
    const hash = await computeHash(partial);
    const payload = { ...partial, hash };
    const result = await validatePayload(JSON.stringify(payload));
    expect(result.ok).toBe(false);
    expect(result.error).toBe('NO_CHANGES');
  });

  it('rejects change with invalid type', async () => {
    const payload = await makeValidPayload();
    const bad = {
      ...payload,
      changes: [
        { ...payload.changes[0], type: 'INVALID_TYPE' as unknown as RelayChange['type'] },
      ],
    };
    // Re-hash won't match but type check comes first... actually hash is checked last
    // Need to recompute hash for the type check to be reached
    const { hash: _, ...rest } = bad;
    const newHash = await computeHash(rest);
    const rehashed = { ...bad, hash: newHash };
    const result = await validatePayload(JSON.stringify(rehashed));
    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_CHANGES');
  });
});

describe('Duplicate detection', () => {
  it('detects all duplicates', async () => {
    const data = makeSeedData();
    data.importedChangeIds = ['test-chg-1', 'test-chg-2', 'test-chg-3'];
    const payload = makeMinimalPayload();
    const result = checkDuplicates(data, payload);
    expect(result.allDuplicates).toBe(true);
    expect(result.newChangeIds.length).toBe(0);
  });

  it('identifies new changes', async () => {
    const data = makeSeedData();
    data.importedChangeIds = ['test-chg-1'];
    const payload = makeMinimalPayload();
    const result = checkDuplicates(data, payload);
    expect(result.allDuplicates).toBe(false);
    expect(result.newChangeIds).toContain('test-chg-2');
    expect(result.newChangeIds).toContain('test-chg-3');
  });
});

describe('Merge behavior', () => {
  it('imports new changes correctly', async () => {
    const data = makeSeedData();
    const originalTaskCount = data.tasks.length;
    const payload = makeMinimalPayload();
    const { data: merged, result } = mergeRelayPayload(data, payload);
    expect(result.changesImported).toBe(3);
    expect(result.incidentsImported).toBe(1);
    expect(result.tasksImported).toBe(1);
    expect(result.timelineImported).toBe(1);
    expect(merged.incidents.length).toBe(data.incidents.length + 1);
    expect(merged.tasks.length).toBe(originalTaskCount + 1);
    expect(merged.timeline.length).toBe(data.timeline.length + 1);
  });

  it('preserves existing local changes', async () => {
    const data = makeSeedData();
    const originalIncidentIds = data.incidents.map((i) => i.id);
    const originalTaskIds = data.tasks.map((t) => t.id);
    const payload = makeMinimalPayload();
    const { data: merged } = mergeRelayPayload(data, payload);
    for (const id of originalIncidentIds) {
      expect(merged.incidents.find((i) => i.id === id)).toBeDefined();
    }
    for (const id of originalTaskIds) {
      expect(merged.tasks.find((t) => t.id === id)).toBeDefined();
    }
  });

  it('does not duplicate on second import', async () => {
    const data = makeSeedData();
    const payload = makeMinimalPayload();
    const { data: firstMerge } = mergeRelayPayload(data, payload);
    const { data: secondMerge, result } = mergeRelayPayload(firstMerge, payload);
    expect(result.changesImported).toBe(0);
    expect(secondMerge.incidents.length).toBe(firstMerge.incidents.length);
    expect(secondMerge.tasks.length).toBe(firstMerge.tasks.length);
  });

  it('propagates task completion', async () => {
    const data = makeSeedData();
    // Add a pending task that the relay will complete
    data.tasks.push({
      id: 'relay-task-1',
      incidentId: 'inc-1',
      title: 'Relay Task',
      status: 'pending',
      createdAt: Date.now() - 10000,
      completedAt: null,
    });

    const changes: RelayChange[] = [
      {
        changeId: 'comp-chg-1',
        type: 'TASK_COMPLETED',
        entityId: 'relay-task-1',
        incidentId: 'inc-1',
        timestamp: Date.now(),
        payload: {},
      },
    ];

    const partial = {
      version: RELAY_VERSION,
      relayId: 'rly-comp-001',
      createdAt: new Date().toISOString(),
      sourceDeviceId: 'dev-other01',
      incidentId: 'inc-1',
      incidentTitle: 'Building B — Power Outage',
      changes,
    };
    const hash = await computeHash(partial);
    const payload: RelayPayload = { ...partial, hash };

    const { data: merged } = mergeRelayPayload(data, payload);
    const task = merged.tasks.find((t) => t.id === 'relay-task-1');
    expect(task!.status).toBe('completed');
    expect(task!.completedAt).toBe(payload.changes[0].timestamp);
  });

  it('imports timeline events', async () => {
    const data = makeSeedData();
    const originalTlCount = data.timeline.length;
    const payload = makeMinimalPayload();
    const { data: merged } = mergeRelayPayload(data, payload);
    expect(merged.timeline.length).toBe(originalTlCount + 1);
    const imported = merged.timeline.find((t) => t.id === 'test-tl-1');
    expect(imported).toBeDefined();
    expect(imported!.message).toBe('Incident created');
  });

  it('imports requests correctly', async () => {
    const data = makeSeedData();
    const changes: RelayChange[] = [
      {
        changeId: 'req-chg-1',
        type: 'REQUEST_CREATED',
        entityId: 'relay-req-1',
        incidentId: 'inc-1',
        timestamp: Date.now(),
        payload: { title: 'Batteries', quantity: 4, fulfilled: false },
      },
    ];
    const partial = {
      version: RELAY_VERSION,
      relayId: 'rly-req-001',
      createdAt: new Date().toISOString(),
      sourceDeviceId: 'dev-other01',
      incidentId: 'inc-1',
      incidentTitle: 'Building B — Power Outage',
      changes,
    };
    const hash = await computeHash(partial);
    const payload: RelayPayload = { ...partial, hash };

    const { data: merged, result } = mergeRelayPayload(data, payload);
    expect(result.requestsImported).toBe(1);
    const req = merged.requests.find((r) => r.id === 'relay-req-1');
    expect(req).toBeDefined();
    expect(req!.title).toBe('Batteries');
    expect(req!.quantity).toBe(4);
  });

  it('never overwrites unrelated incidents', async () => {
    const data = makeSeedData();
    data.incidents.push({
      id: 'inc-other',
      title: 'Other Incident',
      location: 'Elsewhere',
      status: 'active',
      createdAt: Date.now(),
      members: 2,
    });
    data.tasks.push({
      id: 'task-other',
      incidentId: 'inc-other',
      title: 'Other Task',
      status: 'pending',
      createdAt: Date.now(),
      completedAt: null,
    });

    const payload = makeMinimalPayload();
    const { data: merged } = mergeRelayPayload(data, payload);
    const otherInc = merged.incidents.find((i) => i.id === 'inc-other');
    expect(otherInc).toBeDefined();
    expect(otherInc!.title).toBe('Other Incident');
    const otherTask = merged.tasks.find((t) => t.id === 'task-other');
    expect(otherTask).toBeDefined();
    expect(otherTask!.status).toBe('pending');
  });

  it('tracks imported change IDs', async () => {
    const data = makeSeedData();
    const payload = makeMinimalPayload();
    const { data: merged } = mergeRelayPayload(data, payload);
    expect(merged.importedChangeIds).toContain('test-chg-1');
    expect(merged.importedChangeIds).toContain('test-chg-2');
    expect(merged.importedChangeIds).toContain('test-chg-3');
  });
});

describe('Integrity hash', () => {
  it('produces a consistent 64-char hex string', async () => {
    const partial = {
      version: RELAY_VERSION,
      relayId: 'test',
      createdAt: '2024-01-01T00:00:00.000Z',
      sourceDeviceId: 'dev-1',
      incidentId: 'inc-1',
      incidentTitle: 'Test',
      changes: [],
    };
    const hash = await computeHash(partial);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different hashes for different payloads', async () => {
    const base = {
      version: RELAY_VERSION,
      relayId: 'test',
      createdAt: '2024-01-01T00:00:00.000Z',
      sourceDeviceId: 'dev-1',
      incidentId: 'inc-1',
      incidentTitle: 'Test',
      changes: [],
    };
    const hash1 = await computeHash(base);
    const hash2 = await computeHash({ ...base, incidentTitle: 'Different' });
    expect(hash1).not.toBe(hash2);
  });
});

describe('Demo relay payload', () => {
  it('creates a valid demo payload', async () => {
    const payload = await createDemoRelayPayload('dev-demo01');
    expect(payload.version).toBe(RELAY_VERSION);
    expect(payload.incidentTitle).toBe('Building B — Power Outage');
    expect(payload.changes.length).toBe(7);
    expect(payload.sourceDeviceId).toBe('dev-demo01');
    expect(payload.hash).toBeTruthy();

    // Validate it round-trips
    const result = await validatePayload(JSON.stringify(payload));
    expect(result.ok).toBe(true);
  });

  it('demo payload can be imported', async () => {
    const data = makeSeedData();
    const payload = await createDemoRelayPayload('dev-demo01');
    const { result } = mergeRelayPayload(data, payload);
    expect(result.changesImported).toBe(7);
    expect(result.incidentsImported).toBe(1);
    expect(result.tasksImported).toBe(2);
    expect(result.requestsImported).toBe(1);
    expect(result.timelineImported).toBe(2);
  });

  it('demo payload is idempotent on second import', async () => {
    const data = makeSeedData();
    const payload = await createDemoRelayPayload('dev-demo01');
    const { data: firstMerge } = mergeRelayPayload(data, payload);
    const { result: secondResult } = mergeRelayPayload(firstMerge, payload);
    expect(secondResult.changesImported).toBe(0);
  });
});

describe('Offline export/import cycle', () => {
  it('full cycle: create -> validate -> import -> persist', async () => {
    // Device A: create payload from seed data
    const deviceAData = makeSeedData();
    const payload = await createRelayPayload(deviceAData, 'inc-1', 'dev-A001');

    expect(payload).not.toBeNull();

    // Encode as JSON (simulating QR encoding)
    const json = JSON.stringify(payload!);

    // Device B: start with empty-ish data (just device ID)
    const deviceBData: AppData = {
      incidents: [],
      tasks: [],
      requests: [],
      timeline: [],
      pendingChanges: [],
      importedChangeIds: [],
      deviceId: 'dev-B001',
      conflicts: [],
      resolvedConflictIds: [],
    };

    // Validate the received payload
    const validationResult = await validatePayload(json);
    expect(validationResult.ok).toBe(true);
    expect(validationResult.payload).toBeDefined();

    // Import into Device B
    const { data: merged, result } = mergeRelayPayload(deviceBData, validationResult.payload!);

    // Verify all data arrived
    expect(result.incidentsImported).toBe(1);
    expect(result.tasksImported).toBe(3);
    expect(result.requestsImported).toBe(2);
    expect(result.timelineImported).toBe(7);
    expect(merged.incidents[0].title).toBe('Building B — Power Outage');

    // Verify imported change IDs are tracked
    expect(merged.importedChangeIds.length).toBe(payload!.changes.length);

    // Second import should be no-op
    const { result: secondResult } = mergeRelayPayload(merged, validationResult.payload!);
    expect(secondResult.changesImported).toBe(0);
  });
});
