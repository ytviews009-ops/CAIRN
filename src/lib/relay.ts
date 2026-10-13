import type {
  AppData,
  RelayPayload,
  RelayChange,
  ChangeType,
  Incident,
  Task,
  Request,
  TimelineEntry,
  ImportResult,
} from '@/types';
import { RELAY_VERSION } from '@/types';
import { detectConflicts, markTasksConflicting } from '@/lib/conflict';

// ─── Device ID ───────────────────────────────────────────────────────

export function generateDeviceId(): string {
  return 'dev-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem('cairn-device-id');
    if (!id) {
      id = generateDeviceId();
      localStorage.setItem('cairn-device-id', id);
    }
    return id;
  } catch {
    return generateDeviceId();
  }
}

// ─── ID generation ───────────────────────────────────────────────────

export function generateId(prefix: string): string {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export function generateRelayId(): string {
  return 'rly-' + Math.random().toString(36).slice(2, 8);
}

// ─── Integrity hash (Web Crypto SHA-256) ─────────────────────────────

export async function computeHash(payload: Omit<RelayPayload, 'hash'>): Promise<string> {
  const data = JSON.stringify(payload);
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  const arr = Array.from(new Uint8Array(buffer));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ─── Transport encoding (compressed QR) ──────────────────────────────

export const TRANSPORT_PREFIX = 'CAIRN:GZ1:';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function hasCompressionStream(): boolean {
  return typeof CompressionStream !== 'undefined';
}

export async function encodeForTransport(payload: RelayPayload): Promise<{ encoded: string; compressed: boolean; byteSize: number }> {
  const json = JSON.stringify(payload);
  const rawBytes = new TextEncoder().encode(json);

  if (!hasCompressionStream()) {
    return { encoded: json, compressed: false, byteSize: rawBytes.length };
  }

  try {
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(rawBytes);
    writer.close();

    const reader = cs.readable.getReader();
    const chunks: Uint8Array[] = [];
    let totalLen = 0;
    // Read all chunks
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        totalLen += value.length;
      }
    }

    const compressed = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
      compressed.set(chunk, offset);
      offset += chunk.length;
    }

    const b64 = bytesToBase64(compressed);
    const encoded = TRANSPORT_PREFIX + b64;
    return { encoded, compressed: true, byteSize: encoded.length };
  } catch {
    return { encoded: json, compressed: false, byteSize: rawBytes.length };
  }
}

export async function decodeTransport(raw: string): Promise<{ json: string | null; error: ValidationError | null }> {
  if (!raw || !raw.trim()) return { json: null, error: 'EMPTY_PAYLOAD' };

  // Old uncompressed JSON — pass through
  if (!raw.startsWith(TRANSPORT_PREFIX)) {
    return { json: raw, error: null };
  }

  const b64 = raw.slice(TRANSPORT_PREFIX.length);
  if (!b64) return { json: null, error: 'INVALID_JSON' };

  if (!hasCompressionStream()) {
    return { json: null, error: 'INVALID_JSON' };
  }

  try {
    const compressed = base64ToBytes(b64);
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(compressed);
    writer.close();

    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    let totalLen = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        totalLen += value.length;
      }
    }

    const decompressed = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
      decompressed.set(chunk, offset);
      offset += chunk.length;
    }

    const json = new TextDecoder().decode(decompressed);
    return { json, error: null };
  } catch {
    return { json: null, error: 'INVALID_JSON' };
  }
}

// ─── Unified transport-aware validation ──────────────────────────────

export async function validateTransport(raw: string): Promise<ValidationResult> {
  const { json, error } = await decodeTransport(raw);
  if (error || !json) {
    return { ok: false, error: error ?? 'INVALID_JSON' };
  }
  return validatePayload(json);
}

// ─── Payload creation ───────────────────────────────────────────────

