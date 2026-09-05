import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { FiMail, FiLock, FiEye, FiEyeOff, FiTruck, FiLogIn } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useDeliveryAuthStore } from '../store/deliveryStore';
import toast from 'react-hot-toast';
import { appLogo } from '../../../shared/utils/imagePaths';
import PageTransition from '../../../shared/components/PageTransition';

const DeliveryLogin = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, isLoading } = useDeliveryAuthStore();
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    const hasDeliveryToken = Boolean(localStorage.getItem('delivery-token'));
    if (isAuthenticated && hasDeliveryToken) {
      const from = location.state?.from?.pathname || '/delivery/dashboard';
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
      toast.error('Please fill in all fields');
      return;
    }

    try {
      await login(formData.email, formData.password, rememberMe);
      toast.success('Login successful!');
      // Redirect is handled by auth effect above to avoid duplicate navigation.
    } catch (error) {
      toast.error(error.message || 'Invalid credentials');
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
              to="/delivery/register"
              className="px-4 py-2 text-xs font-semibold text-[#E31E24] bg-[#FEF2F2] hover:bg-red-100 rounded-xl border border-red-200 transition-colors"
            >
              Join as Partner
            </Link>
          </div>
        </header>

        {/* Main Login Card Container */}
        <main className="flex-1 flex items-center justify-center p-4 py-8 sm:py-12">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="bg-white rounded-3xl border border-[#E5E7EB] p-6 sm:p-8 w-full max-w-md shadow-xl space-y-6"
          >
            {/* Header / Icon */}
            <div className="text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-[#FEF2F2] text-[#E31E24] border border-red-100 flex items-center justify-center mx-auto shadow-sm">
                <FiTruck className="text-2xl" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-[#0F172A] tracking-tight">Delivery Login</h1>
                <p className="text-xs text-[#64748B] mt-1">
                  Sign in to manage your delivery orders and routes
                </p>
              </div>
            </div>

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
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
                    placeholder="delivery@delivery.com"
                    className="w-full pl-10 pr-4 py-3 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:bg-white text-sm text-[#0F172A] placeholder:text-[#94A3B8] transition-all"
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
                    className="w-full pl-10 pr-11 py-3 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:bg-white text-sm text-[#0F172A] placeholder:text-[#94A3B8] transition-all"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 transform -translate-y-1/2 text-[#64748B] hover:text-[#0F172A] transition-colors"
                  >
                    {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                  </button>
                </div>
              </div>

              {/* Remember Me & Forgot Password */}
              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 text-[#E31E24] bg-gray-50 border-gray-300 rounded focus:ring-[#E31E24]"
                  />
                  <span className="text-[#64748B] font-medium">Remember me</span>
                </label>
                <Link
                  to="/delivery/forgot-password"
                  className="font-bold text-[#E31E24] hover:underline"
                >
                  Forgot password?
                </Link>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 px-4 rounded-xl bg-[#E31E24] hover:bg-[#C8191F] text-white font-bold text-sm shadow-md transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <span>Signing in...</span>
                ) : (
                  <>
                    <FiLogIn className="text-base" />
                    <span>Access Delivery Dashboard</span>
                  </>
                )}
              </button>

              {/* Register Link */}
              <div className="text-center pt-2 border-t border-[#E5E7EB]">
                <p className="text-xs text-[#64748B]">
                  New delivery partner?{' '}
                  <Link
                    to="/delivery/register"
                    className="font-bold text-[#E31E24] hover:underline"
                  >
                    Register here
                  </Link>
                </p>
              </div>
            </form>

            {/* Demo Credentials */}
            <div
              onClick={() => setFormData({ email: 'delivery@safefire.com', password: 'Password123!' })}
              className="p-3.5 bg-[#FEF2F2] rounded-xl cursor-pointer hover:bg-red-100 transition-colors border border-red-200 group"
              title="Click to autofill test credentials"
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-[#0F172A] font-bold">Demo Credentials:</p>
                <span className="text-[11px] text-[#E31E24] font-semibold group-hover:underline">Click to autofill</span>
              </div>
              <p className="text-xs text-[#64748B]">Email: <span className="font-semibold text-[#0F172A]">delivery@safefire.com</span></p>
              <p className="text-xs text-[#64748B]">Password: <span className="font-semibold text-[#0F172A]">Password123!</span></p>
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

export default DeliveryLogin;

