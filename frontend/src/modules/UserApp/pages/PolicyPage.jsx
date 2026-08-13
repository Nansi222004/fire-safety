import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FiChevronLeft,
  FiShield,
  FiRotateCcw,
  FiHeadphones,
  FiHome,
  FiChevronRight
} from "react-icons/fi";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import PageTransition from "../../../shared/components/PageTransition";
import api from "../../../shared/utils/api";
import HelpCenter from "./HelpCenter";

const FALLBACK_POLICIES = {
  "privacy-policy": {
    title: "SafeFire Privacy Policy",
    lastUpdated: new Date().toISOString(),
    content: `
      <h2>1. Information We Collect</h2>
      <p>SafeFire collects customer contact and delivery address details solely to process fire safety equipment orders, dispatch certified technicians for extinguisher refills and safety audits, and issue regulatory compliance certificates.</p>
      <h2>2. Fire Protection Service Records</h2>
      <p>Your maintenance logs, extinguisher serial numbers, test dates, and Annual Maintenance Contract (AMC) records are encrypted and securely stored to help you maintain continuous compliance and receive timely inspection reminders.</p>
      <h2>3. Data Protection & Security</h2>
      <p>We implement industry-standard 256-bit encryption for all customer accounts, service transactions, and compliance records. Your information is never sold or shared with unauthorized third parties.</p>
      <h2>4. Contact Us</h2>
      <p>For any privacy inquiries or records management requests, please contact our support desk at support@safefire.demo.</p>
    `,
  },
  "terms-conditions": {
    title: "SafeFire Safety Terms & Warranty Conditions",
    lastUpdated: new Date().toISOString(),
    content: `
      <h2>1. Equipment Certification & Warranty</h2>
      <p>All fire extinguishers, smoke alarms, fire hose reels, and emergency safety gear supplied by SafeFire are certified and covered under standard manufacturer warranty against manufacturing defects.</p>
      <h2>2. Certified On-Site Services</h2>
      <p>All refill, hydro-testing, and maintenance services are carried out by certified fire safety technicians following strict safety codes and manufacturer guidelines.</p>
      <h2>3. Safe Operation & Handling</h2>
      <p>Users must adhere to standard safety procedures (such as the P.A.S.S. technique) and ensure pressure gauges are routinely checked. Tampering with safety pins or pressure valves voids equipment warranty.</p>
      <h2>4. Delivery & Installation</h2>
      <p>Certified equipment is delivered in shock-absorbing protective packaging within 24 to 48 business hours.</p>
    `,
  },
  "refund-policy": {
    title: "SafeFire Replacement & Service Cancellation Policy",
    lastUpdated: new Date().toISOString(),
    content: `
      <h2>1. 7-Day Replacement Guarantee</h2>
      <p>If any equipment arrives damaged, with broken safety seals, or pressure gauge discrepancies, we provide an immediate free replacement within 7 days of delivery.</p>
      <h2>2. On-Site Service Cancellation</h2>
      <p>Scheduled maintenance and refill service visits can be rescheduled or cancelled up to 2 hours prior to the technician's appointment time.</p>
    `,
  },
};

