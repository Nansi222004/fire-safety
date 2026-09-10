import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  FiShield, 
  FiMail, 
  FiPhone, 
  FiArrowLeft, 
  FiShoppingBag, 
  FiClock, 
  FiHelpCircle 
} from 'react-icons/fi';
import { motion } from 'framer-motion';
import PageTransition from '../../../shared/components/PageTransition';
import { appLogo } from '../../../shared/utils/imagePaths';
import api from '../../../shared/utils/api';
import { useVendorAuthStore } from '../store/vendorAuthStore';

const VendorPrivacyPolicy = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useVendorAuthStore();

  const [policy, setPolicy] = useState(null);
  const [supportEmail, setSupportEmail] = useState('support@safefire.demo');
  const [supportPhone, setSupportPhone] = useState('+91 98765 43210');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;

    const fetchPolicyAndSettings = async () => {
      setIsLoading(true);
      try {
        const [policyRes, settingsRes] = await Promise.allSettled([
          api.get('/policies/seller-privacy'),
          api.get('/settings/general')
        ]);

        if (isCancelled) return;

        // Extract settings
        if (settingsRes.status === 'fulfilled' && settingsRes.value?.data?.data) {
          const settings = settingsRes.value.data.data;
          const email = settings.supportEmail || settings.contactEmail;
          const phone = settings.contactPhone || settings.supportPhone;
          if (email) setSupportEmail(email);
          if (phone) setSupportPhone(phone);
        }

        // Extract policy
        if (policyRes.status === 'fulfilled' && policyRes.value?.data?.data) {
          const policyData = policyRes.value.data.data;
          setPolicy(policyData);
          if (policyData.supportEmail) setSupportEmail(policyData.supportEmail);
          if (policyData.supportPhone || policyData.contactPhone) {
            setSupportPhone(policyData.supportPhone || policyData.contactPhone);
          }
        }
      } catch (err) {
        console.error('Failed to load seller privacy policy:', err);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    fetchPolicyAndSettings();
    return () => {
      isCancelled = true;
    };
  }, []);

  const fallbackContent = `
    <h2>1. Merchant & Seller Data Privacy</h2>
    <p>SafeFire collects business verification information, GSTIN certificates, bank settlement details, and catalog inventory data solely to operate the certified fire safety marketplace and process vendor payouts.</p>
    <h2>2. Fire Safety Certification & Standards</h2>
    <p>All safety gear listings, fire extinguisher technical sheets, and technician service capabilities are audited. Merchant compliance records are maintained securely to protect buyers and certified safety protocols.</p>
    <h2>3. Financial & Settlement Data Security</h2>
    <p>Bank accounts and payout transaction records are encrypted using institutional-grade protocols. SafeFire never shares merchant financial data with third-party advertisers or unauthorized platforms.</p>
    <h2>4. Seller Grievances & Policy Assistance</h2>
    <p>For inquiries regarding your seller account, compliance documentation, or data privacy, our dedicated seller support desk is available to assist you.</p>
  `;

  const activeContent = policy?.content || fallbackContent;
  const sanitizedContent = activeContent
    .replace(/support@safefire\.demo/gi, supportEmail)
    .replace(/\+91\s*98765\s*43210/gi, supportPhone);

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
                  Seller & Vendor Partner Portal
                </span>
              </div>
            </Link>

            <button
              onClick={() => navigate(isAuthenticated ? '/vendor/dashboard' : '/vendor/login')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-[#E31E24] bg-[#FEF2F2] hover:bg-red-100 rounded-xl border border-red-200 transition-colors"
            >
              <FiArrowLeft className="text-sm" />
              <span>{isAuthenticated ? 'Back to Dashboard' : 'Back to Login'}</span>
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
          {/* Breadcrumb / Status Badge */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 text-red-600 border border-red-200 text-xs font-bold">
              <FiShield className="text-sm" />
              <span>Seller Compliance & Privacy Policy</span>
            </div>
            {policy?.lastUpdated && (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                <FiClock className="text-slate-400" />
                <span>Last updated: {new Date(policy.lastUpdated).toLocaleDateString()}</span>
              </div>
            )}
          </div>

          {/* Policy Card Container */}
          <div className="bg-white rounded-3xl border border-[#E5E7EB] p-6 sm:p-10 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-5">
              <div className="flex items-center gap-3 text-red-600 mb-2">
                <div className="w-10 h-10 rounded-2xl bg-red-50 flex items-center justify-center text-xl">
                  <FiShoppingBag />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] tracking-tight">
                    {policy?.title || 'Seller & Merchant Privacy Policy'}
                  </h1>
                  <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
                    Data protection standards, KYC confidentiality, and seller marketplace compliance
                  </p>
                </div>
              </div>
            </div>

            {/* Policy HTML Body */}
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-3">
                <div className="w-8 h-8 border-3 border-red-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-slate-500 font-semibold animate-pulse">Loading privacy policy details...</p>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div
                  className="text-xs sm:text-sm text-slate-700 leading-relaxed space-y-4
                             [&>h2]:text-base [&>h2]:font-bold [&>h2]:text-slate-900 [&>h2]:pt-3
                             [&>h3]:text-sm [&>h3]:font-bold [&>h3]:text-slate-900
                             [&>p]:text-slate-600 [&>p]:leading-relaxed
                             [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:space-y-1 [&>ul>li]:text-slate-600
                             [&>ol]:list-decimal [&>ol]:pl-5 [&>ol]:space-y-1"
                  dangerouslySetInnerHTML={{ __html: sanitizedContent }}
                />

                {/* Dynamic Support Contact Desk Card */}
                <div className="mt-8 pt-6 border-t border-slate-100">
                  <div className="bg-gradient-to-br from-red-50/70 via-slate-50 to-white p-6 rounded-2xl border border-red-100">
                    <div className="flex items-start gap-3.5 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center text-lg shadow-xs flex-shrink-0">
                        <FiHelpCircle />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">
                          Seller Partner Support & Privacy Desk
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Questions about your seller onboarding, KYC verification, or payout records? Contact our partner desk directly:
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      {/* Dynamic Support Email */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200/80 flex items-center justify-between gap-3 shadow-2xs">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
                            <FiMail className="text-base" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Support Email</p>
                            <p className="text-xs font-bold text-slate-800 truncate" title={supportEmail}>
                              {supportEmail}
                            </p>
                          </div>
                        </div>
                        <a
                          href={`mailto:${supportEmail}`}
                          className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-xs font-bold transition-colors flex-shrink-0"
                        >
                          Email
                        </a>
                      </div>

                      {/* Dynamic Support Contact Phone */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200/80 flex items-center justify-between gap-3 shadow-2xs">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
                            <FiPhone className="text-base" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Support Contact</p>
                            <p className="text-xs font-bold text-slate-800 truncate" title={supportPhone}>
                              {supportPhone}
                            </p>
                          </div>
                        </div>
                        <a
                          href={`tel:${supportPhone.replace(/\s+/g, '')}`}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors flex-shrink-0 shadow-2xs"
                        >
                          Call
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </main>

        {/* Footer */}
        <footer className="py-4 text-center text-xs text-[#64748B] border-t border-[#E5E7EB] bg-white px-4">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>© {new Date().getFullYear()} SafeFire Marketplace. Certified Fire Safety & Compliance Platform.</span>
            <div className="flex items-center gap-4 text-slate-600">
              <span>
                Support:{' '}
                <a href={`mailto:${supportEmail}`} className="text-red-600 hover:underline font-semibold">
                  {supportEmail}
                </a>
              </span>
              <span>•</span>
              <span>
                Helpline:{' '}
                <a href={`tel:${supportPhone.replace(/\s+/g, '')}`} className="text-red-600 hover:underline font-semibold">
                  {supportPhone}
                </a>
              </span>
            </div>
          </div>
        </footer>
      </div>
    </PageTransition>
  );
};

export default VendorPrivacyPolicy;
