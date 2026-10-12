import { useState } from 'react';
import { ArrowLeft, Check, Plus, Package, ListChecks, Clock, Users, AlertTriangle } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

export function IncidentScreen() {
  const { data, connection, activeIncidentId, setScreen, addTask, toggleTask, addRequest, unresolvedConflictCount } = useApp();
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddRequest, setShowAddRequest] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [reqTitle, setReqTitle] = useState('');
  const [reqQty, setReqQty] = useState(1);

  const incident = data.incidents.find((i) => i.id === activeIncidentId);
  if (!incident) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
        <p className="text-gray-400">Incident not found.</p>
      </div>
    );
  }

  const tasks = data.tasks.filter((t) => t.incidentId === incident.id);
  const requests = data.requests.filter((r) => r.incidentId === incident.id);
  const timeline = data.timeline
    .filter((t) => t.incidentId === incident.id)
    .sort((a, b) => b.createdAt - a.createdAt);
  const completedTasks = tasks.filter((t) => t.status === 'completed').length;

  const handleAddTask = () => {
    if (taskTitle.trim()) {
      addTask(incident.id, taskTitle.trim());
      setTaskTitle('');
      setShowAddTask(false);
    }
  };

  const handleAddRequest = () => {
    if (reqTitle.trim()) {
      addRequest(incident.id, reqTitle.trim(), reqQty);
      setReqTitle('');
      setReqQty(1);
      setShowAddRequest(false);
    }
  };

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
          <StatusBadge status={connection} />
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-8">
        {/* Incident Title */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex w-2 h-2 rounded-full bg-red-500" />
            <span className="text-xs font-semibold text-red-600 uppercase tracking-wide">Active</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">
            {incident.title}
          </h1>
          <p className="text-gray-500 mt-2">{incident.location}</p>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-5 text-sm text-gray-500">
            <span className="inline-flex items-center gap-1.5">
              <Users size={15} />
              {incident.members} members
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock size={15} />
              {timeline.length} updates
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ListChecks size={15} />
              {completedTasks}/{tasks.length} tasks
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Package size={15} />
              {requests.length} requests
            </span>
          </div>

          {unresolvedConflictCount > 0 && (
            <button
              onClick={() => setScreen('conflicts')}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm font-semibold hover:bg-amber-100 transition-all"
            >
              <AlertTriangle size={16} />
              {unresolvedConflictCount} conflict{unresolvedConflictCount !== 1 ? 's' : ''} need{unresolvedConflictCount === 1 ? 's' : ''} review
            </button>
          )}
        </div>

        {/* Tasks */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Tasks</h2>
            <button
              onClick={() => setShowAddTask(true)}
              className="inline-flex items-center gap-1 text-sm font-semibold text-gray-900 hover:text-gray-600 transition-colors"
            >
              <Plus size={16} />
              Add
            </button>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden">
            {tasks.map((task, i) => (
              <button
                key={task.id}
                onClick={() => toggleTask(task.id)}
                className={`w-full flex items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-gray-50/50 ${
                  i !== tasks.length - 1 ? 'border-b border-gray-100' : ''
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all duration-200 ${
                    task.status === 'completed'
                      ? 'bg-gray-900 border-gray-900'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {task.status === 'completed' && <Check size={13} className="text-white" />}
                </div>
                <span
                  className={`text-sm flex-1 ${
                    task.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-900 font-medium'
                  }`}
                >
                  {task.title}
                </span>
                <span className="text-xs text-gray-300">{timeAgo(task.createdAt)}</span>
              </button>
            ))}
            {tasks.length === 0 && (
              <p className="px-5 py-8 text-sm text-gray-400 text-center">No tasks yet.</p>
            )}
          </div>
        </section>

        {/* Requests */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Requests</h2>
            <button
              onClick={() => setShowAddRequest(true)}
              className="inline-flex items-center gap-1 text-sm font-semibold text-gray-900 hover:text-gray-600 transition-colors"
            >
              <Plus size={16} />
              Add
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {requests.map((req) => (
              <div
                key={req.id}
                className="bg-white rounded-2xl border border-gray-200/80 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                      <Package size={18} className="text-gray-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{req.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{timeAgo(req.createdAt)}</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center justify-center min-w-[2rem] h-7 px-2 rounded-lg bg-gray-900 text-white text-xs font-bold">
                    ×{req.quantity}
                  </span>
                </div>
              </div>
            ))}
            {requests.length === 0 && (
              <p className="text-sm text-gray-400 col-span-full text-center py-8">No requests yet.</p>
            )}
          </div>
        </section>

        {/* Timeline */}
        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Timeline</h2>
          <div className="relative pl-6">
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-200" />
            {timeline.map((entry) => (
              <div key={entry.id} className="relative pb-5 last:pb-0">
                <div
                  className={`absolute -left-[22px] top-1 w-3.5 h-3.5 rounded-full border-2 border-white ${
                    entry.kind === 'system'
                      ? 'bg-gray-900'
                      : entry.kind === 'task'
                      ? 'bg-blue-500'
                      : entry.kind === 'conflict'
                      ? 'bg-amber-500'
                      : 'bg-amber-500'
                  }`}
                />
                <p className="text-sm text-gray-700">{entry.message}</p>
                <p className="text-xs text-gray-300 mt-0.5">{timeAgo(entry.createdAt)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Add Task Modal */}
      <Modal open={showAddTask} onClose={() => setShowAddTask(false)} title="Add Task">
        <div className="space-y-4">
          <input
            type="text"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            placeholder="e.g. Check fire exits"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
          />
          <div className="flex gap-3 pt-2">
            <Button onClick={handleAddTask} disabled={!taskTitle.trim()} className="flex-1">
              Add Task
            </Button>
            <Button variant="secondary" onClick={() => setShowAddTask(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Request Modal */}
      <Modal open={showAddRequest} onClose={() => setShowAddRequest(false)} title="Add Request">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Item</label>
            <input
              type="text"
              value={reqTitle}
              onChange={(e) => setReqTitle(e.target.value)}
              placeholder="e.g. Walkie-talkie"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Quantity</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setReqQty((q) => Math.max(1, q - 1))}
                className="w-10 h-10 rounded-xl border border-gray-200 text-gray-900 hover:bg-gray-50 transition-colors font-bold"
              >
                −
              </button>
              <span className="w-12 text-center text-lg font-bold text-gray-900">{reqQty}</span>
              <button
                onClick={() => setReqQty((q) => Math.min(99, q + 1))}
                className="w-10 h-10 rounded-xl border border-gray-200 text-gray-900 hover:bg-gray-50 transition-colors font-bold"
              >
                +
              </button>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button onClick={handleAddRequest} disabled={!reqTitle.trim()} className="flex-1">
              Add Request
            </Button>
            <Button variant="secondary" onClick={() => setShowAddRequest(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
