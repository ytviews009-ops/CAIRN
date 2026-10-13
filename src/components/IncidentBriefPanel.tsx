import { useState, useCallback } from 'react';
import { Sparkles, Loader2, Copy, Check, RefreshCw, X, AlertCircle, WifiOff, Lock, FileText } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import {
  prepareBriefInput,
  generateLocalBrief,
  fetchAIBrief,
  validateBrief,
  formatBriefForClipboard,
  BriefError,
  type IncidentBrief,
} from '@/lib/brief';

type BriefState =
  | 'idle'
  | 'consent'
  | 'generating'
  | 'ready'
  | 'error'
  | 'offline'
  | 'local';

export function IncidentBriefPanel({ incidentId, incidentTitle }: { incidentId: string; incidentTitle: string }) {
  const { data, connection } = useApp();
  const [state, setState] = useState<BriefState>('idle');
  const [brief, setBrief] = useState<IncidentBrief | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);

  const handleGenerate = useCallback(async () => {
    setState('generating');
    setErrorMsg('');

    const input = prepareBriefInput(data, incidentId);
    if (!input) {
      setState('error');
      setErrorMsg('Incident data could not be prepared.');
      return;
    }

    // Offline — generate local brief
    if (connection === 'offline') {
      const local = generateLocalBrief(input);
      setBrief(local);
      setState('local');
      return;
    }

    // Online — try AI
    try {
      const aiBrief = await fetchAIBrief(input);
      setBrief(aiBrief);
      setState('ready');
    } catch (err) {
      if (err instanceof BriefError) {
        // For server_not_configured or network errors, offer local fallback
        if (err.code === 'server_not_configured' || err.code === 'network_error') {
          const local = generateLocalBrief(input);
          setBrief(local);
          setState('local');
          setErrorMsg(err.message);
          return;
        }
        setErrorMsg(err.message);
      } else {
        setErrorMsg('An unexpected error occurred.');
      }

      // Offer local fallback on any AI failure
      const local = generateLocalBrief(input);
      setBrief(local);
      setState('local');
    }
  }, [data, incidentId, connection]);

  const handleCopy = useCallback(() => {
    if (!brief) return;
    const text = formatBriefForClipboard(brief, incidentTitle);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [brief, incidentTitle]);

  const handleClose = useCallback(() => {
    setState('idle');
    setBrief(null);
    setErrorMsg('');
    setCopied(false);
  }, []);

  // ─── Idle state ─────────────────────────────────────────
  if (state === 'idle') {
    return (
      <div className="bg-white rounded-2xl border border-gray-200/80 p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
            <Sparkles size={16} className="text-gray-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Cairn Intelligence</h3>
            <p className="text-xs text-gray-400">Incident Brief</p>
          </div>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Generate a concise handover summary from this incident's recorded tasks, requests and timeline.
        </p>
        <button
          onClick={() => setState('consent')}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-all active:scale-[0.98]"
        >
          <Sparkles size={15} />
          Generate Incident Brief
        </button>
      </div>
    );
  }

  // ─── Consent state ──────────────────────────────────────
  if (state === 'consent') {
    return (
      <div className="bg-white rounded-2xl border border-gray-200/80 p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <Lock size={16} className="text-blue-600" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900">Privacy Confirmation</h3>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          To generate this AI brief, Cairn will send the selected incident's title, task statuses, requests and recent timeline entries to OpenAI. Do not include information you are not authorized to share.
        </p>
        <div className="flex gap-3">
          <button
            onClick={handleGenerate}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-all active:scale-[0.98]"
          >
            <Sparkles size={15} />
            Generate AI Brief
          </button>
          <button
            onClick={() => setState('idle')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-900 text-sm font-semibold hover:bg-gray-50 transition-all"
          >
            Cancel
          </button>
        </div>
        {connection === 'offline' && (
          <p className="mt-3 text-xs text-amber-600 flex items-center gap-1.5">
            <WifiOff size={13} />
            You are offline — a local on-device brief will be generated instead.
          </p>
        )}
      </div>
    );
  }

  // ─── Generating state ───────────────────────────────────
  if (state === 'generating') {
    return (
      <div className="bg-white rounded-2xl border border-gray-200/80 p-5">
        <div className="flex items-center gap-3">
          <Loader2 size={20} className="text-gray-400 animate-spin" />
          <span className="text-sm text-gray-500">Generating brief...</span>
        </div>
      </div>
    );
  }

  // ─── Ready / Local state ────────────────────────────────
  if ((state === 'ready' || state === 'local') && brief) {
    const isLocal = brief.source === 'local';
    return (
      <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isLocal ? 'bg-gray-100' : 'bg-blue-50'}`}>
              {isLocal ? <FileText size={16} className="text-gray-600" /> : <Sparkles size={16} className="text-blue-600" />}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                {isLocal ? 'Local Brief' : 'AI Incident Brief'}
              </h3>
              <p className="text-xs text-gray-400">
                {isLocal
                  ? 'Generated on this device. No data was sent to an AI service.'
                  : 'Generated by AI from recorded incident data.'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Error notice (for local fallback after AI failure) */}
        {state === 'local' && errorMsg && (
          <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
            <AlertCircle size={14} className="text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700">
              AI request failed — showing local brief instead. {errorMsg}
            </p>
          </div>
        )}

        {/* Content */}
        <div className="px-5 py-4 space-y-4">
          <BriefSection title="Situation" items={[brief.situation]} />
          <BriefSection title="Completed" items={brief.completedItems} />
          <BriefSection title="Outstanding" items={brief.outstandingItems} />
          <BriefSection title="Open Requests" items={brief.openRequests} />
          <BriefSection title="Next Actions" items={brief.nextActions} />
          <BriefSection title="Uncertainties" items={brief.uncertainties} />
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            Generated at {new Date(brief.generatedAt).toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <RefreshCw size={13} />
              Generate again
            </button>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy Brief'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Error state ────────────────────────────────────────
  if (state === 'error') {
    return (
      <div className="bg-white rounded-2xl border border-gray-200/80 p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
            <AlertCircle size={16} className="text-red-600" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900">Unable to Generate Brief</h3>
        </div>
        <p className="text-sm text-gray-500 mb-4">{errorMsg}</p>
        <div className="flex gap-3">
          <button
            onClick={handleGenerate}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-all"
          >
            <RefreshCw size={15} />
            Try Again
          </button>
          <button
            onClick={handleClose}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-900 text-sm font-semibold hover:bg-gray-50 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return null;
}

function BriefSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{title}</h4>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400">None recorded.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
              <span className="text-gray-300 mt-1 shrink-0">·</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
