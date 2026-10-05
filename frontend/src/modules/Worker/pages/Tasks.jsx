import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiChevronRight, FiMapPin, FiCalendar, FiTool } from 'react-icons/fi';
import api from '../../../shared/utils/api';
import { TaskStatusBadge } from '../../../shared/components/FireSafety/FsBadge';
import { formatFsDate, formatFsLocation } from '../../../shared/constants/fireSafety';

const FILTERS = [
  { value: 'open', label: 'Open' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'completed', label: 'Completed' },
  { value: 'all', label: 'All' },
];

const WorkerTasks = () => {
  const [filter, setFilter] = useState('open');
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = filter === 'open' ? { view: 'open' } : filter === 'all' ? {} : { status: filter };
    api.get('/worker/tasks', { params })
      .then((d) => setTasks(d?.tasks || []))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-[#0F172A]">My Tasks</h1>
        <p className="text-sm text-[#64748B]">Inspections assigned to you</p>
      </div>
      <div className="flex gap-1 p-1 bg-white border border-[#E5E7EB] rounded-xl w-fit">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${filter === f.value ? 'bg-[#FEF2F2] text-[#E31E24]' : 'text-[#64748B]'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-[#64748B]">Loading…</p>
      ) : tasks.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-8 text-center text-sm text-[#64748B]">No tasks here.</div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <Link
              key={task._id}
              to={`/worker/tasks/${task._id}`}
              className="flex items-center gap-3 bg-white rounded-2xl border border-[#E5E7EB] p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-[#94A3B8]">{task.taskNumber}</span>
                  <TaskStatusBadge value={task.status} />
                </div>
                <p className="font-bold text-[#0F172A]">{task.title}</p>
                <p className="text-xs text-[#64748B] flex items-center gap-1 truncate">
                  <FiMapPin className="flex-shrink-0" /> {task.userId?.name} · {formatFsLocation(task.location)}
                </p>
                <p className="text-xs text-[#64748B] flex items-center gap-3">
                  <span className="flex items-center gap-1"><FiCalendar /> {formatFsDate(task.scheduledDate)}</span>
                  {task.dueDate && <span>Due {formatFsDate(task.dueDate)}</span>}
                  <span className="flex items-center gap-1"><FiTool /> {task.equipmentIds?.length || 0} item(s)</span>
                </p>
              </div>
              <FiChevronRight className="text-[#94A3B8]" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default WorkerTasks;
