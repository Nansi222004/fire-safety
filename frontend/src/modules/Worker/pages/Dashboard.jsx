import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiChevronRight, FiMapPin, FiCalendar } from 'react-icons/fi';
import api from '../../../shared/utils/api';
import { useWorkerAuthStore } from '../store/workerAuthStore';
import { TaskStatusBadge } from '../../../shared/components/FireSafety/FsBadge';
import { formatFsDate, formatFsLocation } from '../../../shared/constants/fireSafety';

const STAT_CARDS = [
  { key: 'assigned', label: 'Assigned' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'completed', label: 'Completed' },
];

const WorkerDashboard = () => {
  const { worker } = useWorkerAuthStore();
  const [data, setData] = useState({ stats: {}, upcoming: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/worker/dashboard').then((d) => setData(d || { stats: {}, upcoming: [] })).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-[#0F172A]">Hello, {worker?.name?.split(' ')[0] || 'Inspector'}</h1>
        <p className="text-sm text-[#64748B]">Your assigned fire-safety inspections</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {STAT_CARDS.map((card) => (
          <div key={card.key} className="bg-white rounded-2xl border border-[#E5E7EB] p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-[#64748B]">{card.label}</p>
            <p className="text-2xl font-extrabold text-[#0F172A] mt-1">{loading ? '…' : data.stats?.[card.key] ?? 0}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
          <h2 className="font-bold text-[#0F172A]">Up next</h2>
          <Link to="/worker/tasks" className="text-xs font-semibold text-[#E31E24]">View all tasks</Link>
        </div>
        {loading ? (
          <p className="p-5 text-sm text-[#64748B]">Loading…</p>
        ) : data.upcoming.length === 0 ? (
          <p className="p-5 text-sm text-[#64748B]">No open inspections. You're all caught up.</p>
        ) : (
          <ul className="divide-y divide-[#E5E7EB]">
            {data.upcoming.map((task) => (
              <li key={task._id}>
                <Link to={`/worker/tasks/${task._id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-slate-50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-[#0F172A]">{task.title}</span>
                      <TaskStatusBadge value={task.status} />
                    </div>
                    <p className="text-xs text-[#64748B] mt-1 flex items-center gap-1 truncate">
                      <FiMapPin className="flex-shrink-0" /> {task.userId?.name} · {formatFsLocation(task.location)}
                    </p>
                    <p className="text-xs text-[#64748B] mt-0.5 flex items-center gap-1">
                      <FiCalendar /> {formatFsDate(task.scheduledDate)}
                    </p>
                  </div>
                  <FiChevronRight className="text-[#94A3B8]" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default WorkerDashboard;
