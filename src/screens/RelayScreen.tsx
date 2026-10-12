import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, RefreshCw, ScanLine, QrCode, Check, AlertTriangle, Shield, ArrowRight } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { QRCodeImage } from '@/components/QRCodeImage';
import { QRScanner } from '@/components/QRScanner';
import { Button } from '@/components/Button';
import {
  createRelayPayload,
  validatePayload,
  createDemoRelayPayload,
  type ValidationResult,
  type ValidationError,
} from '@/lib/relay';
import type { RelayPayload, ImportResult, RelayScanMode } from '@/types';

type RelayView = 'generate' | 'scan' | 'received' | 'imported' | 'nothing-new' | 'error' | 'conflicts';

const errorMessages: Record<ValidationError, string> = {
  EMPTY_PAYLOAD: 'The relay payload is empty.',
  INVALID_JSON: 'This QR code does not contain a valid relay payload.',
  UNSUPPORTED_VERSION: 'This relay was created by a newer version of Cairn.',
  MISSING_FIELD: 'The relay payload is missing required fields.',
  INVALID_CHANGES: 'The relay contains malformed change data.',
  HASH_MISMATCH: 'Relay integrity check failed — the payload may have been corrupted.',
  NO_CHANGES: 'This relay contains no changes to import.',
};

