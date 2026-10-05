// Labels for the Fire Safety Inspection & Equipment Monitoring module (mirrors backend enums).

export const EQUIPMENT_TYPE_LABELS = {
  fire_extinguisher: 'Fire Extinguisher',
  fire_alarm: 'Fire Alarm',
  smoke_detector: 'Smoke Detector',
  hydrant_system: 'Hydrant System',
  fire_pump: 'Fire Pump',
  sprinkler_system: 'Sprinkler System',
  other: 'Other',
};

export const CONDITION_OPTIONS = [
  { value: 'ok', label: 'OK / Working Properly' },
  { value: 'needs_refill', label: 'Needs Refill' },
  { value: 'needs_maintenance', label: 'Needs Maintenance' },
  { value: 'not_working', label: 'Not Working' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'needs_replacement', label: 'Needs Replacement' },
];

export const CONDITION_LABELS = {
  not_inspected: 'Not Inspected',
  ...Object.fromEntries(CONDITION_OPTIONS.map((o) => [o.value, o.label])),
};

export const CONDITION_TONES = {
  not_inspected: 'bg-slate-100 text-slate-600 border-slate-200',
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  needs_refill: 'bg-amber-50 text-amber-700 border-amber-200',
  needs_maintenance: 'bg-amber-50 text-amber-700 border-amber-200',
  not_working: 'bg-red-50 text-red-700 border-red-200',
  damaged: 'bg-red-50 text-red-700 border-red-200',
  needs_replacement: 'bg-red-50 text-red-700 border-red-200',
};

export const TASK_STATUS_LABELS = {
  pending: 'Pending',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  submitted: 'Submitted',
  reviewed: 'Reviewed',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const TASK_STATUS_TONES = {
  pending: 'bg-slate-100 text-slate-600 border-slate-200',
  assigned: 'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
  submitted: 'bg-purple-50 text-purple-700 border-purple-200',
  reviewed: 'bg-sky-50 text-sky-700 border-sky-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
};

export const ISSUE_STATUS_LABELS = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed' };
export const SEVERITY_TONES = {
  low: 'bg-slate-100 text-slate-600 border-slate-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  high: 'bg-red-50 text-red-700 border-red-200',
  critical: 'bg-red-600 text-white border-red-600',
};

export const formatFsDate = (value, withTime = false) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return withTime
    ? d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const formatFsLocation = (loc = {}) =>
  [loc?.label, loc?.address, loc?.city, loc?.state, loc?.zipCode].filter(Boolean).join(', ');
