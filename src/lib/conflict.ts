import type {
  AppData,
  ConflictRecord,
  ConflictResolution,
  Task,
  Request,
  TimelineEntry,
  RelayChange,
} from '@/types';
import { generateId } from '@/lib/relay';

export function getDeviceLabel(deviceId: string, thisDeviceId: string): string {
  if (deviceId === thisDeviceId) return 'This device';
  const short = deviceId.replace(/^dev-/, '').slice(0, 4).toUpperCase();
  return `Device ${short}`;
}

export function detectConflicts(
  localData: AppData,
  remoteChanges: RelayChange[],
  remoteDeviceId: string,
  thisDeviceId: string,
  newChangeIds: string[]
): ConflictRecord[] {
  const conflicts: ConflictRecord[] = [];
  const alreadyResolved = new Set(localData.resolvedConflictIds ?? []);
  const existingConflictEntityIds = new Set(
    (localData.conflicts ?? []).map((c) => c.entityId)
  );

  // Group remote mutation changes by entityId
  const remoteMutations = remoteChanges.filter(
    (c) =>
      c.type === 'TASK_COMPLETED' ||
      c.type === 'TASK_REOPENED' ||
      c.type === 'REQUEST_MODIFIED'
  );

  for (const remoteChange of remoteMutations) {
    const entityId = remoteChange.entityId;

    // Skip if already resolved for this entity
    if (alreadyResolved.has(entityId)) continue;
    // Skip if conflict already exists for this entity
    if (existingConflictEntityIds.has(entityId)) continue;

    if (remoteChange.type === 'TASK_COMPLETED' || remoteChange.type === 'TASK_REOPENED') {
      const localTask = localData.tasks.find((t) => t.id === entityId);
      if (!localTask) continue;

      const remoteCompleted = remoteChange.type === 'TASK_COMPLETED';
      const localCompleted = localTask.status === 'completed';

      // Conflict: local says incomplete, remote says completed (or vice versa)
      if (localCompleted !== remoteCompleted) {
        conflicts.push({
          id: generateId('conflict'),
          entityId,
          entityType: 'task',
          incidentId: localTask.incidentId,
          entityName: localTask.title,
          localDeviceId: thisDeviceId,
          remoteDeviceId,
          localState: { status: localTask.status, completedAt: localTask.completedAt },
          remoteState: { status: remoteCompleted ? 'completed' : 'pending', completedAt: remoteCompleted ? remoteChange.timestamp : null },
          localTimestamp: localTask.completedAt ?? localTask.createdAt,
          remoteTimestamp: remoteChange.timestamp,
          localLabel: getDeviceLabel(thisDeviceId, thisDeviceId),
          remoteLabel: getDeviceLabel(remoteDeviceId, thisDeviceId),
          status: 'unresolved',
          createdAt: Date.now(),
          sourceChangeIds: newChangeIds,
        });
      }
    }

    if (remoteChange.type === 'REQUEST_MODIFIED') {
      const localReq = localData.requests.find((r) => r.id === entityId);
      if (!localReq) continue;

      const remoteQty = Number(remoteChange.payload.quantity ?? localReq.quantity);
      const remoteFulfilled = Boolean(remoteChange.payload.fulfilled ?? false);

      if (localReq.quantity !== remoteQty || localReq.fulfilled !== remoteFulfilled) {
        conflicts.push({
          id: generateId('conflict'),
          entityId,
          entityType: 'request',
          incidentId: localReq.incidentId,
          entityName: localReq.title,
          localDeviceId: thisDeviceId,
          remoteDeviceId,
          localState: { quantity: localReq.quantity, fulfilled: localReq.fulfilled },
          remoteState: { quantity: remoteQty, fulfilled: remoteFulfilled },
          localTimestamp: localReq.createdAt,
          remoteTimestamp: remoteChange.timestamp,
          localLabel: getDeviceLabel(thisDeviceId, thisDeviceId),
          remoteLabel: getDeviceLabel(remoteDeviceId, thisDeviceId),
          status: 'unresolved',
          createdAt: Date.now(),
          sourceChangeIds: newChangeIds,
        });
      }
    }
  }

  return conflicts;
}