export async function createRelayPayload(
  data: AppData,
  incidentId: string,
  deviceOverride?: string
): Promise<RelayPayload | null> {
  const incident = data.incidents.find((i) => i.id === incidentId);
  if (!incident) return null;

  const tasks = data.tasks.filter((t) => t.incidentId === incidentId);
  const requests = data.requests.filter((r) => r.incidentId === incidentId);
  const timeline = data.timeline
    .filter((t) => t.incidentId === incidentId)
    .sort((a, b) => a.createdAt - b.createdAt);

  const changes: RelayChange[] = [];

  // INCIDENT_CREATED
  changes.push({
    changeId: generateId('chg'),
    type: 'INCIDENT_CREATED',
    entityId: incident.id,
    incidentId: incident.id,
    timestamp: incident.createdAt,
    payload: {
      title: incident.title,
      location: incident.location,
      status: incident.status,
      members: incident.members,
    },
  });

  // TASK_CREATED for each task
  for (const task of tasks) {
    changes.push({
      changeId: generateId('chg'),
      type: 'TASK_CREATED',
      entityId: task.id,
      incidentId: incident.id,
      timestamp: task.createdAt,
      payload: {
        title: task.title,
        status: task.status,
        completedAt: task.completedAt,
      },
    });

    if (task.status === 'completed' && task.completedAt) {
      changes.push({
        changeId: generateId('chg'),
        type: 'TASK_COMPLETED',
        entityId: task.id,
        incidentId: incident.id,
        timestamp: task.completedAt,
        payload: {},
      });
    }
  }

  // REQUEST_CREATED for each request
  for (const req of requests) {
    changes.push({
      changeId: generateId('chg'),
      type: 'REQUEST_CREATED',
      entityId: req.id,
      incidentId: incident.id,
      timestamp: req.createdAt,
      payload: {
        title: req.title,
        quantity: req.quantity,
        fulfilled: req.fulfilled,
      },
    });
  }

  // TIMELINE_EVENT for each timeline entry
  for (const entry of timeline) {
    changes.push({
      changeId: generateId('chg'),
      type: 'TIMELINE_EVENT',
      entityId: entry.id,
      incidentId: incident.id,
      timestamp: entry.createdAt,
      payload: {
        message: entry.message,
        kind: entry.kind,
      },
    });
  }

  const deviceId = deviceOverride ?? data.deviceId ?? getOrCreateDeviceId();

  const partial = {
    version: RELAY_VERSION,
    relayId: generateRelayId(),
    createdAt: new Date().toISOString(),
    sourceDeviceId: deviceId,
    incidentId: incident.id,
    incidentTitle: incident.title,
    changes,
  };

  const hash = await computeHash(partial);
  return { ...partial, hash };
}

// ─── Payload validation ──────────────────────────────────────────────

export type ValidationError =
  | 'EMPTY_PAYLOAD'
  | 'INVALID_JSON'
  | 'UNSUPPORTED_VERSION'
  | 'MISSING_FIELD'
  | 'INVALID_CHANGES'
  | 'HASH_MISMATCH'
  | 'NO_CHANGES';

export interface ValidationResult {
  ok: boolean;
  error?: ValidationError;
  payload?: RelayPayload;
}

const VALID_CHANGE_TYPES: ChangeType[] = [
  'INCIDENT_CREATED',
  'TASK_CREATED',
  'TASK_COMPLETED',
  'TASK_REOPENED',
  'REQUEST_CREATED',
  'REQUEST_MODIFIED',
  'TIMELINE_EVENT',
];

export async function validatePayload(raw: string): Promise<ValidationResult> {
  if (!raw || !raw.trim()) return { ok: false, error: 'EMPTY_PAYLOAD' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'INVALID_JSON' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'INVALID_JSON' };
  }

  const p = parsed as Record<string, unknown>;

  if (typeof p.version !== 'number') return { ok: false, error: 'MISSING_FIELD' };
  if (p.version !== RELAY_VERSION) return { ok: false, error: 'UNSUPPORTED_VERSION' };
  if (typeof p.relayId !== 'string' || !p.relayId) return { ok: false, error: 'MISSING_FIELD' };
  if (typeof p.createdAt !== 'string' || !p.createdAt) return { ok: false, error: 'MISSING_FIELD' };
  if (typeof p.sourceDeviceId !== 'string' || !p.sourceDeviceId) return { ok: false, error: 'MISSING_FIELD' };
  if (typeof p.incidentId !== 'string' || !p.incidentId) return { ok: false, error: 'MISSING_FIELD' };
  if (typeof p.incidentTitle !== 'string') return { ok: false, error: 'MISSING_FIELD' };
  if (typeof p.hash !== 'string' || !p.hash) return { ok: false, error: 'MISSING_FIELD' };
  if (!Array.isArray(p.changes)) return { ok: false, error: 'INVALID_CHANGES' };

  for (const c of p.changes) {
    if (typeof c !== 'object' || c === null) return { ok: false, error: 'INVALID_CHANGES' };
    const ch = c as Record<string, unknown>;
    if (typeof ch.changeId !== 'string' || !ch.changeId) return { ok: false, error: 'INVALID_CHANGES' };
    if (typeof ch.type !== 'string' || !VALID_CHANGE_TYPES.includes(ch.type as ChangeType)) {
      return { ok: false, error: 'INVALID_CHANGES' };
    }
    if (typeof ch.entityId !== 'string' || !ch.entityId) return { ok: false, error: 'INVALID_CHANGES' };
    if (typeof ch.incidentId !== 'string' || !ch.incidentId) return { ok: false, error: 'INVALID_CHANGES' };
    if (typeof ch.timestamp !== 'number' || ch.timestamp < 0) return { ok: false, error: 'INVALID_CHANGES' };
    if (typeof ch.payload !== 'object' || ch.payload === null) return { ok: false, error: 'INVALID_CHANGES' };
  }

  if (p.changes.length === 0) return { ok: false, error: 'NO_CHANGES' };

  // Verify hash
  const { hash: _hash, ...rest } = p as Record<string, unknown>;
  const recomputed = await computeHash(rest as unknown as Omit<RelayPayload, 'hash'>);
  if (recomputed !== p.hash) return { ok: false, error: 'HASH_MISMATCH' };

  return { ok: true, payload: p as unknown as RelayPayload };
}

