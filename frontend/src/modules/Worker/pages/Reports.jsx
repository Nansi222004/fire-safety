import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiChevronRight } from 'react-icons/fi';
import api from '../../../shared/utils/api';
import { ConditionBadge } from '../../../shared/components/FireSafety/FsBadge';
import { formatFsDate, formatFsLocation } from '../../../shared/constants/fireSafety';

const WorkerReports = () => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/worker/reports').then((d) => setReports(d?.reports || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-[#0F172A]">My Reports</h1>
        <p className="text-sm text-[#64748B]">Inspection reports you have submitted</p>
      </div>
      {loading ? (
        <p className="text-sm text-[#64748B]">Loading…</p>
      ) : reports.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-8 text-center text-sm text-[#64748B]">No reports submitted yet.</div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <Link key={report._id} to={`/worker/tasks/${report.taskId?._id || report.taskId}`}
              className="flex items-center gap-3 bg-white rounded-2xl border border-[#E5E7EB] p-4 shadow-sm hover:shadow-md">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-[#94A3B8]">{report.reportNumber}</span>
                  <span className={`text-[11px] font-bold ${report.reviewStatus === 'reviewed' ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {report.reviewStatus === 'reviewed' ? 'Reviewed by admin' : 'Awaiting review'}
                  </span>
                </div>
                <p className="font-bold text-[#0F172A]">{report.taskId?.title}</p>
                <p className="text-xs text-[#64748B] truncate">{report.userId?.name} · {formatFsLocation(report.location)}</p>
                <p className="text-xs text-[#64748B]">Inspected {formatFsDate(report.inspectedAt, true)}</p>
                <div className="flex flex-wrap gap-1 pt-1">
                  {report.items.map((item) => (
                    <span key={item.equipmentId} className="flex items-center gap-1 text-xs text-[#1F2937]">
                      {item.equipmentName}: <ConditionBadge value={item.condition} />
                    </span>
                  ))}
                </div>
              </div>
              <FiChevronRight className="text-[#94A3B8]" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default WorkerReports;
