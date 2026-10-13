import type { AppData, Incident, Task, Request, TimelineEntry, ConflictRecord } from '@/types';

// ─── Types ───────────────────────────────────────────────────────────

export interface IncidentBriefInput {
  incidentTitle: string;
  incidentLocation: string;
  incidentStatus: string;
  tasks: { title: string; status: string }[];
  requests: { title: string; quantity: number; fulfilled: boolean }[];
  timeline: { message: string; kind: string; createdAt: number }[];
  unresolvedConflicts: { entityName: string; entityType: string }[];
}

export interface IncidentBrief {
  situation: string;
  completedItems: string[];
  outstandingItems: string[];
  openRequests: string[];
  nextActions: string[];
  uncertainties: string[];
  generatedAt: string;
  source: 'ai' | 'local';
}

// ─── Limits ──────────────────────────────────────────────────────────

export const MAX_TASKS = 30;
export const MAX_REQUESTS = 20;
export const MAX_TIMELINE = 15;
export const MAX_FIELD_LENGTH = 200;
export const MAX_TITLE_LENGTH = 100;

// ─── Data preparation ────────────────────────────────────────────────

function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + '...';
}

export function prepareBriefInput(
  data: AppData,
  incidentId: string
): IncidentBriefInput | null {
  const incident = data.incidents.find((i) => i.id === incidentId);
  if (!incident) return null;

  const tasks = data.tasks
    .filter((t) => t.incidentId === incidentId)
    .slice(0, MAX_TASKS)
    .map((t) => ({
      title: clamp(t.title, MAX_FIELD_LENGTH),
      status: t.status,
    }));

  const requests = data.requests
    .filter((r) => r.incidentId === incidentId)
    .slice(0, MAX_REQUESTS)
    .map((r) => ({
      title: clamp(r.title, MAX_FIELD_LENGTH),
      quantity: r.quantity,
      fulfilled: r.fulfilled,
    }));

  const timeline = data.timeline
    .filter((t) => t.incidentId === incidentId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_TIMELINE)
    .map((t) => ({
      message: clamp(t.message, MAX_FIELD_LENGTH),
      kind: t.kind,
      createdAt: t.createdAt,
    }));

  const unresolvedConflicts = (data.conflicts ?? [])
    .filter((c) => c.incidentId === incidentId && c.status === 'unresolved')
    .map((c) => ({
      entityName: clamp(c.entityName, MAX_FIELD_LENGTH),
      entityType: c.entityType,
    }));

  return {
    incidentTitle: clamp(incident.title, MAX_TITLE_LENGTH),
    incidentLocation: clamp(incident.location, MAX_FIELD_LENGTH),
    incidentStatus: incident.status,
    tasks,
    requests,
    timeline,
    unresolvedConflicts,
  };
}

// ─── Validation ──────────────────────────────────────────────────────

export function validateBrief(raw: unknown): IncidentBrief | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  const situation = typeof obj.situation === 'string' ? obj.situation : null;
  if (!situation || situation.length === 0) return null;

  const completedItems = Array.isArray(obj.completedItems)
    ? obj.completedItems.filter((s): s is string => typeof s === 'string')
    : [];
  const outstandingItems = Array.isArray(obj.outstandingItems)
    ? obj.outstandingItems.filter((s): s is string => typeof s === 'string')
    : [];
  const openRequests = Array.isArray(obj.openRequests)
    ? obj.openRequests.filter((s): s is string => typeof s === 'string')
    : [];
  const nextActions = Array.isArray(obj.nextActions)
    ? obj.nextActions.filter((s): s is string => typeof s === 'string')
    : [];
  const uncertainties = Array.isArray(obj.uncertainties)
    ? obj.uncertainties.filter((s): s is string => typeof s === 'string')
    : [];

  const generatedAt =
    typeof obj.generatedAt === 'string'
      ? obj.generatedAt
      : new Date().toISOString();

  const source: 'ai' | 'local' =
    obj.source === 'ai' || obj.source === 'local' ? obj.source : 'ai';

  return {
    situation,
    completedItems,
    outstandingItems,
    openRequests,
    nextActions,
    uncertainties,
    generatedAt,
    source,
  };
}

// ─── Local brief (deterministic, offline fallback) ───────────────────

