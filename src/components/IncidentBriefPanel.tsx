import { useState, useCallback } from 'react';
import { Sparkles, Loader2, Copy, Check, RefreshCw, X, AlertCircle, FileText, Lock, CloudOff } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import {
  prepareBriefInput,
  generateLocalBrief,
  formatBriefForClipboard,
  type IncidentBrief,
} from '@/lib/brief';

type BriefState = 'idle' | 'generating' | 'local' | 'consent-ai';

export function IncidentBriefPanel({ incidentId, incidentTitle }: { incidentId: string; incidentTitle: string }) {
  const { data } = useApp();
  const [state, setState] = useState<BriefState>('idle');
  const [brief, setBrief] = useState<IncidentBrief | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerateLocal = useCallback(() => {
    setState('generating');

    const input = prepareBriefInput(data, incidentId);
    if (!input) {
      setState('idle');
      return;
    }

    // Synchronous — no network request, works online or offline
    const local = generateLocalBrief(input);
    setBrief(local);
    setState('local');
  }, [data, incidentId]);

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
    setCopied(false);
  }, []);

  // ─── Idle state ─────────────────────────────────────────
  if (state === 'idle') {
    return (
      <div className="bg-white rounded-2xl border border-gray-200/80 p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
            <FileText size={16} className="text-gray-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Incident Brief</h3>
            <p className="text-xs text-gray-400">On-device handover summary</p>
          </div>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Generate a concise handover summary from this incident's recorded tasks, requests and timeline. No data leaves your device.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleGenerateLocal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-all active:scale-[0.98]"
          >
            <FileText size={15} />
            Generate Local Brief
          </button>
          <button
            onClick={() => setState('consent-ai')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-400 text-sm font-semibold cursor-not-allowed"
            disabled
          >
            <Sparkles size={15} />
            AI Brief (unavailable)
          </button>
        </div>
        <p className="mt-3 text-xs text-gray-400">
          AI-powered briefs require paid OpenAI API credits. Local briefs work without any API or network connection.
        </p>
      </div>
    );
  }

  // ─── AI consent (preserved for future use, shows unavailable) ──
  if (state === 'consent-ai') {
    return (
      <div className="bg-white rounded-2xl border border-gray-200/80 p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <Lock size={16} className="text-blue-600" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900">AI Brief — Unavailable</h3>
        </div>
        <div className="flex items-start gap-2 mb-4">
          <CloudOff size={16} className="text-gray-400 mt-0.5 shrink-0" />
          <p className="text-sm text-gray-500">
            AI-powered briefs require paid OpenAI API credits, which are not currently configured. You can still generate a Local Brief on this device at no cost.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleGenerateLocal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-all active:scale-[0.98]"
          >
            <FileText size={15} />
            Generate Local Brief
          </button>
          <button
            onClick={() => setState('idle')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-900 text-sm font-semibold hover:bg-gray-50 transition-all"
          >
            Back
          </button>
        </div>
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

  // ─── Local brief ready ──────────────────────────────────
  if (state === 'local' && brief) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
              <FileText size={16} className="text-gray-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Local Brief</h3>
              <p className="text-xs text-gray-400">
                Generated on this device. No data was sent to an AI service.
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
              onClick={handleGenerateLocal}
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
