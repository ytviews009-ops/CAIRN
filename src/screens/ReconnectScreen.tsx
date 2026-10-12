import { useEffect, useState } from 'react';
import { Check, AlertTriangle, ArrowRight } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import type { SyncPhase } from '@/types';

const phaseLabels: Record<SyncPhase, string> = {
  preparing: 'Preparing local changes…',
  merging: 'Merging changes…',
  checking: 'Checking conflicts…',
  complete: '',
};

export function ReconnectScreen() {
  const { syncPhase, lastSyncSummary, unresolvedConflictCount, setScreen, data } = useApp();
  const [displayPhase, setDisplayPhase] = useState<SyncPhase>('preparing');

  useEffect(() => {
    setDisplayPhase(syncPhase);
  }, [syncPhase]);

  const isComplete = displayPhase === 'complete';
  const hasConflicts = unresolvedConflictCount > 0;
  const changesMerged = lastSyncSummary?.changesMerged ?? data.pendingChanges.length;

  if (!isComplete) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
        <div className="max-w-md w-full px-8 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-50 border border-blue-200 mb-8">
            <div className="w-8 h-8 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-gray-900">
            BACK ONLINE
          </h1>
          <p className="text-lg text-gray-500 mt-4">{phaseLabels[displayPhase]}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
      <div className="max-w-md w-full px-8 text-center animate-[fadeIn_0.5s_ease]">
        {hasConflicts ? (
          <>
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-50 border border-amber-200 mb-8">
              <AlertTriangle size={36} className="text-amber-600" />
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-gray-900">
              SYNC COMPLETE
            </h1>
            <div className="mt-6 space-y-2">
              {changesMerged > 0 && (
                <p className="text-lg text-gray-500">
                  {changesMerged} change{changesMerged !== 1 ? 's' : ''} merged
                </p>
              )}
              <p className="text-lg text-amber-600 font-medium">
                {unresolvedConflictCount} conflict{unresolvedConflictCount !== 1 ? 's' : ''} need{unresolvedConflictCount === 1 ? 's' : ''} review
              </p>
            </div>
            <button
              onClick={() => setScreen('conflicts')}
              className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-all active:scale-[0.98]"
            >
              Review conflicts
              <ArrowRight size={16} />
            </button>
          </>
        ) : (
          <>
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-50 border border-green-200 mb-8">
              <Check size={36} className="text-green-600" />
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-gray-900">
              SYNC COMPLETE
            </h1>
            <p className="text-lg text-gray-500 mt-4">
              {changesMerged > 0
                ? `${changesMerged} change${changesMerged !== 1 ? 's' : ''} merged. Everything is up to date.`
                : 'Everything is up to date.'}
            </p>
            <button
              onClick={() => setScreen('home')}
              className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-all active:scale-[0.98]"
            >
              Back to Home
              <ArrowRight size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
