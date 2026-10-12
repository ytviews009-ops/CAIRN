import { ArrowLeft, Check, AlertTriangle, ArrowRight } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { getDeviceLabel } from '@/lib/conflict';
import type { ConflictRecord, ConflictResolution } from '@/types';

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function ConflictCard({ conflict, onResolve }: {
  conflict: ConflictRecord;
  onResolve: (id: string, resolution: ConflictResolution) => void;
}) {
  const isTask = conflict.entityType === 'task';
  const localStatus = isTask
    ? (conflict.localState.status === 'completed' ? 'Completed' : 'Incomplete')
    : `${conflict.localState.quantity} pcs${conflict.localState.fulfilled ? ' (fulfilled)' : ''}`;
  const remoteStatus = isTask
    ? (conflict.remoteState.status === 'completed' ? 'Completed' : 'Incomplete')
    : `${conflict.remoteState.quantity} pcs${conflict.remoteState.fulfilled ? ' (fulfilled)' : ''}`;

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 p-6">
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle size={16} className="text-amber-500" />
        <span className="text-xs font-semibold text-amber-600 uppercase tracking-wide">
          {isTask ? 'Task conflict' : 'Request conflict'}
        </span>
      </div>
      <h3 className="text-xl font-bold text-gray-900 mb-1">{conflict.entityName}</h3>
      <p className="text-sm text-gray-500 mb-5">Two offline updates disagree.</p>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{conflict.localLabel}</p>
          <p className="text-sm font-semibold text-gray-900">{localStatus}</p>
          <p className="text-xs text-gray-400 mt-1">{formatTime(conflict.localTimestamp)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{conflict.remoteLabel}</p>
          <p className="text-sm font-semibold text-gray-900">{remoteStatus}</p>
          <p className="text-xs text-gray-400 mt-1">{formatTime(conflict.remoteTimestamp)}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={() => onResolve(conflict.id, 'keep_local')}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-all active:scale-[0.98]"
        >
          <Check size={15} />
          Keep {conflict.localLabel === 'This device' ? 'Local' : conflict.localLabel}
        </button>
        <button
          onClick={() => onResolve(conflict.id, 'keep_remote')}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white border border-gray-200 text-gray-900 text-sm font-semibold hover:bg-gray-50 transition-all active:scale-[0.98]"
        >
          <Check size={15} />
          Keep {conflict.remoteLabel}
        </button>
        <button
          onClick={() => onResolve(conflict.id, 'keep_both')}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white border border-gray-200 text-gray-500 text-sm font-semibold hover:bg-gray-50 transition-all active:scale-[0.98]"
        >
          Keep Both
        </button>
      </div>
    </div>
  );
}

export function ConflictsScreen() {
  const { data, setScreen, resolveConflict, deviceId } = useApp();
  const unresolved = data.conflicts.filter((c) => c.status === 'unresolved');
  const resolved = data.conflicts.filter((c) => c.status === 'resolved');

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <header className="sticky top-0 z-30 bg-[#f5f5f7]/80 backdrop-blur-xl border-b border-gray-200/60">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-4 flex items-center justify-between">
          <button
            onClick={() => setScreen('home')}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft size={18} />
            Back
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">
            Conflicts
          </h1>
          <p className="text-gray-500 mt-2">
            {unresolved.length > 0
              ? `${unresolved.length} conflict${unresolved.length !== 1 ? 's' : ''} need${unresolved.length === 1 ? 's' : ''} review.`
              : 'No unresolved conflicts.'}
          </p>
        </div>

        {unresolved.length > 0 && (
          <div className="space-y-4 mb-8">
            {unresolved.map((conflict) => (
              <ConflictCard
                key={conflict.id}
                conflict={conflict}
                onResolve={resolveConflict}
              />
            ))}
          </div>
        )}

        {unresolved.length === 0 && resolved.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-200/80 p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-50 border border-gray-200 mb-5">
              <Check size={32} className="text-gray-400" />
            </div>
            <p className="text-lg font-semibold text-gray-900">No conflicts detected</p>
            <p className="text-sm text-gray-400 mt-2">All changes are in agreement.</p>
          </div>
        )}

        {resolved.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
              Resolved
            </h2>
            <div className="space-y-3">
              {resolved.map((conflict) => (
                <div
                  key={conflict.id}
                  className="bg-white rounded-2xl border border-gray-200/80 p-4 flex items-center gap-3"
                >
                  <Check size={18} className="text-green-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {conflict.entityName}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Resolved: {conflict.resolution === 'keep_local' ? 'kept local' : conflict.resolution === 'keep_remote' ? 'kept remote' : 'kept both'}
                      {' · '}
                      {formatTime(conflict.resolvedAt ?? 0)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {unresolved.length === 0 && resolved.length > 0 && (
          <button
            onClick={() => setScreen('home')}
            className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-all active:scale-[0.98]"
          >
            Back to Home
            <ArrowRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
