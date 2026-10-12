import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { AppData, ConnectionStatus, Incident, Task, Request, TimelineEntry, PendingChange, ScreenName, RelayPayload, ImportResult, RelayScanMode, ConflictResolution, SyncPhase } from '@/types';
import { loadData, saveData } from '@/lib/idb';
import { getSeedData } from '@/lib/seed';
import { getOrCreateDeviceId, mergeRelayPayload, checkDuplicates, computeHash, generateId, generateRelayId } from '@/lib/relay';
import { applyConflictResolution, getUnresolvedConflicts, markTasksConflicting, createConflictDemoChanges } from '@/lib/conflict';
import { RELAY_VERSION } from '@/types';

interface RelayImportOutcome {
  result: ImportResult | null;
  allDuplicates: boolean;
  incidentId: string;
  conflictsDetected: number;
}

interface AppContextValue {
  data: AppData;
  connection: ConnectionStatus;
  screen: ScreenName;
  activeIncidentId: string | null;
  relayInitialMode: RelayScanMode;
  setScreen: (s: ScreenName) => void;
  openIncident: (id: string) => void;
  openRelay: (mode: RelayScanMode) => void;
  toggleConnection: () => void;
  reconnect: () => void;
  addIncident: (title: string, location: string) => void;
  addTask: (incidentId: string, title: string) => void;
  toggleTask: (taskId: string) => void;
  addRequest: (incidentId: string, title: string, quantity: number) => void;
  importRelay: (payload: RelayPayload) => RelayImportOutcome;
  resolveConflict: (conflictId: string, resolution: ConflictResolution) => void;
  runConflictDemo: () => Promise<void>;
  pendingCount: number;
  deviceId: string;
  unresolvedConflictCount: number;
  syncPhase: SyncPhase;
  lastSyncSummary: { changesMerged: number; conflictsFound: number } | null;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>('online');
  const [screen, setScreen] = useState<ScreenName>('home');
  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string>('');
  const [relayInitialMode, setRelayInitialMode] = useState<RelayScanMode>('scan');
  const [syncPhase, setSyncPhase] = useState<SyncPhase>('complete');
  const [lastSyncSummary, setLastSyncSummary] = useState<{ changesMerged: number; conflictsFound: number } | null>(null);

  useEffect(() => {
    const id = getOrCreateDeviceId();
    setDeviceId(id);
    loadData().then((loaded) => {
      if (loaded) {
        if (!loaded.deviceId) loaded.deviceId = id;
        if (!loaded.importedChangeIds) loaded.importedChangeIds = [];
        if (!loaded.conflicts) loaded.conflicts = [];
        if (!loaded.resolvedConflictIds) loaded.resolvedConflictIds = [];
        // If there are unresolved conflicts on load, show conflicts status
        const unresolved = getUnresolvedConflicts(loaded).length;
        if (unresolved > 0) {
          setConnection('conflicts');
        }
        setData(loaded);
      } else {
        setData(getSeedData());
      }
    });
  }, []);

  useEffect(() => {
    if (data) saveData(data);
  }, [data]);

  const openIncident = useCallback((id: string) => {
    setActiveIncidentId(id);
    setScreen('incident');
  }, []);

  const openRelay = useCallback((mode: RelayScanMode) => {
    setRelayInitialMode(mode);
    setScreen('relay');
  }, []);

  const toggleConnection = useCallback(() => {
    setConnection((c) => {
      if (c === 'online') return 'offline';
      if (c === 'offline') return 'online';
      return 'online';
    });
  }, []);

  const reconnect = useCallback(() => {
    setScreen('reconnect');
    setConnection('syncing');
    setSyncPhase('preparing');

    setTimeout(() => setSyncPhase('merging'), 800);
    setTimeout(() => setSyncPhase('checking'), 1600);

    setTimeout(() => {
      setSyncPhase('complete');
      setData((d) => {
        if (!d) return d;
        return { ...d, pendingChanges: [] };
      });
      const unresolved = data ? getUnresolvedConflicts(data).length : 0;
      if (unresolved > 0) {
        setConnection('conflicts');
      } else {
        setConnection('online');
      }
    }, 2400);

    setTimeout(() => {
      setScreen('home');
    }, 3600);
  }, [data]);

