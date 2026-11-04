import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { FiMail, FiLock, FiEye, FiEyeOff, FiLogIn, FiBriefcase } from "react-icons/fi";
import toast from "react-hot-toast";
import { useWholesalerAuthStore } from "../store/wholesalerAuthStore";
import AuthShell, { labelClass, primaryButtonClass } from "../components/AuthShell";

const iconInputClass =
  "w-full pl-10 pr-4 py-2.5 sm:py-3 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:bg-white text-base sm:text-sm text-[#0F172A] placeholder:text-[#94A3B8] transition-all";

const WholesalerLogin = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, isLoading } = useWholesalerAuthStore();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);

  const destination = location.state?.from?.pathname || "/wholesaler/dashboard";

  useEffect(() => {
    if (isAuthenticated) navigate(destination, { replace: true });
  }, [isAuthenticated, navigate, destination]);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.email || !formData.password) {
      toast.error("Please fill in all fields.");
      return;
    }
    try {
      await login(formData.email.trim().toLowerCase(), formData.password);
      toast.success("Login successful!");
      navigate(destination, { replace: true });
    } catch (error) {
      if (!error?.toastShown) toast.error(error.message || "Invalid email or password.");
    }
  };

  return (
    <AuthShell
      icon={FiBriefcase}
      title="Wholesaler Login"
      subtitle="Sign in to manage your wholesale catalog and B2B orders."
    >
      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
        <div>
          <label className={labelClass}>
            Email Address <span className="text-[#E31E24]">*</span>
          </label>
          <div className="relative">
            <FiMail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748B]" />
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="business@example.com"
              className={iconInputClass}
              required
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>
            Password <span className="text-[#E31E24]">*</span>
          </label>
          <div className="relative">
            <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748B]" />
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="••••••••"
              className={`${iconInputClass} pr-11`}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A] p-1"
            >
              {showPassword ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>
        </div>

        <div className="flex justify-end text-xs">
          <Link to="/wholesaler/forgot-password" className="font-bold text-[#E31E24] hover:underline">
            Forgot password?
          </Link>
        </div>

        <button type="submit" disabled={isLoading} className={primaryButtonClass}>
          {isLoading ? <span>Logging in...</span> : (<><FiLogIn /> <span>Access Wholesaler Dashboard</span></>)}
        </button>

        <p className="text-[11px] text-[#64748B] text-center leading-relaxed bg-[#FEF2F2]/60 border border-red-100 rounded-xl px-3 py-2">
          Buying in bulk? Sign in on the SafeFire app with these same credentials to shop the wholesale catalog.
        </p>

        <div className="text-center pt-2.5 border-t border-[#E5E7EB]">
          <p className="text-xs text-[#64748B]">
            Don't have a wholesaler account?{" "}
            <Link to="/wholesaler/register" className="font-bold text-[#E31E24] hover:underline">
              Register as Wholesaler
            </Link>
          </p>
        </div>
      </form>
    </AuthShell>
  );
};

export default WholesalerLogin;
