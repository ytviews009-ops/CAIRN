import type { AppData } from '@/types';
import { getOrCreateDeviceId } from '@/lib/relay';

const now = Date.now();
const min = 60_000;

export function getSeedData(): AppData {
  return {
    incidents: [
      {
        id: 'inc-1',
        title: 'Building B — Power Outage',
        location: 'Building B, Floor 3',
        status: 'active',
        createdAt: now - 42 * min,
        members: 8,
      },
    ],
    tasks: [
      {
        id: 'task-1',
        incidentId: 'inc-1',
        title: 'Check emergency lights',
        status: 'completed',
        createdAt: now - 40 * min,
        completedAt: now - 32 * min,
      },
      {
        id: 'task-2',
        incidentId: 'inc-1',
        title: 'Contact facilities',
        status: 'pending',
        createdAt: now - 38 * min,
        completedAt: null,
      },
      {
        id: 'task-3',
        incidentId: 'inc-1',
        title: 'Check elevator status',
        status: 'pending',
        createdAt: now - 35 * min,
        completedAt: null,
      },
    ],
    requests: [
      {
        id: 'req-1',
        incidentId: 'inc-1',
        title: 'Flashlight',
        quantity: 2,
        fulfilled: false,
        createdAt: now - 30 * min,
      },
      {
        id: 'req-2',
        incidentId: 'inc-1',
        title: 'First-aid kit',
        quantity: 1,
        fulfilled: false,
        createdAt: now - 28 * min,
      },
    ],
    timeline: [
      {
        id: 'tl-1',
        incidentId: 'inc-1',
        message: 'Incident created — Building B, Floor 3',
        kind: 'system',
        createdAt: now - 42 * min,
      },
      {
        id: 'tl-2',
        incidentId: 'inc-1',
        message: 'Task added: Check emergency lights',
        kind: 'task',
        createdAt: now - 40 * min,
      },
      {
        id: 'tl-3',
        incidentId: 'inc-1',
        message: 'Task added: Contact facilities',
        kind: 'task',
        createdAt: now - 38 * min,
      },
      {
        id: 'tl-4',
        incidentId: 'inc-1',
        message: 'Task added: Check elevator status',
        kind: 'task',
        createdAt: now - 35 * min,
      },
      {
        id: 'tl-5',
        incidentId: 'inc-1',
        message: 'Request added: Flashlight × 2',
        kind: 'request',
        createdAt: now - 30 * min,
      },
      {
        id: 'tl-6',
        incidentId: 'inc-1',
        message: 'Request added: First-aid kit × 1',
        kind: 'request',
        createdAt: now - 28 * min,
      },
      {
        id: 'tl-7',
        incidentId: 'inc-1',
        message: 'Task completed: Check emergency lights',
        kind: 'task',
        createdAt: now - 32 * min,
      },
    ],
    pendingChanges: [],
    importedChangeIds: [],
    deviceId: getOrCreateDeviceId(),
    conflicts: [],
    resolvedConflictIds: [],
  };
}