// ─── Deduplication check ──────────────────────────────────────────────

export function checkDuplicates(
  data: AppData,
  payload: RelayPayload
): { allDuplicates: boolean; newChangeIds: string[] } {
  const existing = new Set(data.importedChangeIds ?? []);
  const newChangeIds: string[] = [];
  let allDup = true;

  for (const change of payload.changes) {
    if (!existing.has(change.changeId)) {
      newChangeIds.push(change.changeId);
      allDup = false;
    }
  }

  return { allDuplicates: allDup, newChangeIds };
}

// ─── Merge with conflict detection ───────────────────────────────────

export function mergeRelayPayload(
  data: AppData,
  payload: RelayPayload,
  thisDeviceId?: string
): { data: AppData; result: ImportResult } {
  const existing = new Set(data.importedChangeIds ?? []);
  const newChanges = payload.changes.filter((c) => !existing.has(c.changeId));

  const result: ImportResult = {
    changesImported: 0,
    tasksImported: 0,
    requestsImported: 0,
    timelineImported: 0,
    incidentsImported: 0,
    conflictsDetected: 0,
  };

  if (newChanges.length === 0) {
    return { data, result };
  }

  let incidents = [...data.incidents];
  let tasks = [...data.tasks];
  let requests = [...data.requests];
  let timeline = [...data.timeline];
  const importedChangeIds = [...(data.importedChangeIds ?? [])];
  let conflicts = [...(data.conflicts ?? [])];

  const newChangeIds = newChanges.map((c) => c.changeId);

  for (const change of newChanges) {
    result.changesImported++;
    importedChangeIds.push(change.changeId);

    switch (change.type) {
      case 'INCIDENT_CREATED': {
        if (!incidents.find((i) => i.id === change.entityId)) {
          const inc: Incident = {
            id: change.entityId,
            title: String(change.payload.title ?? 'Unknown Incident'),
            location: String(change.payload.location ?? 'Unknown'),
            status: (change.payload.status as Incident['status']) ?? 'active',
            createdAt: change.timestamp,
            members: Number(change.payload.members ?? 1),
          };
          incidents = [inc, ...incidents];
          result.incidentsImported++;
        }
        break;
      }

      case 'TASK_CREATED': {
        if (!tasks.find((t) => t.id === change.entityId)) {
          const task: Task = {
            id: change.entityId,
            incidentId: change.incidentId,
            title: String(change.payload.title ?? 'Untitled Task'),
            status: (change.payload.status as Task['status']) ?? 'pending',
            createdAt: change.timestamp,
            completedAt: (change.payload.completedAt as number | null) ?? null,
          };
          tasks = [...tasks, task];
          result.tasksImported++;
        }
        break;
      }

      case 'TASK_COMPLETED': {
        const existingTask = tasks.find((t) => t.id === change.entityId);
        if (existingTask) {
          if (existingTask.status === 'pending') {
            // No conflict — just complete it
            tasks = tasks.map((t) =>
              t.id === change.entityId
                ? { ...t, status: 'completed', completedAt: change.timestamp }
                : t
            );
          }
          // If already completed, no-op (same state, no conflict)
        }
        break;
      }

      case 'TASK_REOPENED': {
        const existingTask = tasks.find((t) => t.id === change.entityId);
        if (existingTask && existingTask.status === 'completed') {
          // Will be checked for conflict — don't apply directly
        }
        break;
      }

      case 'REQUEST_CREATED': {
        if (!requests.find((r) => r.id === change.entityId)) {
          const req: Request = {
            id: change.entityId,
            incidentId: change.incidentId,
            title: String(change.payload.title ?? 'Untitled Request'),
            quantity: Number(change.payload.quantity ?? 1),
            fulfilled: Boolean(change.payload.fulfilled),
            createdAt: change.timestamp,
          };
          requests = [...requests, req];
          result.requestsImported++;
        }
        break;
      }

      case 'REQUEST_MODIFIED': {
        // Will be checked for conflict — don't apply directly
        break;
      }

      case 'TIMELINE_EVENT': {
        if (!timeline.find((t) => t.id === change.entityId)) {
          const entry: TimelineEntry = {
            id: change.entityId,
            incidentId: change.incidentId,
            message: String(change.payload.message ?? ''),
            kind: (change.payload.kind as TimelineEntry['kind']) ?? 'info',
            createdAt: change.timestamp,
          };
          timeline = [entry, ...timeline];
          result.timelineImported++;
        }
        break;
      }
    }
  }

  // ─── Conflict detection ─────────────────────────────────────────
  const devId = thisDeviceId ?? data.deviceId ?? 'dev-unknown';
  const newConflicts = detectConflicts(
    { ...data, tasks, requests },
    newChanges,
    payload.sourceDeviceId,
    devId,
    newChangeIds
  );

  if (newConflicts.length > 0) {
    conflicts = [...conflicts, ...newConflicts];
    result.conflictsDetected = newConflicts.length;

    // Add timeline events for conflict detection
    for (const conflict of newConflicts) {
      const tl: TimelineEntry = {
        id: generateId('tl'),
        incidentId: conflict.incidentId,
        message: `Conflict detected for "${conflict.entityName}"`,
        kind: 'conflict',
        createdAt: Date.now(),
      };
      timeline = [tl, ...timeline];
    }
  }

  let mergedData: AppData = {
    ...data,
    incidents,
    tasks,
    requests,
    timeline,
    importedChangeIds,
    conflicts,
  };

  // Mark conflicting tasks/requests
  mergedData = markTasksConflicting(mergedData);

  return { data: mergedData, result };
}

