import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FiBell, FiTrash2 } from 'react-icons/fi';
import api from '../../../../shared/utils/api';
import { ConditionBadge, IssueStatusBadge, SeverityBadge } from '../../../../shared/components/FireSafety/FsBadge';
import { ISSUE_STATUS_LABELS, formatFsDate, formatFsLocation } from '../../../../shared/constants/fireSafety';
import { PageHeader, Card, Modal, Field, EmptyRow, RecommendationTargetPicker, inputClass, btnPrimary, btnSecondary } from './FsShared';

const recLabel = (rec) => {
  if (rec.kind === 'service') return rec.serviceId?.name || rec.label;
  if (rec.kind === 'product') return rec.productId?.name || rec.label;
  return rec.vendorId?.storeName || rec.label;
};
const recTargetId = (rec) => (rec[`${rec.kind}Id`]?._id || rec[`${rec.kind}Id`]);

const toDraft = (issue) => ({
  title: issue.title,
  description: issue.description || '',
  internalNotes: issue.internalNotes || '',
  severity: issue.severity,
  status: issue.status,
  customerVisible: issue.customerVisible,
  recommendations: (issue.recommendations || []).map((r) => ({ kind: r.kind, [`${r.kind}Id`]: recTargetId(r), label: recLabel(r), note: r.note || '' })),
});