export function generateLocalBrief(input: IncidentBriefInput): IncidentBrief {
  const completed = input.tasks.filter((t) => t.status === 'completed');
  const outstanding = input.tasks.filter((t) => t.status !== 'completed');
  const openReqs = input.requests.filter((r) => !r.fulfilled);

  const situation = `Incident "${input.incidentTitle}" at ${input.incidentLocation} is currently ${input.incidentStatus}. ${completed.length} of ${input.tasks.length} tasks completed. ${openReqs.length} of ${input.requests.length} requests remain unfulfilled.`;

  const completedItems = completed.map((t) => t.title);
  const outstandingItems = outstanding.map((t) => t.title);
  const openRequests = input.requests.map(
    (r) => `${r.title} (x${r.quantity}) — ${r.fulfilled ? 'fulfilled' : 'not fulfilled'}`
  );

  const nextActions: string[] = [];
  for (const t of outstanding) {
    nextActions.push(`Complete: ${t.title}`);
  }
  for (const r of openReqs) {
    nextActions.push(`Fulfil request: ${r.title} (x${r.quantity})`);
  }
  if (input.unresolvedConflicts.length > 0) {
    nextActions.push(`Resolve ${input.unresolvedConflicts.length} pending conflict(s)`);
  }

  const uncertainties: string[] = [];
  if (input.timeline.length === 0) {
    uncertainties.push('No timeline events recorded — incident history is not available.');
  }
  if (input.tasks.length === 0) {
    uncertainties.push('No tasks recorded — operational status cannot be confirmed.');
  }
  if (input.requests.length === 0) {
    uncertainties.push('No requests recorded — resource needs are not known.');
  }
  for (const c of input.unresolvedConflicts) {
    uncertainties.push(`Conflict on ${c.entityType} "${c.entityName}" is unresolved — true state is uncertain.`);
  }
  if (input.incidentStatus === 'active') {
    uncertainties.push('Incident is still active — resolution is not confirmed.');
  }

  return {
    situation,
    completedItems,
    outstandingItems,
    openRequests,
    nextActions,
    uncertainties,
    generatedAt: new Date().toISOString(),
    source: 'local',
  };
}

// ─── Clipboard formatting ────────────────────────────────────────────

export function formatBriefForClipboard(brief: IncidentBrief, incidentTitle: string): string {
  const lines: string[] = [];
  lines.push(`CAIRN INCIDENT BRIEF — ${incidentTitle}`);
  lines.push(`Generated: ${brief.generatedAt}`);
  lines.push(`Source: ${brief.source === 'ai' ? 'AI-generated' : 'Local (on-device)'}`);
  lines.push('');
  lines.push('SITUATION');
  lines.push(brief.situation);
  lines.push('');
  lines.push('COMPLETED');
  if (brief.completedItems.length > 0) {
    brief.completedItems.forEach((item) => lines.push(`  - ${item}`));
  } else {
    lines.push('  (none)');
  }
  lines.push('');
  lines.push('OUTSTANDING');
  if (brief.outstandingItems.length > 0) {
    brief.outstandingItems.forEach((item) => lines.push(`  - ${item}`));
  } else {
    lines.push('  (none)');
  }
  lines.push('');
  lines.push('OPEN REQUESTS');
  if (brief.openRequests.length > 0) {
    brief.openRequests.forEach((item) => lines.push(`  - ${item}`));
  } else {
    lines.push('  (none)');
  }
  lines.push('');
  lines.push('NEXT ACTIONS');
  if (brief.nextActions.length > 0) {
    brief.nextActions.forEach((item) => lines.push(`  - ${item}`));
  } else {
    lines.push('  (none)');
  }
  lines.push('');
  lines.push('UNCERTAINTIES');
  if (brief.uncertainties.length > 0) {
    brief.uncertainties.forEach((item) => lines.push(`  - ${item}`));
  } else {
    lines.push('  (none)');
  }
  return lines.join('\n');
}

// ─── Client API ──────────────────────────────────────────────────────

export type BriefErrorCode =
  | 'offline'
  | 'server_not_configured'
  | 'service_unavailable'
  | 'rate_limited'
  | 'invalid_response'
  | 'request_too_large'
  | 'network_error';

export class BriefError extends Error {
  code: BriefErrorCode;
  constructor(code: BriefErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'BriefError';
  }
}

export async function fetchAIBrief(input: IncidentBriefInput): Promise<IncidentBrief> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new BriefError('server_not_configured', 'AI service is not configured for this project.');
  }

  const body = JSON.stringify(input);

  // Client-side size guard (server validates too)
  if (body.length > 20000) {
    throw new BriefError('request_too_large', 'Incident data is too large to send for AI processing.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/incident-brief`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body,
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (response.status === 429) {
      throw new BriefError('rate_limited', 'Rate limit reached. Please try again in a moment.');
    }
    if (response.status === 503) {
      throw new BriefError('service_unavailable', 'AI service is temporarily unavailable.');
    }
    if (response.status === 400) {
      const errBody = await response.json().catch(() => ({}));
      if (errBody.error === 'request_too_large') {
        throw new BriefError('request_too_large', 'Incident data is too large to send for AI processing.');
      }
      throw new BriefError('invalid_response', 'The server rejected the request.');
    }
    if (!response.ok) {
      throw new BriefError('service_unavailable', 'AI service returned an unexpected error.');
    }

    const data = await response.json();
    const brief = validateBrief(data.brief ?? data);
    if (!brief) {
      throw new BriefError('invalid_response', 'The AI response was not in the expected format.');
    }
    brief.source = 'ai';
    return brief;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof BriefError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new BriefError('service_unavailable', 'The request timed out. Please try again.');
    }
    if (err instanceof TypeError) {
      throw new BriefError('network_error', 'Could not reach the AI service. Check your connection.');
    }
    throw new BriefError('network_error', 'An unexpected network error occurred.');
  }
}
