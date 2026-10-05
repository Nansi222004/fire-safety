import {
  CONDITION_LABELS,
  CONDITION_TONES,
  TASK_STATUS_LABELS,
  TASK_STATUS_TONES,
  SEVERITY_TONES,
  ISSUE_STATUS_LABELS,
} from '../../constants/fireSafety';

const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap';

export const ConditionBadge = ({ value }) => (
  <span className={`${base} ${CONDITION_TONES[value] || CONDITION_TONES.not_inspected}`}>
    {CONDITION_LABELS[value] || value || '—'}
  </span>
);

export const TaskStatusBadge = ({ value }) => (
  <span className={`${base} ${TASK_STATUS_TONES[value] || TASK_STATUS_TONES.pending}`}>
    {TASK_STATUS_LABELS[value] || value}
  </span>
);

export const SeverityBadge = ({ value }) => (
  <span className={`${base} capitalize ${SEVERITY_TONES[value] || SEVERITY_TONES.medium}`}>{value}</span>
);

export const IssueStatusBadge = ({ value }) => (
  <span className={`${base} ${value === 'resolved' || value === 'closed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
    {ISSUE_STATUS_LABELS[value] || value}
  </span>
);
