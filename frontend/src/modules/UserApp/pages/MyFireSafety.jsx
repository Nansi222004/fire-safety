import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiShield, FiChevronRight, FiAlertTriangle } from 'react-icons/fi';
import MobileLayout from '../components/Layout/MobileLayout';
import PageTransition from '../../../shared/components/PageTransition';
import api from '../../../shared/utils/api';
import { ConditionBadge } from '../../../shared/components/FireSafety/FsBadge';
import { EQUIPMENT_TYPE_LABELS, formatFsDate, formatFsLocation } from '../../../shared/constants/fireSafety';

// "My Fire Safety" — the customer's monitored equipment. Separate from product orders.
const MyFireSafety = () => {
  const navigate = useNavigate();
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/user/fire-safety/equipment')
      .then((d) => setEquipment(d?.equipment || []))
      .catch(() => setEquipment([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={false}>
        <div className="w-full max-w-4xl mx-auto px-4 lg:px-0 py-6 pb-24 space-y-6">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} aria-label="Go back"
              className="w-11 h-11 bg-white border border-gray-100 hover:bg-gray-50 rounded-2xl flex items-center justify-center text-slate-700 shadow-sm">
              <FiArrowLeft />
            </button>
            <div>
              <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2"><FiShield className="text-[#E31E24]" /> My Fire Safety</h1>
              <p className="text-sm text-slate-500">Your monitored fire-safety equipment and inspection status</p>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : equipment.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-2">
              <FiShield className="mx-auto text-3xl text-slate-300" />
              <p className="font-bold text-slate-800">No monitored equipment yet</p>
              <p className="text-sm text-slate-500">Once SafeFire registers your fire-safety equipment for inspection, it will appear here.</p>
              <Link to="/support" className="inline-block text-sm font-semibold text-[#E31E24] hover:underline">Contact SafeFire</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {equipment.map((item) => (
                <Link key={item._id} to={`/my-fire-safety/${item._id}`}
                  className="flex items-center gap-4 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className="w-12 h-12 rounded-2xl bg-red-50 text-[#E31E24] flex items-center justify-center flex-shrink-0"><FiShield className="text-xl" /></div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="font-bold text-slate-900 truncate">{item.name}</p>
                    <p className="text-xs text-slate-500 truncate">{EQUIPMENT_TYPE_LABELS[item.equipmentType]} · {formatFsLocation(item.location)}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <ConditionBadge value={item.currentStatus} />
                      <span className="text-xs text-slate-500">Last inspection: {formatFsDate(item.lastInspectedAt)}</span>
                      {item.openIssues > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700"><FiAlertTriangle /> {item.openIssues} issue{item.openIssues > 1 ? 's' : ''}</span>
                      )}
                    </div>
                  </div>
                  <FiChevronRight className="text-slate-400" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default MyFireSafety;
