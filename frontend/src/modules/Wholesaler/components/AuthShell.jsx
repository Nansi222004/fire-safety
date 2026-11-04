import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { appLogo } from "../../../shared/utils/imagePaths";

export const inputClass =
  "w-full px-3.5 py-2.5 sm:py-3 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:bg-white text-base sm:text-sm text-[#0F172A] placeholder:text-[#94A3B8] transition-all";

export const labelClass = "block text-xs font-bold text-[#1F2937] uppercase tracking-wider mb-1.5";

export const primaryButtonClass =
  "w-full py-3 sm:py-3.5 px-4 rounded-xl bg-[#E31E24] hover:bg-[#C8191E] text-white font-bold text-sm shadow-md hover:shadow-lg transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2";

/**
 * Page frame for the Wholesaler portal's public pages (login, registration, OTP, password reset).
 */
const AuthShell = ({ icon: Icon, title, subtitle, children, wide = false }) => (
  <div className="min-h-[100dvh] bg-white sm:bg-[#F8FAFC] text-[#1F2937] flex flex-col justify-between [-webkit-tap-highlight-color:transparent]">
    <header className="sticky top-0 z-30 bg-white border-b border-[#E5E7EB] px-4 lg:px-8 py-3 sm:py-3.5 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-sm">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2.5 sm:gap-3 group min-w-0">
          <img src={appLogo} alt="Fire Safety Shop Logo" className="h-8 sm:h-9 w-auto object-contain" />
          <div className="min-w-0">
            <span className="text-[11px] sm:text-xs text-[#64748B] font-medium block">Wholesaler Portal · B2B</span>
          </div>
        </Link>
        <Link to="/vendor/login" className="text-xs font-semibold text-[#64748B] hover:text-[#0F172A] whitespace-nowrap">
          Retail seller?
        </Link>
      </div>
    </header>

    <main className="flex-1 flex sm:items-center justify-center sm:p-4 sm:py-10">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className={`bg-white sm:rounded-3xl sm:border sm:border-[#E5E7EB] px-5 py-6 sm:p-8 w-full ${wide ? "max-w-3xl" : "max-w-md"} sm:shadow-xl space-y-5 sm:space-y-6`}
      >
        <div className="text-center space-y-2.5 sm:space-y-3">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#FEF2F2] text-[#E31E24] border border-red-100 flex items-center justify-center mx-auto shadow-sm">
            <Icon className="text-xl sm:text-2xl" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#0F172A] tracking-tight">{title}</h1>
            {subtitle && <p className="text-xs text-[#64748B] mt-1 sm:mt-1.5 leading-relaxed">{subtitle}</p>}
          </div>
        </div>
        {children}
      </motion.div>
    </main>

    <footer className="py-3.5 sm:py-4 pb-[max(0.875rem,env(safe-area-inset-bottom))] text-center text-xs text-[#64748B] border-t border-[#E5E7EB] bg-white px-4">
      <div className="max-w-md mx-auto flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-4">
        <span>© {new Date().getFullYear()} SafeFire Marketplace.</span>
        <Link to="/vendor/privacy-policy" className="text-[#E31E24] hover:underline font-semibold">
          Privacy Policy
        </Link>
      </div>
    </footer>
  </div>
);

export default AuthShell;
