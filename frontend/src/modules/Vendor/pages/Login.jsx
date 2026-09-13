import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { FiMail, FiLock, FiEye, FiEyeOff, FiLogIn, FiShield } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useVendorAuthStore } from "../store/vendorAuthStore";
import toast from 'react-hot-toast';
import { appLogo } from '../../../shared/utils/imagePaths';

const VendorLogin = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, isLoading } = useVendorAuthStore();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const from = location.state?.from?.pathname || '/vendor/dashboard';
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, location]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.email || !formData.password) {
      toast.error('Please fill in all fields.');
      return;
    }

    try {
      await login(formData.email, formData.password, rememberMe);
      toast.success('Login successful!');
      const from = location.state?.from?.pathname || '/vendor/dashboard';
      navigate(from, { replace: true });
    } catch (error) {
      if (!error?.toastShown) {
        toast.error(error.message || 'Invalid email or password.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1F2937] flex flex-col justify-between">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-[#E5E7EB] px-4 lg:px-8 py-3.5 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 sm:gap-3 group">
            <img src={appLogo} alt="Fire Safety Shop Logo" className="h-8 sm:h-9 w-auto object-contain" />
            <div>
              <span className="text-base sm:text-lg font-bold text-[#0F172A] tracking-tight group-hover:text-[#E31E24] transition-colors block leading-none">
                Fire Safety Shop
              </span>
              <span className="text-[11px] sm:text-xs text-[#64748B] font-medium block mt-0.5">
                Seller Portal Access
              </span>
            </div>
          </Link>
        </div>
      </header>

      {/* Main Login Card Container */}
      <main className="flex-1 flex items-center justify-center p-3.5 sm:p-4 py-6 sm:py-10">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl sm:rounded-3xl border border-[#E5E7EB] p-5 sm:p-8 w-full max-w-md shadow-lg sm:shadow-xl space-y-5 sm:space-y-6"
        >
          {/* Header */}
          <div className="text-center space-y-2.5 sm:space-y-3">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#FEF2F2] text-[#E31E24] border border-red-100 flex items-center justify-center mx-auto shadow-sm">
              <FiLock className="text-xl sm:text-2xl" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-[#0F172A] tracking-tight">Seller Account Login</h1>
              <p className="text-xs text-[#64748B] mt-1 sm:mt-1.5 leading-relaxed">
                Enter your registered credentials to access your seller dashboard.
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
            {/* Email Field */}
            <div>
              <label className="block text-xs font-bold text-[#1F2937] uppercase tracking-wider mb-1.5">
                Email Address <span className="text-[#E31E24]">*</span>
              </label>
              <div className="relative">
                <FiMail className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-[#64748B]" />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="vendor@example.com"
                  className="w-full pl-10 pr-4 py-2.5 sm:py-3 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:bg-white text-sm text-[#0F172A] placeholder:text-[#94A3B8] transition-all"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-xs font-bold text-[#1F2937] uppercase tracking-wider mb-1.5">
                Password <span className="text-[#E31E24]">*</span>
              </label>
              <div className="relative">
                <FiLock className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-[#64748B]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-11 py-2.5 sm:py-3 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:bg-white text-sm text-[#0F172A] placeholder:text-[#94A3B8] transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 transform -translate-y-1/2 text-[#64748B] hover:text-[#0F172A] p-1"
                >
                  {showPassword ? <FiEyeOff className="text-base" /> : <FiEye className="text-base" />}
                </button>
              </div>
            </div>

            {/* Remember Me & Forgot Password */}
            <div className="flex items-center justify-between text-xs pt-0.5">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 text-[#E31E24] bg-gray-50 border-gray-200 rounded focus:ring-[#E31E24]"
                />
                <span className="text-[#64748B] font-medium">Remember me</span>
              </label>
              <Link
                to="/vendor/forgot-password"
                className="font-bold text-[#E31E24] hover:underline"
              >
                Forgot password?
              </Link>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 sm:py-3.5 px-4 rounded-xl bg-[#E31E24] hover:bg-[#C8191E] text-white font-bold text-sm shadow-md hover:shadow-lg transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <span>Logging in...</span>
              ) : (
                <>
                  <FiLogIn className="text-base" />
                  <span>Access Seller Dashboard</span>
                </>
              )}
            </button>

            {/* Register Link */}
            <div className="text-center pt-2.5 sm:pt-2 border-t border-[#E5E7EB]">
              <p className="text-xs text-[#64748B]">
                Don't have a seller account?{' '}
                <Link
                  to="/vendor/register"
                  className="font-bold text-[#E31E24] hover:underline"
                >
                  Register as Seller
                </Link>
              </p>
            </div>
          </form>
        </motion.div>
      </main>

      {/* Simple Footer */}
      <footer className="py-3.5 sm:py-4 text-center text-xs text-[#64748B] border-t border-[#E5E7EB] bg-white px-4">
        <div className="max-w-md mx-auto flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-4">
          <span>© {new Date().getFullYear()} SafeFire Marketplace.</span>
          <Link to="/vendor/privacy-policy" className="text-[#E31E24] hover:underline font-semibold">
            Privacy Policy
          </Link>
        </div>
      </footer>
    </div>
  );
};

export default VendorLogin;

