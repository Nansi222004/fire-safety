import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FiPlus } from 'react-icons/fi';
import api from '../../../../shared/utils/api';
import { TaskStatusBadge, ConditionBadge } from '../../../../shared/components/FireSafety/FsBadge';
import { TASK_STATUS_LABELS, EQUIPMENT_TYPE_LABELS, formatFsDate, formatFsLocation } from '../../../../shared/constants/fireSafety';
import { PageHeader, Card, Modal, Field, EmptyRow, CustomerPicker, inputClass, btnPrimary, btnSecondary } from './FsShared';

const emptyTask = { title: 'Fire Safety Equipment Inspection', instructions: '', workerId: '', scheduledDate: '', dueDate: '', equipmentIds: [] };

const FsTasks = () => {
  const [tasks, setTasks] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [customerEquipment, setCustomerEquipment] = useState([]);
  const [form, setForm] = useState(emptyTask);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);

  const fetchTasks = useCallback(() => {
    setLoading(true);
    api.get('/admin/fire-safety/tasks', { params: statusFilter ? { status: statusFilter } : {} })
      .then((d) => setTasks(d?.tasks || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);
  useEffect(() => {
    api.get('/admin/fire-safety/workers', { params: { status: 'active' } }).then((d) => setWorkers(d?.workers || [])).catch(() => {});
  }, []);
  useEffect(() => {
    setCustomerEquipment([]);
    setForm((f) => ({ ...f, equipmentIds: [] }));
    if (!customer) return;
    api.get('/admin/fire-safety/equipment', { params: { userId: customer._id } }).then((d) => setCustomerEquipment(d?.equipment || [])).catch(() => {});
  }, [customer]);

  const toggleEquipment = (id) =>
    setForm((f) => ({ ...f, equipmentIds: f.equipmentIds.includes(id) ? f.equipmentIds.filter((x) => x !== id) : [...f.equipmentIds, id] }));

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!customer) return toast.error('Select a customer.');
    if (!form.equipmentIds.length) return toast.error('Select at least one equipment item.');
    setSaving(true);
    try {
      await api.post('/admin/fire-safety/tasks', {
        ...form,
        userId: customer._id,
        workerId: form.workerId || undefined,
        scheduledDate: form.scheduledDate || undefined,
        dueDate: form.dueDate || undefined,
      });
      toast.success('Inspection task created.');
      setShowCreate(false);
      setForm(emptyTask);
      setCustomer(null);
      fetchTasks();
    } catch { /* toast shown */ } finally { setSaving(false); }
  };

  const openDetail = async (id) => {
    try { setDetail(await api.get(`/admin/fire-safety/tasks/${id}`)); } catch { /* toast shown */ }
  };

  const updateTask = async (payload, message) => {
    try {
      await api.patch(`/admin/fire-safety/tasks/${detail.task._id}`, payload);
      toast.success(message);
      await openDetail(detail.task._id);
      fetchTasks();
    } catch { /* toast shown */ }
  };

  const task = detail?.task;
  const locked = task && ['submitted', 'reviewed', 'completed', 'cancelled'].includes(task.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inspection Tasks"
        subtitle="Create inspection visits and assign them to workers."
        action={<button type="button" className={btnPrimary} onClick={() => { setCustomer(null); setForm(emptyTask); setShowCreate(true); }}><FiPlus /> New Task</button>}
      />
      <Card>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${inputClass} sm:w-56 mb-4`}>
          <option value="">All statuses</option>
          {Object.entries(TASK_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                <th className="py-3 pr-3">Task</th><th className="py-3 px-3">Customer / Location</th><th className="py-3 px-3">Worker</th>
                <th className="py-3 px-3">Equipment</th><th className="py-3 px-3">Inspection Date</th><th className="py-3 pl-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? <EmptyRow loading={loading} colSpan={6} text="No inspection tasks." /> : tasks.map((t) => (
                <tr key={t._id} onClick={() => openDetail(t._id)} className="border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50">
                  <td className="py-3 pr-3"><p className="font-semibold text-gray-800">{t.title}</p><p className="text-xs font-mono text-gray-400">{t.taskNumber}</p></td>
                  <td className="py-3 px-3"><p>{t.userId?.name}</p><p className="text-xs text-gray-500 max-w-[220px] truncate">{formatFsLocation(t.location)}</p></td>
                  <td className="py-3 px-3">{t.workerId?.name || <span className="text-gray-400">Unassigned</span>}</td>
                  <td className="py-3 px-3 text-xs">{(t.equipmentIds || []).map((e) => e.name).join(', ')}</td>
                  <td className="py-3 px-3 text-xs text-gray-500">{formatFsDate(t.scheduledDate)}</td>
                  <td className="py-3 pl-3"><TaskStatusBadge value={t.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {showCreate && (
        <Modal wide title="New Inspection Task" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <Field label="Customer *"><CustomerPicker value={customer} onChange={setCustomer} /></Field>
            {customer && (
              <Field label="Equipment to inspect *">
                {customerEquipment.length === 0 ? (
                  <p className="text-sm text-gray-500">This customer has no equipment yet. Add it under Customer Equipment first.</p>
                ) : (
                  <ul className="border border-gray-100 rounded-lg divide-y divide-gray-100">
                    {customerEquipment.map((eq) => (
                      <li key={eq._id}>
                        <label className="flex items-center gap-3 px-3 py-2 cursor-pointer">
                          <input type="checkbox" checked={form.equipmentIds.includes(eq._id)} onChange={() => toggleEquipment(eq._id)} />
                          <span className="flex-1 text-sm"><span className="font-semibold">{eq.name}</span> <span className="text-gray-500">· {EQUIPMENT_TYPE_LABELS[eq.equipmentType]} · {formatFsLocation(eq.location)}</span></span>
                          <ConditionBadge value={eq.currentStatus} />
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </Field>
            )}
            <Field label="Task *"><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} /></Field>
            <Field label="Instructions"><textarea rows={3} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} className={inputClass} /></Field>
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Assign worker">
                <select value={form.workerId} onChange={(e) => setForm({ ...form, workerId: e.target.value })} className={inputClass}>
                  <option value="">Leave unassigned</option>
                  {workers.map((w) => <option key={w._id} value={w._id}>{w.name}</option>)}
                </select>
              </Field>
              <Field label="Inspection date"><input type="date" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} className={inputClass} /></Field>
              <Field label="Due date"><input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className={inputClass} /></Field>
            </div>
            <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Creating…' : 'Create Task'}</button>
          </form>
        </Modal>
      )}

      {task && (
        <Modal wide title={`${task.title} (${task.taskNumber})`} onClose={() => setDetail(null)}>
          <div className="flex items-center gap-2"><TaskStatusBadge value={task.status} /></div>
          <div className="text-sm text-gray-700 space-y-1">
            <p>Customer: {task.userId?.name} · {task.userId?.phone || task.userId?.email}</p>
            <p>Location: {formatFsLocation(task.location)}</p>
            <p>Inspection date: {formatFsDate(task.scheduledDate)}{task.dueDate ? ` · Due ${formatFsDate(task.dueDate)}` : ''}</p>
            {task.instructions && <p className="whitespace-pre-line">Instructions: {task.instructions}</p>}
          </div>
          {!locked && (
            <Field label="Assigned worker">
              <select value={task.workerId?._id || ''} onChange={(e) => updateTask({ workerId: e.target.value || null }, e.target.value ? 'Worker assigned.' : 'Worker unassigned.')} className={inputClass}>
                <option value="">Unassigned</option>
                {workers.map((w) => <option key={w._id} value={w._id}>{w.name}</option>)}
              </select>
            </Field>
          )}
          {locked && <p className="text-sm">Worker: <span className="font-semibold">{task.workerId?.name || '—'}</span></p>}
          <h4 className="font-bold text-gray-800">Equipment</h4>
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {(task.equipmentIds || []).map((eq) => {
              const item = detail.report?.items?.find((i) => String(i.equipmentId) === String(eq._id));
              return (
                <li key={eq._id} className="p-3 text-sm flex items-center justify-between gap-2">
                  <span>{eq.name} <span className="text-gray-500">· {EQUIPMENT_TYPE_LABELS[eq.equipmentType]}</span></span>
                  <ConditionBadge value={item?.condition || eq.currentStatus} />
                </li>
              );
            })}
          </ul>
          {detail.report && <p className="text-sm">Report {detail.report.reportNumber} submitted {formatFsDate(detail.report.submittedAt, true)} — open it under Inspection Reports for full details.</p>}
          <div className="flex flex-wrap gap-2 pt-2">
            {task.status === 'submitted' && <button type="button" className={btnPrimary} onClick={() => updateTask({ status: 'reviewed' }, 'Task marked reviewed.')}>Mark Reviewed</button>}
            {['submitted', 'reviewed'].includes(task.status) && <button type="button" className={btnPrimary} onClick={() => updateTask({ status: 'completed' }, 'Task completed.')}>Mark Completed</button>}
            {['pending', 'assigned', 'in_progress'].includes(task.status) && <button type="button" className={btnSecondary} onClick={() => updateTask({ status: 'cancelled' }, 'Task cancelled.')}>Cancel Task</button>}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default FsTasks;
