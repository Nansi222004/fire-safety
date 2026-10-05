import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FiPlus, FiCopy, FiKey } from 'react-icons/fi';
import api from '../../../../shared/utils/api';
import { TaskStatusBadge } from '../../../../shared/components/FireSafety/FsBadge';
import { formatFsDate } from '../../../../shared/constants/fireSafety';
import { PageHeader, Card, Modal, Field, EmptyRow, inputClass, btnPrimary, btnSecondary } from './FsShared';

const CredentialsBox = ({ credentials }) => {
  const text = `Inspector login: ${window.location.origin}/worker/login\nEmail: ${credentials.email}\nPassword: ${credentials.password}`;
  return (
    <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
      <p className="text-sm font-bold text-emerald-800">Share these credentials with the worker. The password is shown only once.</p>
      <pre className="text-xs bg-white border border-emerald-100 rounded-lg p-3 whitespace-pre-wrap break-all">{text}</pre>
      <button type="button" className={btnSecondary} onClick={() => navigator.clipboard?.writeText(text).then(() => toast.success('Copied'))}>
        <FiCopy /> Copy
      </button>
    </div>
  );
};

const FsWorkers = () => {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [credentials, setCredentials] = useState(null);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);

  const fetchWorkers = useCallback(() => {
    setLoading(true);
    api.get('/admin/fire-safety/workers', { params: search ? { search } : {} })
      .then((d) => setWorkers(d?.workers || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => {
    const handle = setTimeout(fetchWorkers, 250);
    return () => clearTimeout(handle);
  }, [fetchWorkers]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const d = await api.post('/admin/fire-safety/workers', form);
      setCredentials(d.credentials);
      setForm({ name: '', email: '', phone: '', password: '' });
      toast.success('Worker created.');
      fetchWorkers();
    } catch { /* toast shown */ } finally { setSaving(false); }
  };

  const toggleActive = async (worker) => {
    try {
      await api.patch(`/admin/fire-safety/workers/${worker._id}`, { isActive: !worker.isActive });
      toast.success(worker.isActive ? 'Worker deactivated.' : 'Worker activated.');
      fetchWorkers();
    } catch { /* toast shown */ }
  };

  const resetPassword = async (worker) => {
    try {
      const d = await api.post(`/admin/fire-safety/workers/${worker._id}/reset-password`);
      setCredentials(d.credentials);
      setShowCreate(true);
    } catch { /* toast shown */ }
  };

  const openDetail = async (worker) => {
    try {
      setDetail(await api.get(`/admin/fire-safety/workers/${worker._id}`));
    } catch { /* toast shown */ }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workers / Inspectors"
        subtitle="Field inspectors with a restricted portal — they only see tasks assigned to them."
        action={<button type="button" className={btnPrimary} onClick={() => { setCredentials(null); setShowCreate(true); }}><FiPlus /> Create Worker</button>}
      />
      <Card>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search workers…" className={`${inputClass} mb-4`} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                <th className="py-3 pr-3">Worker</th><th className="py-3 px-3">Mobile</th><th className="py-3 px-3">Open / Total Tasks</th>
                <th className="py-3 px-3">Last Login</th><th className="py-3 px-3">Status</th><th className="py-3 pl-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {workers.length === 0 ? <EmptyRow loading={loading} colSpan={6} text="No workers yet." /> : workers.map((w) => (
                <tr key={w._id} className="border-b border-gray-100 last:border-0">
                  <td className="py-3 pr-3"><button type="button" onClick={() => openDetail(w)} className="text-left"><p className="font-semibold text-gray-800 hover:text-primary-600">{w.name}</p><p className="text-xs text-gray-500">{w.email}</p></button></td>
                  <td className="py-3 px-3">{w.phone || '—'}</td>
                  <td className="py-3 px-3">{w.openTasks} / {w.totalTasks}</td>
                  <td className="py-3 px-3 text-xs text-gray-500">{formatFsDate(w.lastLoginAt, true)}</td>
                  <td className="py-3 px-3">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${w.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{w.isActive ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td className="py-3 pl-3 text-right whitespace-nowrap space-x-2">
                    <button type="button" onClick={() => resetPassword(w)} className="text-xs font-semibold text-gray-600 hover:text-gray-900 inline-flex items-center gap-1"><FiKey /> Reset password</button>
                    <button type="button" onClick={() => toggleActive(w)} className={`text-xs font-semibold ${w.isActive ? 'text-red-600' : 'text-emerald-600'}`}>{w.isActive ? 'Deactivate' : 'Activate'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {showCreate && (
        <Modal title={credentials ? 'Worker Credentials' : 'Create Worker'} onClose={() => { setShowCreate(false); setCredentials(null); }}>
          {credentials ? <CredentialsBox credentials={credentials} /> : (
            <form onSubmit={handleCreate} className="space-y-4">
              <Field label="Name *"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} /></Field>
              <Field label="Email (login) *"><input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} /></Field>
              <Field label="Mobile"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={10} className={inputClass} /></Field>
              <Field label="Password (leave blank to auto-generate)"><input type="text" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputClass} /></Field>
              <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Creating…' : 'Create Worker'}</button>
            </form>
          )}
        </Modal>
      )}

      {detail && (
        <Modal wide title={detail.worker.name} onClose={() => setDetail(null)}>
          <p className="text-sm text-gray-600">{detail.worker.email}{detail.worker.phone ? ` · ${detail.worker.phone}` : ''}</p>
          <h4 className="font-bold text-gray-800">Assigned tasks</h4>
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {detail.tasks.length === 0 && <li className="p-3 text-sm text-gray-500">No tasks.</li>}
            {detail.tasks.map((t) => (
              <li key={t._id} className="p-3 flex items-center justify-between gap-2 text-sm">
                <div><p className="font-semibold">{t.title}</p><p className="text-xs text-gray-500">{t.taskNumber} · {t.userId?.name} · {formatFsDate(t.scheduledDate)}</p></div>
                <TaskStatusBadge value={t.status} />
              </li>
            ))}
          </ul>
          <h4 className="font-bold text-gray-800">Submitted reports</h4>
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {detail.reports.length === 0 && <li className="p-3 text-sm text-gray-500">No reports.</li>}
            {detail.reports.map((r) => (
              <li key={r._id} className="p-3 text-sm flex justify-between gap-2">
                <span>{r.reportNumber} · {r.userId?.name}</span>
                <span className="text-xs text-gray-500">{formatFsDate(r.inspectedAt, true)} · {r.reviewStatus === 'reviewed' ? 'Reviewed' : 'Pending review'}</span>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
};

export default FsWorkers;
