import { useState } from 'react';
import { Plus, Users, ArrowRight, WifiOff, Radio, QrCode, AlertTriangle } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Logo } from '@/components/Logo';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';

export function HomeScreen() {
  const { data, connection, toggleConnection, openIncident, addIncident, setScreen, pendingCount, openRelay, unresolvedConflictCount, runConflictDemo } = useApp();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [joinCode, setJoinCode] = useState('');

  const handleCreate = () => {
    if (title.trim()) {
      addIncident(title.trim(), location.trim() || 'Unknown location');
      setTitle('');
      setLocation('');
      setShowCreate(false);
    }
  };

  const handleJoin = () => {
    setShowJoin(false);
    setJoinCode('');
    if (data.incidents.length > 0) {
      openIncident(data.incidents[0].id);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#f5f5f7]/80 backdrop-blur-xl border-b border-gray-200/60">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size={32} />
            <span className="text-lg font-bold tracking-tight text-gray-900">CAIRN</span>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={connection} />
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-5 sm:px-8 pt-16 pb-12 sm:pt-24 sm:pb-16">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-4">
            Local-first coordination
          </p>
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-gray-900 leading-[1.05]">
            Coordination that<br />survives the outage.
          </h1>
          <p className="mt-6 text-lg text-gray-500 leading-relaxed max-w-lg">
            Cairn keeps your team aligned when the network drops. Create incidents, assign tasks,
            and track requests — all stored on your device.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-3">
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={18} />
              Create Incident
            </Button>
            <Button variant="secondary" onClick={() => setShowJoin(true)}>
              Join Team
            </Button>
          </div>

          {pendingCount > 0 && (
            <button
              onClick={() => setScreen('reconnect')}
              className="mt-6 inline-flex items-center gap-2 text-sm text-orange-600 font-medium hover:text-orange-700 transition-colors"
            >
              <Radio size={16} />
              {pendingCount} change{pendingCount !== 1 ? 's' : ''} pending relay
            </button>
          )}

          {unresolvedConflictCount > 0 && (
            <button
              onClick={() => setScreen('conflicts')}
              className="mt-3 inline-flex items-center gap-2 text-sm text-amber-600 font-medium hover:text-amber-700 transition-colors"
            >
              <AlertTriangle size={16} />
              {unresolvedConflictCount} conflict{unresolvedConflictCount !== 1 ? 's' : ''} need{unresolvedConflictCount === 1 ? 's' : ''} review
            </button>
          )}
        </div>
      </section>

      {/* Active Incidents */}
      <section className="max-w-5xl mx-auto px-5 sm:px-8 pb-24">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
            Active Incidents
          </h2>
          <span className="text-sm text-gray-400">{data.incidents.length}</span>
        </div>

        <div className="grid gap-4">
          {data.incidents.map((inc) => {
            const incTasks = data.tasks.filter((t) => t.incidentId === inc.id);
            const incRequests = data.requests.filter((r) => r.incidentId === inc.id);
            const incTimeline = data.timeline.filter((t) => t.incidentId === inc.id);
            const completedTasks = incTasks.filter((t) => t.status === 'completed').length;

            return (
              <button
                key={inc.id}
                onClick={() => openIncident(inc.id)}
                className="group text-left bg-white rounded-2xl border border-gray-200/80 p-6 hover:shadow-lg hover:border-gray-300 transition-all duration-300"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="inline-flex w-2 h-2 rounded-full bg-red-500" />
                      <span className="text-xs font-semibold text-red-600 uppercase tracking-wide">
                        Active
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 truncate">{inc.title}</h3>
                    <p className="text-sm text-gray-500 mt-1">{inc.location}</p>
                  </div>
                  <ArrowRight
                    size={20}
                    className="text-gray-300 group-hover:text-gray-900 group-hover:translate-x-1 transition-all duration-200 shrink-0"
                  />
                </div>

                <div className="flex items-center gap-6 mt-5 text-sm text-gray-500">
                  <span className="inline-flex items-center gap-1.5">
                    <Users size={15} />
                    {inc.members} members
                  </span>
                  <span>{incTimeline.length} updates</span>
                  <span>
                    {completedTasks}/{incTasks.length} tasks done
                  </span>
                  <span>{incRequests.length} requests</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Demo control */}
        <div className="mt-12 pt-8 border-t border-gray-200/60">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
            Demo Controls
          </h3>
          <button
            onClick={toggleConnection}
            className={`inline-flex items-center gap-3 px-5 py-4 rounded-2xl border transition-all duration-300 ${
              connection === 'online'
                ? 'bg-white border-gray-200 hover:bg-gray-50 text-gray-900'
                : 'bg-orange-50 border-orange-200 text-orange-900'
            }`}
          >
            <WifiOff size={18} />
            <span className="text-sm font-semibold">
              {connection === 'online' ? 'Simulate Network Loss' : 'Restore Network'}
            </span>
          </button>
          {connection === 'offline' && (
            <p className="mt-3 text-sm text-gray-500">
              You're in offline mode. Go to the{' '}
              <button
                onClick={() => setScreen('offline')}
                className="text-gray-900 font-semibold underline underline-offset-2"
              >
                offline relay screen
              </button>{' '}
              to share state with another device.
            </p>
          )}

          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => openRelay('scan')}
              className="inline-flex items-center gap-3 px-5 py-4 rounded-2xl border bg-white border-gray-200 hover:bg-gray-50 text-gray-900 transition-all duration-300"
            >
              <QrCode size={18} />
              <span className="text-sm font-semibold">Demo Relay Scan</span>
            </button>
            <button
              onClick={runConflictDemo}
              className="inline-flex items-center gap-3 px-5 py-4 rounded-2xl border bg-white border-gray-200 hover:bg-gray-50 text-gray-900 transition-all duration-300"
            >
              <AlertTriangle size={18} />
              <span className="text-sm font-semibold">Conflict Demo</span>
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Simulate scanning a relay, or trigger a conflict between two devices.
          </p>
        </div>
      </section>

      {/* Create Incident Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Incident">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Building C — Water Leak"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Building C, Floor 2"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button onClick={handleCreate} disabled={!title.trim()} className="flex-1">
              Create
            </Button>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Join Team Modal */}
      <Modal open={showJoin} onClose={() => setShowJoin(false)} title="Join Team">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Enter a team code to join an active incident, or scan a relay QR from another device.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Team Code</label>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="e.g. CAIRN-BLDG-B"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all uppercase tracking-wider"
              autoFocus
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button onClick={handleJoin} className="flex-1">
              Join
            </Button>
            <Button variant="secondary" onClick={() => setShowJoin(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