export function RelayScreen() {
  const { data, setScreen, activeIncidentId, importRelay, openIncident, deviceId, relayInitialMode } = useApp();

  const [view, setView] = useState<RelayView>(relayInitialMode === 'scan' ? 'scan' : 'generate');
  const [payload, setPayload] = useState<RelayPayload | null>(null);
  const [payloadJson, setPayloadJson] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<ValidationError | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [receivedPayload, setReceivedPayload] = useState<RelayPayload | null>(null);

  const incident = data.incidents.find((i) => i.id === activeIncidentId) ?? data.incidents[0];

  // Generate relay payload on mount (or when incident changes)
  const generatePayload = useCallback(async () => {
    if (!incident) return;
    setLoading(true);
    setPayload(null);
    setPayloadJson('');
    const p = await createRelayPayload(data, incident.id, deviceId);
    if (p) {
      setPayload(p);
      setPayloadJson(JSON.stringify(p));
    }
    setLoading(false);
  }, [data, incident, deviceId]);

  useEffect(() => {
    generatePayload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScan = useCallback(async (raw: string) => {
    setScanError(null);
    setValidationError(null);
    const result: ValidationResult = await validatePayload(raw);
    if (!result.ok || !result.payload) {
      setValidationError(result.error ?? 'INVALID_JSON');
      setView('error');
      return;
    }
    setReceivedPayload(result.payload);
    setView('received');
  }, []);

  const handleScanError = useCallback((error: string) => {
    setScanError(error);
  }, []);

  const handleImport = () => {
    if (!receivedPayload) return;
    const outcome = importRelay(receivedPayload);
    if (outcome.allDuplicates) {
      setView('nothing-new');
      return;
    }
    if (outcome.conflictsDetected > 0) {
      setView('conflicts');
      return;
    }
    setImportResult(outcome.result);
    setView('imported');
  };

  const handleDone = () => {
    if (receivedPayload) {
      openIncident(receivedPayload.incidentId);
    } else {
      setScreen('offline');
    }
  };

  const handleDemoScan = async () => {
    const demoPayload = await createDemoRelayPayload(deviceId);
    const json = JSON.stringify(demoPayload);
    await handleScan(json);
  };

  // ─── GENERATE view ──────────────────────────────────────────
  if (view === 'generate') {
    return (
      <div className="min-h-screen bg-[#f5f5f7]">
        <header className="sticky top-0 z-30 bg-[#f5f5f7]/80 backdrop-blur-xl border-b border-gray-200/60">
          <div className="max-w-3xl mx-auto px-5 sm:px-8 py-4 flex items-center justify-between">
            <button
              onClick={() => setScreen('offline')}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft size={18} />
              Back
            </button>
            <button
              onClick={() => setView('scan')}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-900 hover:text-gray-600 transition-colors"
            >
              <ScanLine size={16} />
              Scan
            </button>
          </div>
        </header>

        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
          <div className="text-center mb-10">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">
              Pass the state
            </h1>
            <p className="text-gray-500 mt-3 max-w-sm mx-auto">
              Point another device at this code to transfer your current incident state.
            </p>
          </div>

          {/* QR Code */}
          <div className="flex justify-center mb-8">
            <div className="inline-block p-6 bg-white rounded-2xl border border-gray-200 shadow-sm">
              {loading || !payload ? (
                <div className="w-[280px] h-[280px] flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-gray-900 animate-spin" />
                </div>
              ) : (
                <QRCodeImage value={payloadJson} size={280} />
              )}
            </div>
          </div>

          {/* Ready to scan state */}
          {payload && (
            <div className="flex items-center justify-center gap-2 mb-8">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 text-green-700 text-xs font-semibold border border-green-200">
                <Check size={13} />
                Ready to scan
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-50 text-gray-500 text-xs font-semibold border border-gray-200">
                <Shield size={13} />
                Integrity verified
              </span>
            </div>
          )}

          {/* Metadata */}
          {payload && (
            <div className="bg-white rounded-2xl border border-gray-200/80 p-6 mb-6">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
                Relay Metadata
              </h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{payload.changes.length}</p>
                  <p className="text-xs text-gray-400 mt-1">Changes</p>
                </div>
                <div className="text-center border-x border-gray-100">
                  <p className="text-2xl font-bold text-gray-900">
                    {payload.changes.filter((c) => c.type === 'TASK_CREATED').length}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Tasks</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">
                    {payload.changes.filter((c) => c.type === 'REQUEST_CREATED').length}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Requests</p>
                </div>
              </div>
              <div className="mt-5 pt-5 border-t border-gray-100 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Incident</p>
                  <p className="text-sm font-semibold text-gray-900">{payload.incidentTitle}</p>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Relay ID</p>
                  <p className="text-sm font-mono text-gray-500">{payload.relayId}</p>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col items-center gap-4">
            <button
              onClick={generatePayload}
              className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-900 transition-colors"
            >
              <RefreshCw size={15} />
              Regenerate relay code
            </button>
            <button
              onClick={handleDemoScan}
              className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-900 transition-colors"
            >
              <QrCode size={15} />
              Simulate scan (demo)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── SCAN view ──────────────────────────────────────────────
  if (view === 'scan') {
    return (
      <div className="min-h-screen bg-[#f5f5f7]">
        <header className="sticky top-0 z-30 bg-[#f5f5f7]/80 backdrop-blur-xl border-b border-gray-200/60">
          <div className="max-w-3xl mx-auto px-5 sm:px-8 py-4 flex items-center justify-between">
            <button
              onClick={() => {
                setView('generate');
                setScanError(null);
              }}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft size={18} />
              Back
            </button>
          </div>
        </header>

        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">
              Scan Relay
            </h1>
            <p className="text-gray-500 mt-3 max-w-sm mx-auto">
              Point the camera at a relay QR code from another device.
            </p>
          </div>

          <div className="max-w-sm mx-auto">
            <QRScanner onScan={handleScan} onError={handleScanError} />
          </div>

          {scanError && (
            <div className="max-w-sm mx-auto mt-4 flex items-start gap-3 p-4 rounded-xl bg-orange-50 border border-orange-200">
              <AlertTriangle size={18} className="text-orange-600 shrink-0 mt-0.5" />
              <p className="text-sm text-orange-700">{scanError}</p>
            </div>
          )}

          <div className="flex justify-center mt-6">
            <button
              onClick={handleDemoScan}
              className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-900 transition-colors"
            >
              <QrCode size={15} />
              Simulate scan (demo)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── RECEIVED view ──────────────────────────────────────────
  if (view === 'received' && receivedPayload) {
    const changes = receivedPayload.changes;
    const taskCount = changes.filter((c) => c.type === 'TASK_CREATED').length;
    const reqCount = changes.filter((c) => c.type === 'REQUEST_CREATED').length;
    const tlCount = changes.filter((c) => c.type === 'TIMELINE_EVENT').length;

    return (
      <div className="min-h-screen bg-[#f5f5f7]">
        <header className="sticky top-0 z-30 bg-[#f5f5f7]/80 backdrop-blur-xl border-b border-gray-200/60">
          <div className="max-w-3xl mx-auto px-5 sm:px-8 py-4 flex items-center justify-between">
            <button
              onClick={() => {
                setView('scan');
                setScanError(null);
              }}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft size={18} />
              Back
            </button>
          </div>
        </header>

        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-50 border border-green-200 mb-5">
              <Check size={32} className="text-green-600" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">
              RELAY RECEIVED
            </h1>
            <div className="flex items-center justify-center gap-2 mt-4">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 text-green-700 text-xs font-semibold border border-green-200">
                <Shield size={13} />
                Relay integrity verified
              </span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200/80 p-6 mb-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Incident</p>
                <p className="text-sm font-semibold text-gray-900">{receivedPayload.incidentTitle}</p>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Changes received</p>
                <p className="text-sm font-semibold text-gray-900">{changes.length}</p>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Source device</p>
                <p className="text-sm font-mono text-gray-500">
                  {receivedPayload.sourceDeviceId.slice(0, 12)}…
                </p>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Relay timestamp</p>
                <p className="text-sm text-gray-500">
                  {new Date(receivedPayload.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Relay ID</p>
                <p className="text-sm font-mono text-gray-500">{receivedPayload.relayId}</p>
              </div>
            </div>
            <div className="mt-5 pt-5 border-t border-gray-100">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-xl font-bold text-gray-900">{taskCount}</p>
                  <p className="text-xs text-gray-400 mt-1">Tasks</p>
                </div>
                <div className="text-center border-x border-gray-100">
                  <p className="text-xl font-bold text-gray-900">{reqCount}</p>
                  <p className="text-xs text-gray-400 mt-1">Requests</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-gray-900">{tlCount}</p>
                  <p className="text-xs text-gray-400 mt-1">Timeline</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleImport} className="flex-1">
              Import Changes
            </Button>
            <Button variant="secondary" onClick={() => setView('scan')}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── IMPORTED view ──────────────────────────────────────────
  if (view === 'imported' && importResult) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
        <div className="max-w-md w-full px-8 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-50 border border-green-200 mb-8 animate-[fadeIn_0.4s_ease]">
            <Check size={36} className="text-green-600" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-gray-900">
            RELAY IMPORTED
          </h1>
          <div className="mt-8 space-y-3">
            <div className="bg-white rounded-xl border border-gray-200/80 px-6 py-4">
              <p className="text-3xl font-bold text-gray-900">+{importResult.changesImported}</p>
              <p className="text-sm text-gray-400 mt-1">changes</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-xl border border-gray-200/80 px-4 py-4">
                <p className="text-2xl font-bold text-gray-900">+{importResult.tasksImported}</p>
                <p className="text-sm text-gray-400 mt-1">tasks</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200/80 px-4 py-4">
                <p className="text-2xl font-bold text-gray-900">+{importResult.requestsImported}</p>
                <p className="text-sm text-gray-400 mt-1">requests</p>
              </div>
            </div>
          </div>
          <button
            onClick={handleDone}
            className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-all active:scale-[0.98]"
          >
            View Incident
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  // ─── NOTHING NEW view ───────────────────────────────────────
  if (view === 'nothing-new') {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
        <div className="max-w-md w-full px-8 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-50 border border-gray-200 mb-8">
            <Check size={36} className="text-gray-400" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">
            NOTHING NEW
          </h1>
          <p className="text-lg text-gray-500 mt-4">
            All changes from this relay are already on this device.
          </p>
          <button
            onClick={() => setView('scan')}
            className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-all active:scale-[0.98]"
          >
            Scan Another
          </button>
        </div>
      </div>
    );
  }

  // ─── ERROR view ─────────────────────────────────────────────
  if (view === 'error') {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
        <div className="max-w-md w-full px-8 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-50 border border-red-200 mb-8">
            <AlertTriangle size={36} className="text-red-600" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">
            Invalid Relay
          </h1>
          <p className="text-lg text-gray-500 mt-4">
            {validationError ? errorMessages[validationError] : 'This QR code is not a valid Cairn relay.'}
          </p>
          <div className="flex gap-3 justify-center mt-8">
            <button
              onClick={() => {
                setView('scan');
                setValidationError(null);
                setScanError(null);
              }}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-all active:scale-[0.98]"
            >
              Try Again
            </button>
            <button
              onClick={() => setScreen('offline')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white border border-gray-200 text-gray-900 text-sm font-semibold hover:bg-gray-50 transition-all"
            >
              Back to Offline
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── CONFLICTS view ─────────────────────────────────────────
  if (view === 'conflicts') {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
        <div className="max-w-md w-full px-8 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-50 border border-amber-200 mb-8 animate-[fadeIn_0.4s_ease]">
            <AlertTriangle size={36} className="text-amber-600" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-gray-900">
            CONFLICTS DETECTED
          </h1>
          <p className="text-lg text-gray-500 mt-4">
            Some changes from this relay conflict with your local state.
          </p>
          <div className="flex gap-3 justify-center mt-8">
            <button
              onClick={() => setScreen('conflicts')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-all active:scale-[0.98]"
            >
              Review Conflicts
              <ArrowRight size={16} />
            </button>
            <button
              onClick={() => setScreen('offline')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white border border-gray-200 text-gray-900 text-sm font-semibold hover:bg-gray-50 transition-all"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Fallback
  return null;
}
