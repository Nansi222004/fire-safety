import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiArrowLeft, FiMapPin, FiPhone, FiUser, FiCamera, FiX, FiPlay, FiSend } from 'react-icons/fi';
import api from '../../../shared/utils/api';
import { TaskStatusBadge, ConditionBadge } from '../../../shared/components/FireSafety/FsBadge';
import {
  CONDITION_OPTIONS,
  EQUIPMENT_TYPE_LABELS,
  formatFsDate,
  formatFsLocation,
} from '../../../shared/constants/fireSafety';

const toLocalInput = (date = new Date()) => {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const EquipmentForm = ({ equipment, value, onChange }) => {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, 5 - value.photos.length);
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append('images', f));
      const uploaded = await api.post('/worker/uploads/images', formData);
      onChange({ ...value, photos: [...value.photos, ...(uploaded || []).map((u) => u.url)].slice(0, 5) });
    } catch {
      // toast shown by API client
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-[#0F172A]">{equipment.name}</p>
          <p className="text-xs text-[#64748B]">
            {EQUIPMENT_TYPE_LABELS[equipment.equipmentType]}
            {equipment.details?.capacity ? ` · ${equipment.details.capacity}` : ''}
            {equipment.details?.serialNumber ? ` · S/N ${equipment.details.serialNumber}` : ''}
          </p>
          {equipment.details?.placement && <p className="text-xs text-[#64748B]">Placement: {equipment.details.placement}</p>}
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase text-[#94A3B8] font-bold">Last status</p>
          <ConditionBadge value={equipment.currentStatus} />
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-[#1F2937] uppercase tracking-wider mb-2">Condition *</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CONDITION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ ...value, condition: opt.value })}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border text-left ${
                value.condition === opt.value
                  ? opt.value === 'ok' ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'bg-red-50 border-[#E31E24] text-[#E31E24]'
                  : 'bg-white border-[#E5E7EB] text-[#64748B] hover:border-slate-300'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="block text-xs font-bold text-[#1F2937] uppercase tracking-wider mb-1.5">Observations</span>
        <textarea
          rows={2}
          maxLength={2000}
          value={value.observations}
          onChange={(e) => onChange({ ...value, observations: e.target.value })}
          placeholder="e.g. Pressure gauge in red zone, seal intact"
          className="w-full px-3 py-2 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-sm focus:outline-none focus:border-[#E31E24]"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        {value.photos.map((url) => (
          <div key={url} className="relative w-16 h-16 rounded-lg overflow-hidden border border-[#E5E7EB]">
            <img src={url} alt="Evidence" className="w-full h-full object-cover" />
            <button
              type="button"
              aria-label="Remove photo"
              onClick={() => onChange({ ...value, photos: value.photos.filter((p) => p !== url) })}
              className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/60 text-white">
              <FiX className="text-[10px]" />
            </button>
          </div>
        ))}
        {value.photos.length < 5 && (
          <label className="w-16 h-16 rounded-lg border-2 border-dashed border-[#E5E7EB] flex flex-col items-center justify-center text-[10px] text-[#64748B] cursor-pointer hover:border-[#E31E24]">
            <FiCamera className="text-base mb-0.5" />
            {uploading ? '…' : 'Photo'}
            <input type="file" accept="image/*" capture="environment" multiple className="hidden" disabled={uploading} onChange={handleUpload} />
          </label>
        )}
      </div>
    </div>
  );
};

const WorkerTaskDetail = () => {
  const { taskId } = useParams();
  const [task, setTask] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({});
  const [notes, setNotes] = useState('');
  const [inspectedAt, setInspectedAt] = useState(toLocalInput());
  const [busy, setBusy] = useState(false);

  const load = () =>
    api.get(`/worker/tasks/${taskId}`)
      .then((d) => {
        setTask(d.task);
        setReport(d.report);
        setForm(Object.fromEntries((d.task.equipmentIds || []).map((e) => [e._id, { condition: '', observations: '', photos: [] }])));
      })
      .catch((err) => setError(err.message || 'Task not available.'));

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [taskId]);

  const handleStart = async () => {
    setBusy(true);
    try {
      await api.patch(`/worker/tasks/${taskId}/start`);
      setTask((t) => ({ ...t, status: 'in_progress' }));
      toast.success('Inspection started.');
    } catch { /* toast shown */ } finally { setBusy(false); }
  };

  const handleSubmit = async () => {
    const items = Object.entries(form).map(([equipmentId, v]) => ({ equipmentId, ...v }));
    if (items.some((i) => !i.condition)) {
      toast.error('Select a condition for every equipment item.');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/worker/tasks/${taskId}/report`, { items, notes, inspectedAt: new Date(inspectedAt).toISOString() });
      toast.success('Inspection report submitted.');
      await load();
    } catch { /* toast shown */ } finally { setBusy(false); }
  };

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-8 text-center space-y-3">
        <p className="text-sm text-[#64748B]">{error}</p>
        <Link to="/worker/tasks" className="text-sm font-semibold text-[#E31E24]">Back to My Tasks</Link>
      </div>
    );
  }
  if (!task) return <p className="text-sm text-[#64748B]">Loading…</p>;

  const canSubmit = task.status === 'in_progress' || task.status === 'assigned';

  return (
    <div className="space-y-5 max-w-3xl">
      <Link to="/worker/tasks" className="inline-flex items-center gap-1 text-sm font-semibold text-[#64748B] hover:text-[#0F172A]">
        <FiArrowLeft /> My Tasks
      </Link>

      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 space-y-3 shadow-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-[#94A3B8]">{task.taskNumber}</span>
          <TaskStatusBadge value={task.status} />
        </div>
        <h1 className="text-xl font-extrabold text-[#0F172A]">{task.title}</h1>
        {task.instructions && <p className="text-sm text-[#1F2937] whitespace-pre-line">{task.instructions}</p>}
        <div className="grid sm:grid-cols-2 gap-2 text-sm text-[#1F2937]">
          <p className="flex items-center gap-2"><FiUser className="text-[#64748B]" /> {task.userId?.name}</p>
          {task.userId?.phone && (
            <a href={`tel:${task.userId.phone}`} className="flex items-center gap-2 text-[#E31E24] font-semibold"><FiPhone /> {task.userId.phone}</a>
          )}
          <p className="flex items-start gap-2 sm:col-span-2"><FiMapPin className="text-[#64748B] mt-0.5" /> {formatFsLocation(task.location)}</p>
          <p className="text-xs text-[#64748B]">Inspection date: {formatFsDate(task.scheduledDate)}</p>
          {task.dueDate && <p className="text-xs text-[#64748B]">Due: {formatFsDate(task.dueDate)}</p>}
        </div>
        {task.status === 'assigned' && (
          <button type="button" disabled={busy} onClick={handleStart}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F172A] hover:bg-slate-800 disabled:opacity-60 text-white rounded-xl text-sm font-bold">
            <FiPlay /> Start Inspection
          </button>
        )}
      </div>

      {report ? (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 space-y-3">
          <h2 className="font-bold text-[#0F172A]">Submitted report {report.reportNumber}</h2>
          <p className="text-xs text-[#64748B]">Inspected {formatFsDate(report.inspectedAt, true)} · Submitted {formatFsDate(report.submittedAt, true)}</p>
          <ul className="divide-y divide-[#E5E7EB]">
            {report.items.map((item) => (
              <li key={item.equipmentId} className="py-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm">{item.equipmentName}</span>
                  <ConditionBadge value={item.condition} />
                </div>
                {item.observations && <p className="text-xs text-[#64748B]">{item.observations}</p>}
                {item.photos?.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {item.photos.map((p) => <a key={p} href={p} target="_blank" rel="noreferrer"><img src={p} alt="Evidence" className="w-14 h-14 rounded-lg object-cover border" /></a>)}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {report.notes && <p className="text-sm text-[#1F2937]"><span className="font-semibold">Notes:</span> {report.notes}</p>}
        </div>
      ) : canSubmit ? (
        <div className="space-y-4">
          <h2 className="font-bold text-[#0F172A]">Inspection form</h2>
          {(task.equipmentIds || []).map((equipment) => (
            <EquipmentForm
              key={equipment._id}
              equipment={equipment}
              value={form[equipment._id] || { condition: '', observations: '', photos: [] }}
              onChange={(v) => setForm((prev) => ({ ...prev, [equipment._id]: v }))}
            />
          ))}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-4 space-y-3">
            <label className="block">
              <span className="block text-xs font-bold text-[#1F2937] uppercase tracking-wider mb-1.5">Inspection date & time</span>
              <input type="datetime-local" value={inspectedAt} max={toLocalInput()} onChange={(e) => setInspectedAt(e.target.value)}
                className="px-3 py-2 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-sm" />
            </label>
            <label className="block">
              <span className="block text-xs font-bold text-[#1F2937] uppercase tracking-wider mb-1.5">General notes</span>
              <textarea rows={3} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl text-sm focus:outline-none focus:border-[#E31E24]" />
            </label>
            <button type="button" disabled={busy} onClick={handleSubmit}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#E31E24] hover:bg-[#C8191F] disabled:opacity-60 text-white rounded-xl text-sm font-bold">
              <FiSend /> {busy ? 'Submitting…' : 'Submit Inspection Report'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default WorkerTaskDetail;