// ─── Demo relay payload (deterministic) ───────────────────────────────

export async function createDemoRelayPayload(deviceId: string): Promise<RelayPayload> {
  const incidentId = 'inc-demo-' + Date.now().toString(36);
  const incidentTitle = 'Building B — Power Outage';
  const baseTime = Date.now() - 42 * 60_000;

  const changes: RelayChange[] = [];

  changes.push({
    changeId: 'demo-chg-1',
    type: 'INCIDENT_CREATED',
    entityId: incidentId,
    incidentId,
    timestamp: baseTime,
    payload: { title: incidentTitle, location: 'Building B, Floor 3', status: 'active', members: 8 },
  });

  changes.push({
    changeId: 'demo-chg-2',
    type: 'TASK_CREATED',
    entityId: 'demo-task-1',
    incidentId,
    timestamp: baseTime + 2 * 60_000,
    payload: { title: 'Check emergency lights', status: 'completed', completedAt: baseTime + 10 * 60_000 },
  });

  changes.push({
    changeId: 'demo-chg-3',
    type: 'TASK_COMPLETED',
    entityId: 'demo-task-1',
    incidentId,
    timestamp: baseTime + 10 * 60_000,
    payload: {},
  });

  changes.push({
    changeId: 'demo-chg-4',
    type: 'TASK_CREATED',
    entityId: 'demo-task-2',
    incidentId,
    timestamp: baseTime + 4 * 60_000,
    payload: { title: 'Contact facilities', status: 'pending', completedAt: null },
  });

  changes.push({
    changeId: 'demo-chg-5',
    type: 'REQUEST_CREATED',
    entityId: 'demo-req-1',
    incidentId,
    timestamp: baseTime + 12 * 60_000,
    payload: { title: 'Flashlight', quantity: 2, fulfilled: false },
  });

  changes.push({
    changeId: 'demo-chg-6',
    type: 'TIMELINE_EVENT',
    entityId: 'demo-tl-1',
    incidentId,
    timestamp: baseTime,
    payload: { message: 'Incident created — Building B, Floor 3', kind: 'system' },
  });

  changes.push({
    changeId: 'demo-chg-7',
    type: 'TIMELINE_EVENT',
    entityId: 'demo-tl-2',
    incidentId,
    timestamp: baseTime + 2 * 60_000,
    payload: { message: 'Task added: Check emergency lights', kind: 'task' },
  });

  const partial = {
    version: RELAY_VERSION,
    relayId: 'demo-rly-001',
    createdAt: new Date().toISOString(),
    sourceDeviceId: deviceId,
    incidentId,
    incidentTitle,
    changes,
  };

  const hash = await computeHash(partial);
  return { ...partial, hash };
}