const FsIssues = () => {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('open');
  const [issue, setIssue] = useState(null);
  const [draft, setDraft] = useState(null);
  const [recKind, setRecKind] = useState('service');
  const [notifyMessage, setNotifyMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const fetchIssues = useCallback(() => {
    setLoading(true);
    api.get('/admin/fire-safety/issues', { params: statusFilter ? { status: statusFilter } : {} })
      .then((d) => setIssues(d?.issues || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => { fetchIssues(); }, [fetchIssues]);

  const open = async (id) => {
    try {
      const d = await api.get(`/admin/fire-safety/issues/${id}`);
      setIssue(d);
      setDraft(toDraft(d));
      setNotifyMessage('');
    } catch { /* toast shown */ }
  };

  const save = async () => {
    setBusy(true);
    try {
      const updated = await api.patch(`/admin/fire-safety/issues/${issue._id}`, {
        ...draft,
        recommendations: draft.recommendations.map(({ label, ...rest }) => rest),
      });
      setIssue(updated);
      setDraft(toDraft(updated));
      toast.success('Issue saved.');
      fetchIssues();
    } catch { /* toast shown */ } finally { setBusy(false); }
  };

  const notify = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/fire-safety/issues/${issue._id}/notify`, notifyMessage ? { message: notifyMessage } : {});
      toast.success('Customer notified. Issue is now visible in My Fire Safety.');
      await open(issue._id);
      fetchIssues();
    } catch { /* toast shown */ } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Issues & Alerts" subtitle="Issues identified from inspections. Choose recommendations and notify the customer." />
      <Card>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${inputClass} sm:w-56 mb-4`}>
          <option value="">All statuses</option>
          {Object.entries(ISSUE_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                <th className="py-3 pr-3">Issue</th><th className="py-3 px-3">Customer</th><th className="py-3 px-3">Equipment</th>
                <th className="py-3 px-3">Result</th><th className="py-3 px-3">Severity</th><th className="py-3 px-3">Customer</th><th className="py-3 pl-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {issues.length === 0 ? <EmptyRow loading={loading} colSpan={7} text="No issues." /> : issues.map((i) => (
                <tr key={i._id} onClick={() => open(i._id)} className="border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50">
                  <td className="py-3 pr-3"><p className="font-semibold text-gray-800">{i.title}</p><p className="text-xs font-mono text-gray-400">{i.issueNumber}</p></td>
                  <td className="py-3 px-3">{i.userId?.name}</td>
                  <td className="py-3 px-3">{i.equipmentId?.name}</td>
                  <td className="py-3 px-3"><ConditionBadge value={i.condition} /></td>
                  <td className="py-3 px-3"><SeverityBadge value={i.severity} /></td>
                  <td className="py-3 px-3 text-xs">{i.notifiedAt ? `Notified ${formatFsDate(i.notifiedAt)}` : i.customerVisible ? 'Visible' : 'Hidden'}</td>
                  <td className="py-3 pl-3"><IssueStatusBadge value={i.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {issue && draft && (
        <Modal wide title={`Issue ${issue.issueNumber}`} onClose={() => { setIssue(null); setDraft(null); }}>
          <div className="text-sm text-gray-700 space-y-1">
            <p>Customer: {issue.userId?.name} · {issue.userId?.phone || issue.userId?.email}</p>
            <p>Equipment: {issue.equipmentId?.name} · {formatFsLocation(issue.equipmentId?.location)}</p>
            <p>Inspection: {issue.reportId?.reportNumber} by {issue.workerId?.name || '—'} on {formatFsDate(issue.reportId?.inspectedAt, true)} · Reported <ConditionBadge value={issue.condition} /></p>
            {issue.supportTicketIds?.length > 0 && <p className="text-amber-700">Customer has opened {issue.supportTicketIds.length} support ticket(s) about this issue.</p>}
          </div>

          <Field label="Issue (customer-facing)"><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={inputClass} /></Field>
          <Field label="Description (customer-facing)"><textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className={inputClass} /></Field>
          <Field label="Internal notes (admin only)"><textarea rows={2} value={draft.internalNotes} onChange={(e) => setDraft({ ...draft, internalNotes: e.target.value })} className={inputClass} /></Field>
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Severity">
              <select value={draft.severity} onChange={(e) => setDraft({ ...draft, severity: e.target.value })} className={inputClass}>
                {['low', 'medium', 'high', 'critical'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} className={inputClass}>
                {Object.entries(ISSUE_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mt-6">
              <input type="checkbox" checked={draft.customerVisible} onChange={(e) => setDraft({ ...draft, customerVisible: e.target.checked })} />
              Visible to customer
            </label>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-gray-800">Recommendations</h4>
            <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
              {draft.recommendations.length === 0 && <li className="p-3 text-sm text-gray-500">No recommendations yet.</li>}
              {draft.recommendations.map((rec, idx) => (
                <li key={`${rec.kind}-${recTargetId(rec)}-${idx}`} className="p-3 flex items-center gap-2 text-sm">
                  <span className="px-2 py-0.5 rounded bg-gray-100 text-[11px] font-bold uppercase">{rec.kind}</span>
                  <span className="flex-1 font-semibold">{rec.label}</span>
                  <input value={rec.note} placeholder="Note (optional)" onChange={(e) => setDraft({ ...draft, recommendations: draft.recommendations.map((r, i) => (i === idx ? { ...r, note: e.target.value } : r)) })} className={`${inputClass} max-w-[200px]`} />
                  <button type="button" aria-label="Remove recommendation" onClick={() => setDraft({ ...draft, recommendations: draft.recommendations.filter((_, i) => i !== idx) })} className="text-red-500"><FiTrash2 /></button>
                </li>
              ))}
            </ul>
            <div className="p-3 rounded-lg bg-gray-50 border border-gray-100 space-y-2">
              <div className="flex gap-1">
                {['service', 'product', 'vendor'].map((k) => (
                  <button key={k} type="button" onClick={() => setRecKind(k)} className={`px-3 py-1 rounded-md text-xs font-semibold capitalize ${recKind === k ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}>{k}</button>
                ))}
              </div>
              <RecommendationTargetPicker
                key={recKind}
                kind={recKind}
                onPick={(t) => setDraft({ ...draft, recommendations: [...draft.recommendations, { kind: recKind, [`${recKind}Id`]: t._id, label: t.label, note: '' }] })}
              />
            </div>
          </div>
          <button type="button" disabled={busy} className={btnPrimary} onClick={save}>Save Issue</button>

          <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 space-y-2">
            <p className="text-sm font-bold text-gray-800">Notify customer</p>
            <p className="text-xs text-gray-600">Sends an in-app/push "Fire Safety Alert" that opens this equipment's issue in My Fire Safety, and makes the issue visible to the customer. Save changes first.</p>
            <input value={notifyMessage} onChange={(e) => setNotifyMessage(e.target.value)} maxLength={500} placeholder={`${issue.equipmentId?.name}: ${issue.title}`} className={inputClass} />
            <button type="button" disabled={busy} className={btnSecondary} onClick={notify}><FiBell /> Send Fire Safety Alert</button>
            {issue.notifiedAt && <p className="text-xs text-gray-500">Last notified {formatFsDate(issue.notifiedAt, true)} ({issue.notificationCount}×)</p>}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default FsIssues;
