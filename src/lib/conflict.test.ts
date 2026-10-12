import { describe, it, expect } from 'vitest';
import { mergeRelayPayload, computeHash, createDemoRelayPayload, checkDuplicates } from '@/lib/relay';
import { detectConflicts, applyConflictResolution, getUnresolvedConflicts, markTasksConflicting, getDeviceLabel, createConflictDemoChanges } from '@/lib/conflict';
import { getSeedData } from '@/lib/seed';
import type { AppData, RelayPayload, RelayChange, ConflictResolution } from '@/types';
import { RELAY_VERSION } from '@/types';

const THIS_DEVICE = 'dev-thistest';
const REMOTE_DEVICE = 'dev-remotetest';

function makeBaseData(): AppData {
  const data = getSeedData();
  data.deviceId = THIS_DEVICE;
  data.conflicts = [];
  data.resolvedConflictIds = [];
  return data;
}

async function makePayload(
  sourceDeviceId: string,
  incidentId: string,
  incidentTitle: string,
  changes: RelayChange[]
): Promise<RelayPayload> {
  const partial = {
    version: RELAY_VERSION,
    relayId: 'rly-test-' + Math.random().toString(36).slice(2, 6),
    createdAt: new Date().toISOString(),
    sourceDeviceId,
    incidentId,
    incidentTitle,
    changes,
  };
  const hash = await computeHash(partial);
  return { ...partial, hash };
}

const taskCompletedChange = (taskId: string, incidentId: string, ts: number): RelayChange => ({
  changeId: 'chg-comp-' + taskId,
  type: 'TASK_COMPLETED',
  entityId: taskId,
  incidentId,
  timestamp: ts,
  payload: {},
});

const taskReopenedChange = (taskId: string, incidentId: string, ts: number): RelayChange => ({
  changeId: 'chg-reop-' + taskId,
  type: 'TASK_REOPENED',
  entityId: taskId,
  incidentId,
  timestamp: ts,
  payload: {},
});

const requestModifiedChange = (
  reqId: string,
  incidentId: string,
  ts: number,
  qty: number,
  fulfilled: boolean
): RelayChange => ({
  changeId: 'chg-mod-' + reqId,
  type: 'REQUEST_MODIFIED',
  entityId: reqId,
  incidentId,
  timestamp: ts,
  payload: { quantity: qty, fulfilled },
});

const timelineChange = (id: string, incidentId: string, ts: number, msg: string): RelayChange => ({
  changeId: 'chg-tl-' + id,
  type: 'TIMELINE_EVENT',
  entityId: id,
  incidentId,
  timestamp: ts,
  payload: { message: msg, kind: 'task' },
});

// ─── 1. Independent changes merge successfully ────────────────────