const PolicyPage = ({ defaultType = "privacy-policy" }) => {
  const { type: paramType } = useParams();
  const type = paramType || defaultType;
  const navigate = useNavigate();
  const [dynamicPolicy, setDynamicPolicy] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Map legacy URLs to valid backend types
  const apiType = useMemo(() => {
    if (!type || type === "privacy-policy" || type === "privacy") return "privacy-policy";
    if (type === "terms" || type === "terms-conditions" || type === "safety-terms") return "terms-conditions";
    if (type === "return" || type === "refund" || type === "refund-policy") return "refund-policy";
    if (type === "seller" || type === "seller-terms") return "seller-terms";
    if (type === "support" || type === "faq" || type === "help") return "faq";
    return type;
  }, [type]);

  useEffect(() => {
    let cancelled = false;

    const fetchPolicy = async () => {
      setIsLoading(true);
      try {
        const response = await api.get(`/policies/${apiType}`);
        const data = response?.data ?? response;
        if (!cancelled && data && data.content) {
          setDynamicPolicy(data);
        } else if (!cancelled) {
          setDynamicPolicy(FALLBACK_POLICIES[apiType] || FALLBACK_POLICIES["privacy-policy"]);
        }
      } catch {
        if (!cancelled) {
          setDynamicPolicy(FALLBACK_POLICIES[apiType] || FALLBACK_POLICIES["privacy-policy"]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchPolicy();
    return () => {
      cancelled = true;
    };
  }, [apiType]);

  const formatLastUpdated = (dateString) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return "";
    }
  };

  const title = useMemo(() => {
    switch (apiType) {
      case "privacy-policy": return "Safety Policies & Privacy";
      case "terms-conditions": return "Terms & Warranty Conditions";
      case "refund-policy": return "Replacement & Refund Policy";
      case "seller-terms": return "Seller Terms & Conditions";
      case "faq": return "Fire Safety Help & Support";
      default: return "Policy Details";
    }
  }, [apiType]);

  return (
    <PageTransition>
      <div className="min-h-screen bg-[#F8FAFC] pb-20 font-sans text-slate-900">
        {/* Mobile Header (Hidden on Desktop) */}
        <div className="md:hidden bg-white px-4 py-3.5 sticky top-0 z-50 flex items-center gap-3 border-b border-gray-200 shadow-xs">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-1.5 -ml-1.5 rounded-xl hover:bg-gray-100 active:bg-gray-200 transition-colors text-slate-700"
          >
            <FiChevronLeft className="text-xl" />
          </button>
          <h1 className="text-sm font-bold text-slate-900 truncate">{title}</h1>
        </div>

        {/* Content Section */}
        {apiType === "faq" && !isLoading && dynamicPolicy?.items ? (
          <HelpCenter dynamicPolicy={dynamicPolicy} />
        ) : (
          <div className="px-4 md:px-8 py-6 md:py-10 w-full max-w-[850px] mx-auto">
            {/* Desktop Breadcrumb (Hidden on Mobile) */}
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 mb-6">
              <Link to="/" className="flex items-center gap-1 hover:text-primary-600 transition-colors font-medium">
                <FiHome />
                <span>Home</span>
              </Link>
              <FiChevronRight className="text-slate-400" />
              <Link to="/profile" className="hover:text-primary-600 transition-colors font-medium">
                Profile
              </Link>
              <FiChevronRight className="text-slate-400" />
              <span className="font-bold text-slate-900">{title}</span>
            </div>

            <div className="bg-white rounded-2xl md:rounded-3xl p-6 md:p-10 shadow-sm border border-slate-200/80">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-3">
                  <div className="w-8 h-8 border-3 border-primary-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-slate-500 font-semibold animate-pulse">Loading policy details...</p>
                </div>
              ) : dynamicPolicy ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  {/* Document Header */}
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 text-primary-600 border border-red-200 rounded-full text-[11px] font-bold uppercase tracking-wider mb-2">
                      <FiShield className="text-xs" />
                      <span>SafeFire Certified Compliance</span>
                    </div>
                    <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-slate-900 mt-1">
                      {dynamicPolicy.title || title}
                    </h1>
                    {dynamicPolicy.lastUpdated && (
                      <p className="text-xs font-semibold text-slate-400 mt-1">
                        Effective {formatLastUpdated(dynamicPolicy.lastUpdated)}
                      </p>
                    )}
                  </div>

                  <hr className="border-t border-slate-100" />

                  {/* Document Content */}
                  {dynamicPolicy.content && (
                    <div
                      className="text-xs sm:text-sm text-slate-700 leading-relaxed space-y-4
                                 [&>h2]:text-base [&>h2]:font-bold [&>h2]:text-slate-900 [&>h2]:pt-2
                                 [&>h3]:text-sm [&>h3]:font-bold [&>h3]:text-slate-900
                                 [&>p]:text-slate-600 [&>p]:leading-relaxed
                                 [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:space-y-1 [&>ul>li]:text-slate-600
                                 [&>ol]:list-decimal [&>ol]:pl-5 [&>ol]:space-y-1"
                      dangerouslySetInnerHTML={{ __html: dynamicPolicy.content }}
                    />
                  )}
                </motion.div>
              ) : null}
            </div>

            {/* Footer Note */}
            <div className="text-center py-6">
              <p className="text-xs text-slate-400">
                SafeFire Fire Safety Platform &bull; Customer Support: support@safefire.demo
              </p>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
};

export default PolicyPage;
