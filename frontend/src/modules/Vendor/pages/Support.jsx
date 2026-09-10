import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  FiShield, 
  FiMail, 
  FiPhone, 
  FiArrowLeft, 
  FiShoppingBag, 
  FiClock, 
  FiHelpCircle,
  FiChevronDown,
  FiLock,
  FiLogIn,
  FiMessageSquare,
  FiUserCheck,
  FiExternalLink
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import PageTransition from '../../../shared/components/PageTransition';
import { appLogo } from '../../../shared/utils/imagePaths';
import api from '../../../shared/utils/api';
import { useVendorAuthStore } from '../store/vendorAuthStore';

const VendorSupport = () => {
  const navigate = useNavigate();
  const { isAuthenticated, vendor } = useVendorAuthStore();

  const [supportEmail, setSupportEmail] = useState('support@safefire.demo');
  const [supportPhone, setSupportPhone] = useState('+91 98765 43210');
  const [openFaqIndex, setOpenFaqIndex] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;

    const fetchSettings = async () => {
      setIsLoading(true);
      try {
        const res = await api.get('/settings/general');
        if (isCancelled) return;
        if (res?.data?.data) {
          const settings = res.data.data;
          const email = settings.supportEmail || settings.contactEmail;
          const phone = settings.contactPhone || settings.supportPhone;
          if (email) setSupportEmail(email);
          if (phone) setSupportPhone(phone);
        }
      } catch (err) {
        console.error('Failed to load support settings:', err);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    fetchSettings();
    return () => {
      isCancelled = true;
    };
  }, []);

  const vendorFaqs = [
    {
      q: 'How do I register as a SafeFire seller or service partner?',
      a: 'You can submit your business application by clicking "Register as Seller / Partner" on this portal. Our onboarding team will verify your GSTIN, fire safety licenses, and catalog certifications within 24 to 48 business hours.'
    },
    {
      q: 'What is the payout schedule and how are vendor earnings settled?',
      a: 'Earnings from completed orders and fulfilled service bookings are settled directly into your linked bank account or vendor wallet following the return-window inspection period, ensuring seamless and automated financial compliance.'
    },
    {
      q: 'How are fire safety product listings and certifications audited?',
      a: 'All extinguishers, suppression systems, and safety accessories listed by vendors require ISI/BIS compliance certificates and valid test documentation. You can upload and update compliance records under the Documents section in your portal.'
    },
    {
      q: 'How do service partners receive refilling and on-site maintenance bookings?',
      a: 'Once approved as a Certified Service Partner, customer bookings within your serviceable pincodes are routed to your vendor dashboard, where your technicians can accept, schedule, and complete the service protocol.'
    },
    {
      q: 'How do I raise a ticket regarding order disputes or inventory issues?',
      a: 'Registered vendors can log in to their Vendor Dashboard and open the Support Tickets desk to submit priority inquiries, communicate directly with platform administrators, and monitor resolution timelines in real time.'
    }
  ];

  return (
    <PageTransition>
      <div className="min-h-screen bg-[#F8FAFC] text-[#1F2937] flex flex-col justify-between selection:bg-red-500 selection:text-white">
        {/* Top Header */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E5E7EB] px-4 lg:px-8 py-3.5 shadow-xs">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3 group">
              <img src={appLogo} alt="SafeFire Logo" className="h-9 w-auto object-contain" />
              <div>
                <span className="text-lg font-bold text-[#0F172A] tracking-tight group-hover:text-[#E31E24] transition-colors block leading-none">
                  SafeFire
                </span>
                <span className="text-xs text-[#64748B] font-medium block mt-0.5">
                  Vendor & Partner Support
                </span>
              </div>
            </Link>

            <button
              onClick={() => navigate(isAuthenticated ? '/vendor/dashboard' : '/')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-[#E31E24] bg-[#FEF2F2] hover:bg-red-100 rounded-xl border border-red-200 transition-colors"
            >
              <FiArrowLeft className="text-sm" />
              <span>{isAuthenticated ? 'Back to Dashboard' : 'Home'}</span>
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
          {/* Header Card */}
          <div className="bg-white rounded-3xl border border-[#E5E7EB] p-6 sm:p-8 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center text-2xl shrink-0">
                  <FiShoppingBag />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] tracking-tight">
                    Vendor Partner Support Desk
                  </h1>
                  <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
                    Official merchant assistance for SafeFire equipment sellers & certified service partners
                  </p>
                </div>
              </div>

              {isAuthenticated && (
                <button
                  type="button"
                  onClick={() => navigate('/vendor/support-tickets')}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-md shadow-red-100 transition-all shrink-0 min-h-[44px]"
                >
                  <FiMessageSquare className="text-sm" /> Open Ticket Desk
                </button>
              )}
            </div>

            {/* Authenticated vs Unauthenticated Banner */}
            {isAuthenticated ? (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-green-100 text-green-700 flex items-center justify-center text-lg shrink-0">
                    <FiUserCheck />
                  </div>
                  <div>
                    <h3 className="font-bold text-green-900 text-sm">
                      Signed in as {vendor?.storeName || vendor?.businessName || 'SafeFire Partner'}
                    </h3>
                    <p className="text-xs text-green-700 font-medium mt-0.5">
                      Access your private tickets, reply to admin agents, and track resolution timelines.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/vendor/support-tickets')}
                  className="px-4 py-2 bg-green-700 hover:bg-green-800 text-white rounded-xl text-xs font-bold transition-colors shrink-0"
                >
                  Manage My Tickets
                </button>
              </div>
            ) : (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-150 rounded-2xl p-5 sm:p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-blue-800 font-bold text-sm">
                      <FiLock className="text-base shrink-0" />
                      <span>Vendor Portal Account & Ticket Access</span>
                    </div>
                    <p className="text-xs text-slate-600 font-medium leading-relaxed">
                      Need to create a private dispute ticket, resolve order escalations, or verify payouts? Sign in to your vendor dashboard.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto shrink-0">
                    <button
                      type="button"
                      onClick={() => navigate('/vendor/login', { state: { from: '/vendor/support' } })}
                      className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-100 transition-all min-h-[44px] flex-1 sm:flex-none"
                    >
                      <FiLogIn className="text-sm" /> Sign In as Vendor
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/vendor/register')}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all min-h-[44px] flex-1 sm:flex-none"
                    >
                      Register as Partner
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Direct Contact Channels */}
            <div className="pt-2">
              <h2 className="text-base font-bold text-gray-800 mb-3">
                Get in Touch with Vendor Relations
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Helpline Phone */}
                <a href={`tel:${supportPhone.replace(/[^\d+]/g, '')}`} className="block">
                  <motion.div
                    whileTap={{ scale: 0.98 }}
                    className="bg-white p-5 rounded-2xl shadow-xs border border-gray-150 flex items-center gap-4 cursor-pointer hover:border-blue-300 transition-colors min-h-[44px]"
                  >
                    <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                      <FiPhone className="text-xl" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-gray-800 text-sm">Vendor Helpline</h3>
                      <p className="text-gray-500 text-sm font-semibold truncate">{supportPhone}</p>
                    </div>
                  </motion.div>
                </a>

                {/* Support Email */}
                <a href={`mailto:${supportEmail}?subject=Vendor%20Partner%20Inquiry`} className="block">
                  <motion.div
                    whileTap={{ scale: 0.98 }}
                    className="bg-white p-5 rounded-2xl shadow-xs border border-gray-150 flex items-center gap-4 cursor-pointer hover:border-red-300 transition-colors min-h-[44px]"
                  >
                    <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                      <FiMail className="text-xl" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-gray-800 text-sm">Merchant Support Email</h3>
                      <p className="text-gray-500 text-sm font-semibold truncate">{supportEmail}</p>
                    </div>
                  </motion.div>
                </a>
              </div>
            </div>

            {/* FAQs Accordion */}
            <div className="pt-4">
              <div className="flex items-center gap-2 mb-3">
                <FiHelpCircle className="text-red-600 text-lg shrink-0" />
                <h2 className="text-base font-bold text-gray-800">
                  Frequently Asked Questions for Vendors & Service Partners
                </h2>
              </div>
              <div className="space-y-3">
                {vendorFaqs.map((faq, idx) => {
                  const isOpen = openFaqIndex === idx;
                  return (
                    <div
                      key={idx}
                      className="bg-white rounded-2xl border border-gray-150 overflow-hidden shadow-xs transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                        className="w-full p-4 text-left flex items-center justify-between gap-3 min-h-[44px] hover:bg-gray-50/50 transition-colors"
                      >
                        <span className="font-bold text-sm text-gray-800 leading-snug">
                          {faq.q}
                        </span>
                        <FiChevronDown
                          className={`text-gray-400 shrink-0 transition-transform duration-200 ${
                            isOpen ? 'rotate-180 text-red-600' : ''
                          }`}
                        />
                      </button>
                      <AnimatePresence>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-4 pt-1 text-xs text-gray-600 leading-relaxed border-t border-gray-100">
                              {faq.a}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer Notice */}
            <div className="pt-4 text-center">
              <p className="text-xs text-slate-400 font-medium">
                SafeFire Vendor Operations — Support tickets and partner inquiries are reviewed within 24 business hours.
              </p>
            </div>
          </div>
        </main>

        {/* Bottom Footer */}
        <footer className="bg-white border-t border-[#E5E7EB] py-4 px-4 text-center text-xs text-[#64748B] mt-8">
          <p>© {new Date().getFullYear()} SafeFire Technologies. All vendor rights reserved.</p>
        </footer>
      </div>
    </PageTransition>
  );
};

export default VendorSupport;
