import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { FiHome, FiClipboard, FiFileText, FiLogOut, FiShield } from 'react-icons/fi';
import { useWorkerAuthStore } from '../store/workerAuthStore';
import { appLogo } from '../../../shared/utils/imagePaths';

const NAV = [
  { to: '/worker/dashboard', label: 'Dashboard', icon: FiHome },
  { to: '/worker/tasks', label: 'My Tasks', icon: FiClipboard },
  { to: '/worker/reports', label: 'My Reports', icon: FiFileText },
];

// Dedicated, restricted shell for fire-safety inspectors.
const WorkerLayout = () => {
  const navigate = useNavigate();
  const { worker, logout } = useWorkerAuthStore();

  const handleLogout = () => {
    logout();
    navigate('/worker/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1F2937] pb-20 md:pb-0">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E5E7EB] shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img src={appLogo} alt="SafeFire Logo" className="h-8 w-auto object-contain" />
            <div className="min-w-0">
              <span className="text-base font-bold text-[#0F172A] block leading-none">SafeFire</span>
              <span className="text-[11px] text-[#64748B] font-medium flex items-center gap-1 mt-0.5">
                <FiShield className="text-[#E31E24]" /> Inspector Portal
              </span>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
                    isActive ? 'bg-[#FEF2F2] text-[#E31E24]' : 'text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100'
                  }`
                }>
                <Icon /> {label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-sm font-semibold text-[#0F172A] truncate max-w-[160px]">{worker?.name}</span>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#64748B] hover:text-[#E31E24] border border-[#E5E7EB] rounded-xl">
              <FiLogOut /> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet />
      </main>

      {/* Mobile bottom navigation */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-[#E5E7EB] grid grid-cols-3">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${isActive ? 'text-[#E31E24]' : 'text-[#64748B]'}`
            }>
            <Icon className="text-lg" /> {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};

export default WorkerLayout;