  const addIncident = useCallback((title: string, location: string) => {
    const id = 'inc-' + Date.now();
    const incident: Incident = {
      id,
      title,
      location,
      status: 'active',
      createdAt: Date.now(),
      members: 1,
    };
    const tl: TimelineEntry = {
      id: 'tl-' + Date.now(),
      incidentId: id,
      message: `Incident created — ${title}`,
      kind: 'system',
      createdAt: Date.now(),
    };
    setData((d) => {
      if (!d) return d;
      return { ...d, incidents: [incident, ...d.incidents], timeline: [tl, ...d.timeline] };
    });
    setActiveIncidentId(id);
    setScreen('incident');
  }, []);

  const addTask = useCallback((incidentId: string, title: string) => {
    const id = 'task-' + Date.now();
    const task: Task = {
      id,
      incidentId,
      title,
      status: 'pending',
      createdAt: Date.now(),
      completedAt: null,
    };
    const tl: TimelineEntry = {
      id: 'tl-' + Date.now(),
      incidentId,
      message: `Task added: ${title}`,
      kind: 'task',
      createdAt: Date.now(),
    };
    setData((d) => {
      if (!d) return d;
      const pending: PendingChange = {
        id: 'pc-' + Date.now(),
        incidentId,
        type: 'task',
        summary: `New task: ${title}`,
        createdAt: Date.now(),
      };
      return {
        ...d,
        tasks: [...d.tasks, task],
        timeline: [tl, ...d.timeline],
        pendingChanges: connection === 'offline' ? [...d.pendingChanges, pending] : d.pendingChanges,
      };
    });
  }, [connection]);

  const toggleTask = useCallback((taskId: string) => {
    setData((d) => {
      if (!d) return d;
      const task = d.tasks.find((t) => t.id === taskId);
      if (!task) return d;
      const newStatus = task.status === 'completed' ? 'pending' : 'completed';
      const tl: TimelineEntry = {
        id: 'tl-' + Date.now(),
        incidentId: task.incidentId,
        message: newStatus === 'completed' ? `Task completed: ${task.title}` : `Task reopened: ${task.title}`,
        kind: 'task',
        createdAt: Date.now(),
      };
      return {
        ...d,
        tasks: d.tasks.map((t) =>
          t.id === taskId
            ? { ...t, status: newStatus, completedAt: newStatus === 'completed' ? Date.now() : null }
            : t
        ),
        timeline: [tl, ...d.timeline],
      };
    });
  }, []);

  const addRequest = useCallback((incidentId: string, title: string, quantity: number) => {
    const id = 'req-' + Date.now();
    const req: Request = {
      id,
      incidentId,
      title,
      quantity,
      fulfilled: false,
      createdAt: Date.now(),
    };
    const tl: TimelineEntry = {
      id: 'tl-' + Date.now(),
      incidentId,
      message: `Request added: ${title} × ${quantity}`,
      kind: 'request',
      createdAt: Date.now(),
    };
    setData((d) => {
      if (!d) return d;
      const pending: PendingChange = {
        id: 'pc-' + Date.now(),
        incidentId,
        type: 'request',
        summary: `New request: ${title} × ${quantity}`,
        createdAt: Date.now(),
      };
      return {
        ...d,
        requests: [...d.requests, req],
        timeline: [tl, ...d.timeline],
        pendingChanges: connection === 'offline' ? [...d.pendingChanges, pending] : d.pendingChanges,
      };
    });
  }, [connection]);

  const importRelay = useCallback((payload: RelayPayload): RelayImportOutcome => {
    const dupCheck = checkDuplicates(data!, payload);
    if (dupCheck.allDuplicates) {
      return { result: null, allDuplicates: true, incidentId: payload.incidentId, conflictsDetected: 0 };
    }

    const { data: merged, result } = mergeRelayPayload(data!, payload, deviceId);
    setData(merged);

    // Update connection status if conflicts were detected
    if (result.conflictsDetected > 0) {
      setConnection('conflicts');
    }

    setLastSyncSummary({ changesMerged: result.changesImported, conflictsFound: result.conflictsDetected });

    return {
      result,
      allDuplicates: false,
      incidentId: payload.incidentId,
      conflictsDetected: result.conflictsDetected,
    };
  }, [data, deviceId]);

