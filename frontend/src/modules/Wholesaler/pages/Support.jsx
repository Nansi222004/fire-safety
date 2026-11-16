import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  FiArrowLeft,
  FiBriefcase,
  FiChevronDown,
  FiHelpCircle,
  FiLogIn,
  FiMail,
  FiMessageSquare,
  FiPhone,
} from "react-icons/fi";
import api from "../../../shared/utils/api";
import { appLogo } from "../../../shared/utils/imagePaths";
import { useWholesalerAuthStore } from "../store/wholesalerAuthStore";

const FAQS = [
  {
    q: "How do I register as a wholesaler?",
    a: "Tap \"Register as Wholesaler\" on the login screen and submit your business details and GSTIN. Our team verifies your account, usually within 24–48 business hours, and you can sign in once it is approved.",
  },
  {
    q: "When are my wholesale earnings paid out?",
    a: "Earnings for a delivered order are held for the return window set by SafeFire, then released to your wallet. You can see each order's payout status and date under Wallet and in the order details.",
  },
  {
    q: "How do I add products and set bulk prices?",
    a: "Use Products → Add Product to list an item, then Pricing & Stock to set wholesale prices, minimum order quantities and stock levels.",
  },
  {
    q: "How do I raise an issue about an order or payout?",
    a: "Sign in and open Support from the menu to create a ticket. You can follow the conversation with our team and see when it is resolved.",
  },
  {
    q: "How do I delete my wholesaler account?",
    a: "Sign in, open Business Profile (or the menu) and tap Delete Account, then type DELETE to confirm. Deletion is permanent and is not possible while orders are still active. You can also email us to request deletion.",
  },
];

/**
 * Public Wholesaler support page (no sign-in needed). Self-contained: every link stays inside the
 * Wholesaler app, like the rest of the portal.
 */
const WholesalerSupport = () => {
  const navigate = useNavigate();
  const { isAuthenticated, vendor } = useWholesalerAuthStore();
  const [supportEmail, setSupportEmail] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [openFaq, setOpenFaq] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/settings/general")
      .then((res) => {
        if (cancelled) return;
        const settings = res?.data || res || {};
        setSupportEmail(settings.supportEmail || settings.contactEmail || "");
        setSupportPhone(settings.supportPhone || settings.contactPhone || "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const home = isAuthenticated ? "/wholesaler/dashboard" : "/wholesaler/login";

  return (
    <div className="no-pinch-zoom min-h-[100dvh] bg-[#F8FAFC] text-[#1F2937] flex flex-col [-webkit-tap-highlight-color:transparent]">
      <header className="sticky top-0 z-30 bg-white border-b border-[#E5E7EB] px-3 sm:px-4 lg:px-8 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <Link to={home} className="flex items-center gap-2.5 min-w-0">
            <img src={appLogo} alt="Fire Safety Shop Logo" className="h-8 sm:h-9 w-auto object-contain shrink-0" />
            <span className="text-[11px] sm:text-xs text-[#64748B] font-medium truncate hidden min-[380px]:block">Wholesaler Portal · B2B</span>
          </Link>
          <button
            type="button"
            onClick={() => navigate(home)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#E31E24] bg-[#FEF2F2] hover:bg-red-100 rounded-xl border border-red-200 shrink-0 whitespace-nowrap"
          >
            <FiArrowLeft className="text-sm" />
            <span>{isAuthenticated ? "Dashboard" : "Back to Login"}</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-3 py-4 sm:p-6 space-y-4">
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl sm:rounded-3xl border border-[#E5E7EB] p-4 sm:p-8 shadow-sm space-y-5"
        >
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#FEF2F2] text-[#E31E24] flex items-center justify-center text-xl shrink-0">
              <FiBriefcase />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-extrabold text-[#0F172A] tracking-tight leading-tight">Wholesaler Support</h1>
              <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">Help with your wholesaler account, B2B orders and payouts.</p>
            </div>
          </div>

          {isAuthenticated ? (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm text-green-900 font-semibold min-w-0">
                Signed in as {vendor?.storeName || vendor?.name || "Wholesaler"}
              </p>
              <button
                type="button"
                onClick={() => navigate("/wholesaler/support-tickets")}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#E31E24] hover:bg-[#C8191E] text-white rounded-xl text-xs font-bold shrink-0 min-h-[44px]"
              >
                <FiMessageSquare /> My Support Tickets
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <p className="text-sm text-slate-700">
                Sign in to raise a support ticket about an order, payout or your account.
              </p>
              <div className="flex flex-col min-[380px]:flex-row gap-2.5">
                <button
                  type="button"
                  onClick={() => navigate("/wholesaler/login")}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#E31E24] hover:bg-[#C8191E] text-white rounded-xl text-xs font-bold min-h-[44px] flex-1"
                >
                  <FiLogIn /> Sign In
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/wholesaler/register")}
                  className="inline-flex items-center justify-center px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold min-h-[44px] flex-1"
                >
                  Register as Wholesaler
                </button>
              </div>
            </div>
          )}

          {(supportEmail || supportPhone) && (
            <div>
              <h2 className="text-base font-bold text-slate-800 mb-3">Contact us</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {supportPhone && (
                  <a
                    href={`tel:${supportPhone.replace(/[^\d+]/g, "")}`}
                    className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center gap-3 min-h-[44px] active:bg-slate-50"
                  >
                    <span className="w-10 h-10 rounded-lg bg-[#FEF2F2] text-[#E31E24] flex items-center justify-center shrink-0"><FiPhone /></span>
                    <span className="min-w-0">
                      <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">Helpline</span>
                      <span className="block text-sm font-bold text-slate-800 truncate">{supportPhone}</span>
                    </span>
                  </a>
                )}
                {supportEmail && (
                  <a
                    href={`mailto:${supportEmail}?subject=Wholesaler%20Support`}
                    className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center gap-3 min-h-[44px] active:bg-slate-50"
                  >
                    <span className="w-10 h-10 rounded-lg bg-[#FEF2F2] text-[#E31E24] flex items-center justify-center shrink-0"><FiMail /></span>
                    <span className="min-w-0">
                      <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">Email</span>
                      <span className="block text-sm font-bold text-slate-800 truncate">{supportEmail}</span>
                    </span>
                  </a>
                )}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center gap-2 mb-3">
              <FiHelpCircle className="text-[#E31E24] text-lg shrink-0" />
              <h2 className="text-base font-bold text-slate-800">Frequently asked questions</h2>
            </div>
            <div className="space-y-2.5">
              {FAQS.map((faq, idx) => {
                const isOpen = openFaq === idx;
                return (
                  <div key={faq.q} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : idx)}
                      aria-expanded={isOpen}
                      className="w-full p-3.5 text-left flex items-center justify-between gap-3 min-h-[44px]"
                    >
                      <span className="font-semibold text-sm text-slate-800 leading-snug">{faq.q}</span>
                      <FiChevronDown className={`shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-180 text-[#E31E24]" : ""}`} />
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <p className="px-3.5 pb-3.5 pt-1 text-sm text-slate-600 leading-relaxed border-t border-slate-100">{faq.a}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.section>
      </main>

      <footer className="py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-xs text-[#64748B] border-t border-[#E5E7EB] bg-white px-4">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-4">
          <span>© {new Date().getFullYear()} SafeFire Marketplace.</span>
          <Link to="/wholesaler/privacy-policy" className="text-[#E31E24] hover:underline font-semibold">
            Privacy Policy
          </Link>
        </div>
      </footer>
    </div>
  );
};

export default WholesalerSupport;
