import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../../../shared/utils/api';
import { ConditionBadge, IssueStatusBadge, SeverityBadge } from '../../../../shared/components/FireSafety/FsBadge';
import { formatFsDate, formatFsLocation } from '../../../../shared/constants/fireSafety';
import { PageHeader, Card, Modal, Field, EmptyRow, inputClass, btnPrimary, btnSecondary } from './FsShared';

const FsReports = () => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewFilter, setReviewFilter] = useState('pending_review');
  const [detail, setDetail] = useState(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [issueDraft, setIssueDraft] = useState(null);

  const fetchReports = useCallback(() => {
    setLoading(true);
    api.get('/admin/fire-safety/reports', { params: reviewFilter ? { reviewStatus: reviewFilter } : {} })
      .then((d) => setReports(d?.reports || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [reviewFilter]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const openDetail = async (id) => {
    try {
      const d = await api.get(`/admin/fire-safety/reports/${id}`);
      setDetail(d);
      setAdminNotes(d.report.adminNotes || '');
    } catch { /* toast shown */ }
  };

  const markReviewed = async () => {
    try {
      await api.patch(`/admin/fire-safety/reports/${detail.report._id}/review`, { adminNotes });
      toast.success('Report marked as reviewed.');
      await openDetail(detail.report._id);
      fetchReports();
    } catch { /* toast shown */ }
  };

  const createIssue = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/fire-safety/issues', { reportId: detail.report._id, ...issueDraft });
      toast.success('Issue created. Manage it under Issues & Alerts.');
      setIssueDraft(null);
      await openDetail(detail.report._id);
    } catch { /* toast shown */ }
  };

  const report = detail?.report;

  return (
    <div className="space-y-6">
      <PageHeader title="Inspection Reports" subtitle="Reports submitted by workers. Reports are never overwritten — each visit is a new record." />
      <Card>
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit mb-4">
          {[['pending_review', 'Pending Review'], ['reviewed', 'Reviewed'], ['', 'All']].map(([v, l]) => (
            <button key={l} type="button" onClick={() => setReviewFilter(v)}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold ${reviewFilter === v ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}>{l}</button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                <th className="py-3 pr-3">Report</th><th className="py-3 px-3">Customer</th><th className="py-3 px-3">Worker</th>
                <th className="py-3 px-3">Results</th><th className="py-3 pl-3">Inspected</th>
              </tr>
            </thead>
            <tbody>
              {reports.length === 0 ? <EmptyRow loading={loading} colSpan={5} text="No reports." /> : reports.map((r) => (
                <tr key={r._id} onClick={() => openDetail(r._id)} className="border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50">
                  <td className="py-3 pr-3"><p className="font-mono text-xs text-gray-500">{r.reportNumber}</p><p className="font-semibold text-gray-800">{r.taskId?.title}</p></td>
                  <td className="py-3 px-3">{r.userId?.name}</td>
                  <td className="py-3 px-3">{r.workerId?.name}</td>
                  <td className="py-3 px-3"><div className="flex flex-wrap gap-1">{r.items.map((i) => <ConditionBadge key={i.equipmentId} value={i.condition} />)}</div></td>
                  <td className="py-3 pl-3 text-xs text-gray-500">{formatFsDate(r.inspectedAt, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {report && (
        <Modal wide title={`Report ${report.reportNumber}`} onClose={() => { setDetail(null); setIssueDraft(null); }}>
          <div className="text-sm text-gray-700 space-y-1">
            <p>Task: {report.taskId?.title} ({report.taskId?.taskNumber})</p>
            <p>Customer: {report.userId?.name} · {report.userId?.phone || report.userId?.email}</p>
            <p>Location: {formatFsLocation(report.location)}</p>
            <p>Worker: {report.workerId?.name} · Inspected {formatFsDate(report.inspectedAt, true)} · Submitted {formatFsDate(report.submittedAt, true)}</p>
          </div>
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {report.items.map((item) => (
              <li key={item.equipmentId} className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm">{item.equipmentName}</span>
                  <ConditionBadge value={item.condition} />
                </div>
                {item.observations && <p className="text-xs text-gray-600">{item.observations}</p>}
                {item.photos?.length > 0 && <div className="flex gap-2 flex-wrap">{item.photos.map((p) => <a key={p} href={p} target="_blank" rel="noreferrer"><img src={p} alt="Evidence" className="w-16 h-16 rounded-lg object-cover border" /></a>)}</div>}
                <button type="button" className="text-xs font-semibold text-primary-600"
                  onClick={() => setIssueDraft({ equipmentId: item.equipmentId, title: `${item.equipmentName}: `, description: item.observations || '', severity: 'medium' })}>
                  + Create issue for this equipment
                </button>
              </li>
            ))}
          </ul>
          {report.notes && <p className="text-sm"><span className="font-semibold">Worker notes:</span> {report.notes}</p>}

          {issueDraft && (
            <form onSubmit={createIssue} className="p-4 rounded-xl border border-primary-200 bg-primary-50/40 space-y-3">
              <Field label="Issue (customer-facing) *"><input required value={issueDraft.title} onChange={(e) => setIssueDraft({ ...issueDraft, title: e.target.value })} className={inputClass} /></Field>
              <Field label="Description (customer-facing)"><textarea rows={2} value={issueDraft.description} onChange={(e) => setIssueDraft({ ...issueDraft, description: e.target.value })} className={inputClass} /></Field>
              <Field label="Severity">
                <select value={issueDraft.severity} onChange={(e) => setIssueDraft({ ...issueDraft, severity: e.target.value })} className={inputClass}>
                  {['low', 'medium', 'high', 'critical'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <div className="flex gap-2"><button type="submit" className={btnPrimary}>Create Issue</button><button type="button" className={btnSecondary} onClick={() => setIssueDraft(null)}>Cancel</button></div>
            </form>
          )}

          <h4 className="font-bold text-gray-800">Issues from this report</h4>
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {detail.issues.length === 0 && <li className="p-3 text-sm text-gray-500">No issues.</li>}
            {detail.issues.map((i) => (
              <li key={i._id} className="p-3 text-sm flex items-center justify-between gap-2">
                <span>{i.issueNumber} · {i.title} {i.createdBy === 'system' && <span className="text-[10px] text-gray-400">(system suggested)</span>}</span>
                <span className="flex gap-1"><SeverityBadge value={i.severity} /><IssueStatusBadge value={i.status} /></span>
              </li>
            ))}
          </ul>

          <Field label="Internal admin notes (never shown to customer)">
            <textarea rows={2} value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} className={inputClass} />
          </Field>
          <button type="button" className={btnPrimary} onClick={markReviewed}>{report.reviewStatus === 'reviewed' ? 'Save Notes' : 'Mark Reviewed'}</button>
        </Modal>
      )}
    </div>
  );
};

export default FsReports;