  const resolveConflict = useCallback((conflictId: string, resolution: ConflictResolution) => {
    setData((d) => {
      if (!d) return d;
      const resolved = applyConflictResolution(d, conflictId, resolution, deviceId);
      // Check if any unresolved conflicts remain
      const remaining = getUnresolvedConflicts(resolved).length;
      if (remaining === 0 && connection === 'conflicts') {
        setConnection('online');
      }
      return resolved;
    });
  }, [deviceId, connection]);

  const runConflictDemo = useCallback(async () => {
    setData((d) => {
      if (!d) return d;
      const demoIncidentId = 'inc-conflict-demo';
      const demoTaskId = 'task-conflict-demo-elevator';
      const demoTaskTitle = 'Check elevator status';
      const hasDemoIncident = d.incidents.some((i) => i.id === demoIncidentId);
      const hasDemoTask = d.tasks.some((t) => t.id === demoTaskId);
      let incidents = [...d.incidents];
      let tasks = [...d.tasks];
      let timeline = [...d.timeline];
      if (!hasDemoIncident) {
        incidents = [{ id: demoIncidentId, title: 'Demo — Conflict Scenario', location: 'Demo Building', status: 'active' as const, createdAt: Date.now() - 60000, members: 2 }, ...incidents];
        timeline = [{ id: generateId('tl'), incidentId: demoIncidentId, message: 'Incident created — Demo — Conflict Scenario', kind: 'system' as const, createdAt: Date.now() - 60000 }, ...timeline];
      }
      if (!hasDemoTask) {
        tasks = [{ id: demoTaskId, incidentId: demoIncidentId, title: demoTaskTitle, status: 'pending' as const, createdAt: Date.now() - 50000, completedAt: null }, ...tasks];
        timeline = [{ id: generateId('tl'), incidentId: demoIncidentId, message: `Task added: ${demoTaskTitle}`, kind: 'task' as const, createdAt: Date.now() - 50000 }, ...timeline];
      }
      tasks = tasks.map((t) => t.id === demoTaskId ? { ...t, status: 'completed' as const, completedAt: Date.now() - 30000 } : t);
      timeline = [{ id: generateId('tl'), incidentId: demoIncidentId, message: `Task completed: ${demoTaskTitle}`, kind: 'task' as const, createdAt: Date.now() - 30000 }, ...timeline];
      return { ...d, incidents, tasks, timeline };
    });
    await new Promise((r) => setTimeout(r, 50));
    const remoteDeviceId = 'dev-remoteXX';
    const demoIncidentId = 'inc-conflict-demo';
    const demoTaskId = 'task-conflict-demo-elevator';
    const demoTaskTitle = 'Check elevator status';
    const baseTime = Date.now() - 10000;
    const changes = createConflictDemoChanges(demoIncidentId, remoteDeviceId, demoTaskId, demoTaskTitle, baseTime);
    const partial = { version: RELAY_VERSION, relayId: generateRelayId(), createdAt: new Date().toISOString(), sourceDeviceId: remoteDeviceId, incidentId: demoIncidentId, incidentTitle: 'Demo — Conflict Scenario', changes };
    const hash = await computeHash(partial);
    const payload: RelayPayload = { ...partial, hash };
    setData((d) => {
      if (!d) return d;
      const { data: merged } = mergeRelayPayload(d, payload, deviceId);
      return merged;
    });
    setActiveIncidentId(demoIncidentId);
    setConnection('conflicts');
    setScreen('conflicts');
  }, [deviceId]);

  if (!data) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-gray-900 animate-spin" />
      </div>
    );
  }

  const unresolvedCount = getUnresolvedConflicts(data).length;

  return (
    <AppContext.Provider
      value={{
        data,
        connection,
        screen,
        activeIncidentId,
        setScreen,
        openIncident,
        openRelay,
        relayInitialMode,
        toggleConnection,
        reconnect,
        addIncident,
        addTask,
        toggleTask,
        addRequest,
        importRelay,
        resolveConflict,
        runConflictDemo,
        pendingCount: data.pendingChanges.length,
        deviceId,
        unresolvedConflictCount: unresolvedCount,
        syncPhase,
        lastSyncSummary,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
