import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiEye, FiEyeOff, FiLock, FiTruck } from 'react-icons/fi';
import toast from 'react-hot-toast';
import PageTransition from '../../../shared/components/PageTransition';
import { useDeliveryAuthStore } from '../store/deliveryStore';
import { appLogo } from '../../../shared/utils/imagePaths';

const DeliveryResetPassword = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { resetPassword, isLoading } = useDeliveryAuthStore();

  const email = location.state?.email || searchParams.get('email') || '';
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: '',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) {
      toast.error('Session expired. Please start forgot password again.');
      navigate('/delivery/forgot-password', { replace: true });
      return;
    }
    if (!formData.password || !formData.confirmPassword) {
      toast.error('Please fill both password fields.');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    try {
      await resetPassword(email, formData.password, formData.confirmPassword);
      toast.success('Password reset successful. Please login.');
      navigate('/delivery/login', { replace: true });
    } catch {
      // Global API interceptor shows toast
    }
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-[#F8FAFC] text-[#1F2937] flex flex-col justify-between selection:bg-red-500 selection:text-white">
        {/* Top Header */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E5E7EB] px-4 lg:px-8 py-3.5 shadow-sm">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3 group">
              <img src={appLogo} alt="SafeFire Logo" className="h-9 w-auto object-contain" />
              <div>
                <span className="text-lg font-bold text-[#0F172A] tracking-tight group-hover:text-[#E31E24] transition-colors block leading-none">
                  SafeFire
                </span>
                <span className="text-xs text-[#64748B] font-medium block mt-0.5">
                  Delivery Partner Portal
                </span>
              </div>
            </Link>

            <Link
              to="/delivery/login"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-[#64748B] hover:text-[#0F172A] bg-[#F1F5F9] hover:bg-[#E2E8F0] rounded-xl transition-colors"
            >
              <FiArrowLeft className="text-sm" />
              <span>Back to Login</span>
            </Link>
          </div>
        </header>

        {/* Main Card */}
        <main className="flex-1 flex items-center justify-center p-4 py-8 sm:py-12">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="bg-white rounded-3xl border border-[#E5E7EB] p-6 sm:p-8 w-full max-w-md shadow-xl space-y-6"
          >
            <div className="text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-[#FEF2F2] text-[#E31E24] border border-red-100 flex items-center justify-center mx-auto shadow-sm">
                <FiTruck className="text-2xl" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-[#0F172A] tracking-tight">Set New Password</h1>
                <p className="text-xs text-[#64748B] mt-1">
                  Create a secure password for <span className="font-semibold text-[#0F172A]">{email || 'your account'}</span>
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-[#1F2937] uppercase tracking-wider mb-1.5">
                  New Password <span className="text-[#E31E24]">*</span>
                </label>
                <div className="relative">
                  <FiLock className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-[#64748B]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                    placeholder="Minimum 6 characters"
                    required
                    minLength={6}
                    className="w-full pl-10 pr-11 py-3 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:bg-white text-sm text-[#0F172A] placeholder:text-[#94A3B8] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3.5 top-1/2 transform -translate-y-1/2 text-[#64748B] hover:text-[#0F172A]"
                  >
                    {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1F2937] uppercase tracking-wider mb-1.5">
                  Confirm New Password <span className="text-[#E31E24]">*</span>
                </label>
                <div className="relative">
                  <FiLock className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-[#64748B]" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                    placeholder="Re-enter new password"
                    required
                    minLength={6}
                    className="w-full pl-10 pr-11 py-3 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:bg-white text-sm text-[#0F172A] placeholder:text-[#94A3B8] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-3.5 top-1/2 transform -translate-y-1/2 text-[#64748B] hover:text-[#0F172A]"
                  >
                    {showConfirmPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 px-4 rounded-xl bg-[#E31E24] hover:bg-[#C8191F] text-white font-bold text-sm shadow-md transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? 'Resetting Password...' : 'Save New Password & Login'}
              </button>
            </form>

            <div className="text-center pt-2 border-t border-[#E5E7EB]">
              <Link to="/delivery/login" className="inline-flex items-center gap-1.5 text-xs text-[#64748B] hover:text-[#0F172A] font-semibold">
                <FiArrowLeft />
                <span>Back to Login</span>
              </Link>
            </div>
          </motion.div>
        </main>

        {/* Footer */}
        <footer className="py-4 text-center text-xs text-[#64748B] border-t border-[#E5E7EB] bg-white">
          © {new Date().getFullYear()} SafeFire Delivery Operations. Certified Fire Safety & Compliance Platform.
        </footer>
      </div>
    </PageTransition>
  );
};

export default DeliveryResetPassword;
