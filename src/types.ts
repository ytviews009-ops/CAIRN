export type ScreenName = 'home' | 'incident' | 'offline' | 'relay' | 'reconnect' | 'conflicts';

export type ConnectionStatus = 'online' | 'offline' | 'syncing' | 'conflicts';

export type TaskStatus = 'pending' | 'completed';

export interface Incident {
  id: string;
  title: string;
  location: string;
  status: 'active' | 'resolved';
  createdAt: number;
  members: number;
}

export interface Task {
  id: string;
  incidentId: string;
  title: string;
  status: TaskStatus;
  createdAt: number;
  completedAt: number | null;
  conflicting?: boolean;
}

export interface Request {
  id: string;
  incidentId: string;
  title: string;
  quantity: number;
  fulfilled: boolean;
  createdAt: number;
  conflicting?: boolean;
}

export interface TimelineEntry {
  id: string;
  incidentId: string;
  message: string;
  kind: 'info' | 'task' | 'request' | 'system' | 'conflict';
  createdAt: number;
}

export interface PendingChange {
  id: string;
  incidentId: string;
  type: 'task' | 'request' | 'timeline';
  summary: string;
  createdAt: number;
}

// ─── Conflict types ──────────────────────────────────────────────────

export type ConflictEntityType = 'task' | 'request';
export type ConflictResolution = 'keep_local' | 'keep_remote' | 'keep_both';
export type ConflictStatus = 'unresolved' | 'resolved';

export interface ConflictRecord {
  id: string;
  entityId: string;
  entityType: ConflictEntityType;
  incidentId: string;
  entityName: string;
  localDeviceId: string;
  remoteDeviceId: string;
  localState: Record<string, unknown>;
  remoteState: Record<string, unknown>;
  localTimestamp: number;
  remoteTimestamp: number;
  localLabel: string;
  remoteLabel: string;
  status: ConflictStatus;
  resolution?: ConflictResolution;
  resolvedAt?: number;
  createdAt: number;
  sourceChangeIds: string[];
}

export interface AppData {
  incidents: Incident[];
  tasks: Task[];
  requests: Request[];
  timeline: TimelineEntry[];
  pendingChanges: PendingChange[];
  importedChangeIds: string[];
  deviceId: string;
  conflicts: ConflictRecord[];
  resolvedConflictIds: string[];
}

// ─── Relay payload types ─────────────────────────────────────────────

export const RELAY_VERSION = 1;

export type ChangeType =
  | 'INCIDENT_CREATED'
  | 'TASK_CREATED'
  | 'TASK_COMPLETED'
  | 'TASK_REOPENED'
  | 'REQUEST_CREATED'
  | 'REQUEST_MODIFIED'
  | 'TIMELINE_EVENT';

export interface RelayChange {
  changeId: string;
  type: ChangeType;
  entityId: string;
  incidentId: string;
  timestamp: number;
  payload: Record<string, unknown>;
}

export interface RelayPayload {
  version: number;
  relayId: string;
  createdAt: string;
  sourceDeviceId: string;
  incidentId: string;
  incidentTitle: string;
  hash: string;
  changes: RelayChange[];
}

export interface ImportResult {
  changesImported: number;
  tasksImported: number;
  requestsImported: number;
  timelineImported: number;
  incidentsImported: number;
  conflictsDetected: number;
}

export type RelayScanMode = 'scan' | 'paste' | 'generate';

export type SyncPhase = 'preparing' | 'merging' | 'checking' | 'complete';
