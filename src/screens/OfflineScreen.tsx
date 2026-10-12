import { ArrowLeft, HardDrive, Radio, QrCode, ScanLine } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { StatusBadge } from '@/components/StatusBadge';

export function OfflineScreen() {
  const { data, setScreen, pendingCount, openRelay } = useApp();

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#f5f5f7]/80 backdrop-blur-xl border-b border-gray-200/60">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-4 flex items-center justify-between">
          <button
            onClick={() => setScreen('home')}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft size={18} />
            Back
          </button>
          <StatusBadge status="offline" />
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-12 sm:py-16">
        {/* Large OFFLINE status */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-orange-50 border border-orange-200 mb-6">
            <Radio size={36} className="text-orange-600" />
          </div>
          <h1 className="text-5xl sm:text-7xl font-bold tracking-tight text-gray-900">OFFLINE</h1>
          <p className="text-lg text-gray-500 mt-4 max-w-sm mx-auto">
            Your data is staying on this device.
          </p>
        </div>

        {/* Status cards */}
        <div className="grid sm:grid-cols-2 gap-4 mb-10">
          <div className="bg-white rounded-2xl border border-gray-200/80 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                <HardDrive size={20} className="text-green-600" />
              </div>
              <span className="text-sm font-semibold text-gray-900">Stored Locally</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">
              {data.tasks.length + data.requests.length + data.timeline.length}
            </p>
            <p className="text-sm text-gray-400 mt-1">items saved on this device</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200/80 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
                <Radio size={20} className="text-orange-600" />
              </div>
              <span className="text-sm font-semibold text-gray-900">Pending Relay</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{pendingCount}</p>
            <p className="text-sm text-gray-400 mt-1">changes waiting to sync</p>
          </div>
        </div>

        {/* Relay actions */}
        <div className="bg-white rounded-2xl border border-gray-200/80 p-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
            Relay State
          </h2>
          <p className="text-sm text-gray-500 mb-5">
            Share your current state with another device using a QR code, or scan a relay code to
            receive updates.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => openRelay('generate')}
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-4 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-all active:scale-[0.98]"
            >
              <QrCode size={18} />
              Generate Relay QR
            </button>
            <button
              onClick={() => openRelay('scan')}
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-4 rounded-xl bg-white border border-gray-200 text-gray-900 text-sm font-semibold hover:bg-gray-50 transition-all active:scale-[0.98]"
            >
              <ScanLine size={18} />
              Scan Relay
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
