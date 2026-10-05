import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiMail, FiLock, FiShield, FiLogIn, FiEye, FiEyeOff } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useWorkerAuthStore } from '../store/workerAuthStore';
import { appLogo } from '../../../shared/utils/imagePaths';

const inputClass =
  'w-full pl-10 pr-4 py-3 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:bg-white text-sm text-[#0F172A] placeholder:text-[#94A3B8] transition-all';

const WorkerLogin = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isLoading } = useWorkerAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(email, password);
      toast.success('Welcome back!');
      navigate(location.state?.from?.pathname || '/worker/dashboard', { replace: true });
    } catch {
      // API client shows the error toast
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      <header className="bg-white border-b border-[#E5E7EB] px-4 py-3.5 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <img src={appLogo} alt="SafeFire Logo" className="h-9 w-auto object-contain" />
          <div>
            <span className="text-lg font-bold text-[#0F172A] block leading-none">SafeFire</span>
            <span className="text-xs text-[#64748B] font-medium block mt-0.5">Fire Safety Inspector Portal</span>
          </div>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl border border-[#E5E7EB] p-6 sm:p-8 w-full max-w-md shadow-xl space-y-6">
          <div className="text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-[#FEF2F2] text-[#E31E24] border border-red-100 flex items-center justify-center mx-auto">
              <FiShield className="text-2xl" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-[#0F172A]">Inspector Login</h1>
              <p className="text-xs text-[#64748B] mt-1">Use the credentials provided by your SafeFire admin</p>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-5">
            <label className="block">
              <span className="block text-xs font-bold text-[#1F2937] uppercase tracking-wider mb-1.5">Email Address</span>
              <div className="relative">
                <FiMail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748B]" />
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="inspector@safefire.com" />
              </div>
            </label>
            <label className="block">
              <span className="block text-xs font-bold text-[#1F2937] uppercase tracking-wider mb-1.5">Password</span>
              <div className="relative">
                <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748B]" />
                <input type={showPassword ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputClass} pr-10`} />
                <button type="button" aria-label="Toggle password visibility" onClick={() => setShowPassword((v) => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#64748B]">
                  {showPassword ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>
            </label>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-[#E31E24] hover:bg-[#C8191F] disabled:opacity-60 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2">
              <FiLogIn /> {isLoading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </motion.div>
      </main>
    </div>
  );
};

export default WorkerLogin;