export function applyConflictResolution(
  data: AppData,
  conflictId: string,
  resolution: ConflictResolution,
  thisDeviceId: string
): AppData {
  const conflict = (data.conflicts ?? []).find((c) => c.id === conflictId);
  if (!conflict) return data;

  let tasks = [...data.tasks];
  let requests = [...data.requests];
  let timeline = [...data.timeline];
  const conflicts = (data.conflicts ?? []).map((c) =>
    c.id === conflictId
      ? { ...c, status: 'resolved' as const, resolution, resolvedAt: Date.now() }
      : c
  );
  const resolvedConflictIds = [...(data.resolvedConflictIds ?? []), conflict.entityId];

  if (conflict.entityType === 'task') {
    if (resolution === 'keep_local') {
      tasks = tasks.map((t) =>
        t.id === conflict.entityId ? { ...t, conflicting: false } : t
      );
    } else if (resolution === 'keep_remote') {
      const remoteStatus = conflict.remoteState.status as Task['status'];
      const remoteCompletedAt = conflict.remoteState.completedAt as number | null;
      tasks = tasks.map((t) =>
        t.id === conflict.entityId
          ? { ...t, status: remoteStatus, completedAt: remoteCompletedAt, conflicting: false }
          : t
      );
    } else if (resolution === 'keep_both') {
      // Keep local state but mark as reviewed
      tasks = tasks.map((t) =>
        t.id === conflict.entityId ? { ...t, conflicting: false } : t
      );
    }
  }

  if (conflict.entityType === 'request') {
    if (resolution === 'keep_local') {
      requests = requests.map((r) =>
        r.id === conflict.entityId ? { ...r, conflicting: false } : r
      );
    } else if (resolution === 'keep_remote') {
      const remoteQty = Number(conflict.remoteState.quantity);
      const remoteFulfilled = Boolean(conflict.remoteState.fulfilled);
      requests = requests.map((r) =>
        r.id === conflict.entityId
          ? { ...r, quantity: remoteQty, fulfilled: remoteFulfilled, conflicting: false }
          : r
      );
    } else if (resolution === 'keep_both') {
      requests = requests.map((r) =>
        r.id === conflict.entityId ? { ...r, conflicting: false } : r
      );
    }
  }

  const resolvedLabel = getDeviceLabel(thisDeviceId, thisDeviceId);
  const resolutionLabel =
    resolution === 'keep_local'
      ? 'kept local state'
      : resolution === 'keep_remote'
      ? 'kept remote state'
      : 'kept both';

  const tl: TimelineEntry = {
    id: generateId('tl'),
    incidentId: conflict.incidentId,
    message: `${resolvedLabel} resolved conflict → ${resolutionLabel} for "${conflict.entityName}"`,
    kind: 'conflict',
    createdAt: Date.now(),
  };
  timeline = [tl, ...timeline];

  return { ...data, tasks, requests, timeline, conflicts, resolvedConflictIds };
}

export function markTasksConflicting(data: AppData): AppData {
  const conflictEntityIds = new Set((data.conflicts ?? []).filter(c => c.status === 'unresolved').map((c) => c.entityId));
  return {
    ...data,
    tasks: data.tasks.map((t) =>
      conflictEntityIds.has(t.id) ? { ...t, conflicting: true } : { ...t, conflicting: false }
    ),
    requests: data.requests.map((r) =>
      conflictEntityIds.has(r.id) ? { ...r, conflicting: true } : { ...r, conflicting: false }
    ),
  };
}

export function getUnresolvedConflicts(data: AppData): ConflictRecord[] {
  return (data.conflicts ?? []).filter((c) => c.status === 'unresolved');
}

// ─── Conflict demo payload ────────────────────────────────────────────

export function createConflictDemoChanges(
  incidentId: string,
  deviceId: string,
  taskId: string,
  taskTitle: string,
  baseTime: number
): RelayChange[] {
  return [
    {
      changeId: 'conflict-demo-reop-' + taskId,
      type: 'TASK_REOPENED',
      entityId: taskId,
      incidentId,
      timestamp: baseTime + 10000,
      payload: {},
    },
    {
      changeId: 'conflict-demo-tl-' + taskId,
      type: 'TIMELINE_EVENT',
      entityId: 'conflict-demo-tl-' + taskId,
      incidentId,
      timestamp: baseTime + 10000,
      payload: { message: `Task reopened: ${taskTitle}`, kind: 'task' },
    },
  ];
}

export async function createConflictDemoPayload(
  incidentId: string,
  incidentTitle: string,
  deviceId: string,
  taskId: string,
  taskTitle: string
): Promise<import('@/types').RelayPayload> {
  const { computeHash, generateRelayId } = await import('@/lib/relay');
  const baseTime = Date.now() - 5000;
  const changes = createConflictDemoChanges(incidentId, deviceId, taskId, taskTitle, baseTime);

  const partial = {
    version: 1,
    relayId: generateRelayId(),
    createdAt: new Date().toISOString(),
    sourceDeviceId: deviceId,
    incidentId,
    incidentTitle,
    changes,
  };

  const hash = await computeHash(partial);
  return { ...partial, hash };
}