describe('Conflict-aware merge', () => {
  it('independent changes merge without conflict', async () => {
    const data = makeBaseData();
    const newTaskChange: RelayChange = {
      changeId: 'chg-new-task-ind',
      type: 'TASK_CREATED',
      entityId: 'task-ind-1',
      incidentId: 'inc-1',
      timestamp: Date.now(),
      payload: { title: 'Independent task', status: 'pending', completedAt: null },
    };
    const payload = await makePayload(REMOTE_DEVICE, 'inc-1', 'Building B — Power Outage', [newTaskChange]);
    const { data: merged, result } = mergeRelayPayload(data, payload, THIS_DEVICE);
    expect(result.conflictsDetected).toBe(0);
    expect(merged.tasks.some((t) => t.id === 'task-ind-1')).toBe(true);
  });

  // ─── 2. Duplicate changes are ignored ──────────────────────────

  it('duplicate changes are ignored', async () => {
    const data = makeBaseData();
    const changes: RelayChange[] = [
      { changeId: 'dup-chg-1', type: 'TASK_CREATED', entityId: 'dup-task-1', incidentId: 'inc-1', timestamp: Date.now(), payload: { title: 'Dup task', status: 'pending', completedAt: null } },
    ];
    const payload = await makePayload(REMOTE_DEVICE, 'inc-1', 'Building B — Power Outage', changes);
    const { data: firstMerge } = mergeRelayPayload(data, payload, THIS_DEVICE);
    const { result: secondResult } = mergeRelayPayload(firstMerge, payload, THIS_DEVICE);
    expect(secondResult.changesImported).toBe(0);
    expect(secondResult.conflictsDetected).toBe(0);
  });

  // ─── 3. Compatible changes do not create conflicts ─────────────

  it('compatible task completion does not create conflict', async () => {
    const data = makeBaseData();
    // task-2 is pending locally, remote says complete it — that's compatible
    const changes = [taskCompletedChange('task-2', 'inc-1', Date.now())];
    const payload = await makePayload(REMOTE_DEVICE, 'inc-1', 'Building B — Power Outage', changes);
    const { data: merged, result } = mergeRelayPayload(data, payload, THIS_DEVICE);
    expect(result.conflictsDetected).toBe(0);
    const task = merged.tasks.find((t) => t.id === 'task-2');
    expect(task!.status).toBe('completed');
  });

  it('already-completed task receiving TASK_COMPLETED is no-op not conflict', async () => {
    const data = makeBaseData();
    // task-1 is already completed, remote also says completed — same state, no conflict
    const changes = [taskCompletedChange('task-1', 'inc-1', Date.now())];
    const payload = await makePayload(REMOTE_DEVICE, 'inc-1', 'Building B — Power Outage', changes);
    const { result } = mergeRelayPayload(data, payload, THIS_DEVICE);
    expect(result.conflictsDetected).toBe(0);
  });

  // ─── 4. Conflicting task updates create one conflict ───────────

  it('conflicting task status creates a conflict', async () => {
    const data = makeBaseData();
    // task-1 is completed locally, remote says TASK_REOPENED (incomplete)
    const changes = [taskReopenedChange('task-1', 'inc-1', Date.now())];
    const payload = await makePayload(REMOTE_DEVICE, 'inc-1', 'Building B — Power Outage', changes);
    const { data: merged, result } = mergeRelayPayload(data, payload, THIS_DEVICE);
    expect(result.conflictsDetected).toBe(1);
    const conflict = merged.conflicts.find((c) => c.entityId === 'task-1');
    expect(conflict).toBeDefined();
    expect(conflict!.status).toBe('unresolved');
    expect(conflict!.entityType).toBe('task');
  });

  // ─── 5. Conflicting request updates create one conflict ────────

  it('conflicting request modification creates a conflict', async () => {
    const data = makeBaseData();
    // req-1 has quantity=2 locally, remote says quantity=5
    const changes = [requestModifiedChange('req-1', 'inc-1', Date.now(), 5, false)];
    const payload = await makePayload(REMOTE_DEVICE, 'inc-1', 'Building B — Power Outage', changes);
    const { data: merged, result } = mergeRelayPayload(data, payload, THIS_DEVICE);
    expect(result.conflictsDetected).toBe(1);
    const conflict = merged.conflicts.find((c) => c.entityId === 'req-1');
    expect(conflict).toBeDefined();
    expect(conflict!.entityType).toBe('request');
  });

  // ─── 6. Conflict survives persistence/reload ───────────────────

  it('conflict persists in AppData conflicts array', async () => {
    const data = makeBaseData();
    const changes = [taskReopenedChange('task-1', 'inc-1', Date.now())];
    const payload = await makePayload(REMOTE_DEVICE, 'inc-1', 'Building B — Power Outage', changes);
    const { data: merged } = mergeRelayPayload(data, payload, THIS_DEVICE);
    // Simulate "reload" — re-read from the merged data
    const reloaded: AppData = JSON.parse(JSON.stringify(merged));
    const unresolved = getUnresolvedConflicts(reloaded);
    expect(unresolved.length).toBe(1);
    expect(unresolved[0].entityId).toBe('task-1');
  });

  // ─── 7. Resolution creates an auditable event ──────────────────

  it('resolution creates a timeline event', async () => {
    const data = makeBaseData();
    const changes = [taskReopenedChange('task-1', 'inc-1', Date.now())];
    const payload = await makePayload(REMOTE_DEVICE, 'inc-1', 'Building B — Power Outage', changes);
    const { data: merged } = mergeRelayPayload(data, payload, THIS_DEVICE);
    const conflict = merged.conflicts.find((c) => c.entityId === 'task-1')!;
    const resolved = applyConflictResolution(merged, conflict.id, 'keep_local', THIS_DEVICE);
    const resolutionTl = resolved.timeline.find(
      (t) => t.kind === 'conflict' && t.message.includes('resolved conflict')
    );
    expect(resolutionTl).toBeDefined();
  });

  // ─── 8. Resolved conflicts do not reappear on replay ───────────

  it('resolved conflict does not reappear when relay is replayed', async () => {
    const data = makeBaseData();
    const changes = [taskReopenedChange('task-1', 'inc-1', Date.now())];
    const payload = await makePayload(REMOTE_DEVICE, 'inc-1', 'Building B — Power Outage', changes);
    const { data: merged } = mergeRelayPayload(data, payload, THIS_DEVICE);
    const conflict = merged.conflicts.find((c) => c.entityId === 'task-1')!;
    const resolved = applyConflictResolution(merged, conflict.id, 'keep_local', THIS_DEVICE);
    // Replay the same relay
    const { data: replayed, result } = mergeRelayPayload(resolved, payload, THIS_DEVICE);
    expect(result.changesImported).toBe(0); // all dup
    expect(result.conflictsDetected).toBe(0);
    const stillUnresolved = getUnresolvedConflicts(replayed);
    expect(stillUnresolved.length).toBe(0);
  });

  // ─── 9. Both original changes remain preserved ──────────────────

  it('both source changes remain in importedChangeIds', async () => {
    const data = makeBaseData();
    const changes = [taskReopenedChange('task-1', 'inc-1', Date.now())];
    const payload = await makePayload(REMOTE_DEVICE, 'inc-1', 'Building B — Power Outage', changes);
    const { data: merged } = mergeRelayPayload(data, payload, THIS_DEVICE);
    expect(merged.importedChangeIds).toContain('chg-reop-task-1');
  });

  it('local tasks are preserved after conflict merge', async () => {
    const data = makeBaseData();
    const originalTaskIds = data.tasks.map((t) => t.id);
    const changes = [taskReopenedChange('task-1', 'inc-1', Date.now())];
    const payload = await makePayload(REMOTE_DEVICE, 'inc-1', 'Building B — Power Outage', changes);
    const { data: merged } = mergeRelayPayload(data, payload, THIS_DEVICE);
    for (const id of originalTaskIds) {
      expect(merged.tasks.some((t) => t.id === id)).toBe(true);
    }
  });

  // ─── 10. Resolved task state matches user's choice ──────────────

  it('keep_remote resolution applies remote state to task', async () => {
    const data = makeBaseData();
    const changes = [taskReopenedChange('task-1', 'inc-1', Date.now())];
    const payload = await makePayload(REMOTE_DEVICE, 'inc-1', 'Building B — Power Outage', changes);
    const { data: merged } = mergeRelayPayload(data, payload, THIS_DEVICE);
    const conflict = merged.conflicts.find((c) => c.entityId === 'task-1')!;
    const resolved = applyConflictResolution(merged, conflict.id, 'keep_remote', THIS_DEVICE);
    const task = resolved.tasks.find((t) => t.id === 'task-1')!;
    expect(task.status).toBe('pending');
    expect(task.conflicting).toBe(false);
  });

  it('keep_local resolution preserves local task state', async () => {
    const data = makeBaseData();
    const changes = [taskReopenedChange('task-1', 'inc-1', Date.now())];
    const payload = await makePayload(REMOTE_DEVICE, 'inc-1', 'Building B — Power Outage', changes);
    const { data: merged } = mergeRelayPayload(data, payload, THIS_DEVICE);
    const conflict = merged.conflicts.find((c) => c.entityId === 'task-1')!;
    const resolved = applyConflictResolution(merged, conflict.id, 'keep_local', THIS_DEVICE);
    const task = resolved.tasks.find((t) => t.id === 'task-1')!;
    expect(task.status).toBe('completed');
    expect(task.conflicting).toBe(false);
  });

  it('keep_remote resolution applies remote state to request', async () => {
    const data = makeBaseData();
    const changes = [requestModifiedChange('req-1', 'inc-1', Date.now(), 5, true)];
    const payload = await makePayload(REMOTE_DEVICE, 'inc-1', 'Building B — Power Outage', changes);
    const { data: merged } = mergeRelayPayload(data, payload, THIS_DEVICE);
    const conflict = merged.conflicts.find((c) => c.entityId === 'req-1')!;
    const resolved = applyConflictResolution(merged, conflict.id, 'keep_remote', THIS_DEVICE);
    const req = resolved.requests.find((r) => r.id === 'req-1')!;
    expect(req.quantity).toBe(5);
    expect(req.fulfilled).toBe(true);
  });

  // ─── 11. Conflict detection appears in timeline ────────────────

  it('conflict detection creates a timeline event', async () => {
    const data = makeBaseData();
    const changes = [taskReopenedChange('task-1', 'inc-1', Date.now())];
    const payload = await makePayload(REMOTE_DEVICE, 'inc-1', 'Building B — Power Outage', changes);
    const { data: merged } = mergeRelayPayload(data, payload, THIS_DEVICE);
    const detectTl = merged.timeline.find(
      (t) => t.kind === 'conflict' && t.message.includes('Conflict detected')
    );
    expect(detectTl).toBeDefined();
  });

  // ─── 12. Conflict resolution appears in timeline ───────────────

  it('conflict resolution creates a timeline event', async () => {
    const data = makeBaseData();
    const changes = [taskReopenedChange('task-1', 'inc-1', Date.now())];
    const payload = await makePayload(REMOTE_DEVICE, 'inc-1', 'Building B — Power Outage', changes);
    const { data: merged } = mergeRelayPayload(data, payload, THIS_DEVICE);
    const conflict = merged.conflicts.find((c) => c.entityId === 'task-1')!;
    const resolved = applyConflictResolution(merged, conflict.id, 'keep_both', THIS_DEVICE);
    const resolveTl = resolved.timeline.find(
      (t) => t.kind === 'conflict' && t.message.includes('resolved conflict')
    );
    expect(resolveTl).toBeDefined();
  });

  // ─── 13. Replaying relay does not duplicate timeline events ─────

  it('replaying relay does not duplicate timeline entries', async () => {
    const data = makeBaseData();
    const changes = [
      taskCompletedChange('task-2', 'inc-1', Date.now()),
      timelineChange('tl-test-unique', 'inc-1', Date.now(), 'Test timeline event'),
    ];
    const payload = await makePayload(REMOTE_DEVICE, 'inc-1', 'Building B — Power Outage', changes);
    const { data: firstMerge } = mergeRelayPayload(data, payload, THIS_DEVICE);
    const firstTlCount = firstMerge.timeline.length;
    const { data: secondMerge } = mergeRelayPayload(firstMerge, payload, THIS_DEVICE);
    expect(secondMerge.timeline.length).toBe(firstTlCount);
  });

  // ─── 14. Repeatedly running demo does not accumulate duplicates ──

  it('repeated demo import does not accumulate duplicates', async () => {
    const data = makeBaseData();
    const payload = await createDemoRelayPayload(REMOTE_DEVICE);
    const { data: firstMerge } = mergeRelayPayload(data, payload, THIS_DEVICE);
    const firstTaskCount = firstMerge.tasks.length;
    const firstConflictCount = firstMerge.conflicts.length;
    const { data: secondMerge } = mergeRelayPayload(firstMerge, payload, THIS_DEVICE);
    expect(secondMerge.tasks.length).toBe(firstTaskCount);
    expect(secondMerge.conflicts.length).toBe(firstConflictCount);
  });

  // ─── markTasksConflicting ───────────────────────────────────────

  it('markTasksConflicting flags unresolved conflict entities', async () => {
    const data = makeBaseData();
    const changes = [taskReopenedChange('task-1', 'inc-1', Date.now())];
    const payload = await makePayload(REMOTE_DEVICE, 'inc-1', 'Building B — Power Outage', changes);
    const { data: merged } = mergeRelayPayload(data, payload, THIS_DEVICE);
    const task = merged.tasks.find((t) => t.id === 'task-1');
    expect(task!.conflicting).toBe(true);
    const otherTask = merged.tasks.find((t) => t.id === 'task-2');
    expect(otherTask!.conflicting).toBe(false);
  });

  // ─── Device label ──────────────────────────────────────────────

  it('getDeviceLabel returns "This device" for own device', () => {
    expect(getDeviceLabel(THIS_DEVICE, THIS_DEVICE)).toBe('This device');
  });

  it('getDeviceLabel returns compact label for remote device', () => {
    const label = getDeviceLabel(REMOTE_DEVICE, THIS_DEVICE);
    expect(label).toMatch(/^Device /);
  });

  // ─── Deterministic merge ────────────────────────────────────────

  it('same inputs always produce same merge result', async () => {
    const data1 = makeBaseData();
    const data2 = makeBaseData();
    const changes = [taskCompletedChange('task-2', 'inc-1', 1234567890)];
    const payload1 = await makePayload(REMOTE_DEVICE, 'inc-1', 'Building B — Power Outage', changes);
    const payload2 = await makePayload(REMOTE_DEVICE, 'inc-1', 'Building B — Power Outage', changes);
    const { data: merged1 } = mergeRelayPayload(data1, payload1, THIS_DEVICE);
    const { data: merged2 } = mergeRelayPayload(data2, payload2, THIS_DEVICE);
    expect(merged1.tasks.find((t) => t.id === 'task-2')!.status).toBe(merged2.tasks.find((t) => t.id === 'task-2')!.status);
    expect(merged1.conflicts.length).toBe(merged2.conflicts.length);
  });

  // ─── Full conflict scenario: detect → resolve → replay ──────────

  it('full scenario: local completes task, remote reopens, conflict detected and resolved', async () => {
    // Setup: task-3 is pending locally
    const data = makeBaseData();
    // Local device completes task-3
    let localData: AppData = {
      ...data,
      tasks: data.tasks.map((t) =>
        t.id === 'task-3' ? { ...t, status: 'completed', completedAt: Date.now() - 1000 } : t
      ),
    };

    // Remote sends TASK_REOPENED for task-3
    const changes = [taskReopenedChange('task-3', 'inc-1', Date.now())];
    const payload = await makePayload(REMOTE_DEVICE, 'inc-1', 'Building B — Power Outage', changes);

    // Merge — should detect conflict
    const { data: merged, result } = mergeRelayPayload(localData, payload, THIS_DEVICE);
    expect(result.conflictsDetected).toBe(1);
    const conflict = merged.conflicts.find((c) => c.entityId === 'task-3')!;
    expect(conflict.localState.status).toBe('completed');
    expect(conflict.remoteState.status).toBe('pending');

    // Resolve: keep local (completed)
    const resolved = applyConflictResolution(merged, conflict.id, 'keep_local', THIS_DEVICE);
    const task = resolved.tasks.find((t) => t.id === 'task-3')!;
    expect(task.status).toBe('completed');
    expect(task.conflicting).toBe(false);

    // Replay: no new conflict
    const { result: replayResult } = mergeRelayPayload(resolved, payload, THIS_DEVICE);
    expect(replayResult.conflictsDetected).toBe(0);
    expect(getUnresolvedConflicts(resolved).length).toBe(0);
  });

  // ─── checkDuplicates still works ────────────────────────────────

  it('checkDuplicates identifies all-duplicates correctly', async () => {
    const data = makeBaseData();
    const changes = [taskCompletedChange('task-2', 'inc-1', Date.now())];
    const payload = await makePayload(REMOTE_DEVICE, 'inc-1', 'Building B — Power Outage', changes);
    const { data: merged } = mergeRelayPayload(data, payload, THIS_DEVICE);
    const dupCheck = checkDuplicates(merged, payload);
    expect(dupCheck.allDuplicates).toBe(true);
  });

  // ─── Demo scenario: Device A completes, Device B reopens ────────

  it('demo scenario: Device A completes, Device B reopens → conflict', async () => {
    // Start from shared baseline: task-2 is pending on both devices
    const data = makeBaseData();

    // Device A completes task-2 locally
    let localData: AppData = {
      ...data,
      tasks: data.tasks.map((t) =>
        t.id === 'task-2' ? { ...t, status: 'completed', completedAt: Date.now() - 5000 } : t
      ),
    };

    // Device B sends TASK_REOPENED (keeps it incomplete) — genuine conflict
    const changes = createConflictDemoChanges('inc-1', REMOTE_DEVICE, 'task-2', 'Contact facilities', Date.now() - 10000);
    const payload = await makePayload(REMOTE_DEVICE, 'inc-1', 'Building B — Power Outage', changes);

    // Merge via production logic
    const { data: merged, result } = mergeRelayPayload(localData, payload, THIS_DEVICE);
    expect(result.conflictsDetected).toBe(1);

    const conflict = merged.conflicts.find((c) => c.entityId === 'task-2')!;
    expect(conflict.localState.status).toBe('completed');
    expect(conflict.remoteState.status).toBe('pending');

    // Resolve: keep local (completed)
    const resolved = applyConflictResolution(merged, conflict.id, 'keep_local', THIS_DEVICE);
    const task = resolved.tasks.find((t) => t.id === 'task-2')!;
    expect(task.status).toBe('completed');
    expect(task.conflicting).toBe(false);

    // Both original changes preserved
    expect(resolved.importedChangeIds).toContain('conflict-demo-reop-task-2');

    // Resolution event in timeline
    const resolveTl = resolved.timeline.find(
      (t) => t.kind === 'conflict' && t.message.includes('resolved conflict')
    );
    expect(resolveTl).toBeDefined();

    // No unresolved conflicts remain
    expect(getUnresolvedConflicts(resolved).length).toBe(0);

    // Replay does not recreate conflict
    const { result: replayResult } = mergeRelayPayload(resolved, payload, THIS_DEVICE);
    expect(replayResult.conflictsDetected).toBe(0);
  });

  it('demo scenario: repeated runs do not accumulate duplicates', async () => {
    const data = makeBaseData();
    const changes = createConflictDemoChanges('inc-1', REMOTE_DEVICE, 'task-2', 'Contact facilities', Date.now() - 10000);
    const payload = await makePayload(REMOTE_DEVICE, 'inc-1', 'Building B — Power Outage', changes);

    // First run — local completes task-2, remote reopens
    let localData: AppData = {
      ...data,
      tasks: data.tasks.map((t) =>
        t.id === 'task-2' ? { ...t, status: 'completed', completedAt: Date.now() - 5000 } : t
      ),
    };
    const { data: merged1 } = mergeRelayPayload(localData, payload, THIS_DEVICE);
    const conflict1 = merged1.conflicts.find((c) => c.entityId === 'task-2')!;
    const resolved1 = applyConflictResolution(merged1, conflict1.id, 'keep_local', THIS_DEVICE);

    // Replay same relay — no new conflict, no new tasks, no new timeline entries
    const taskCountBefore = resolved1.tasks.length;
    const conflictCountBefore = resolved1.conflicts.length;
    const tlCountBefore = resolved1.timeline.length;

    const { data: replayed, result: replayResult } = mergeRelayPayload(resolved1, payload, THIS_DEVICE);
    expect(replayResult.changesImported).toBe(0);
    expect(replayResult.conflictsDetected).toBe(0);
    expect(replayed.tasks.length).toBe(taskCountBefore);
    expect(replayed.conflicts.length).toBe(conflictCountBefore);
    expect(replayed.timeline.length).toBe(tlCountBefore);
  });
});
