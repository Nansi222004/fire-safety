import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { FiArrowLeft, FiCheckCircle, FiMail, FiShield, FiRefreshCw } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { verifyVendorOTP, resendVendorOTP } from '../services/vendorService';
import toast from 'react-hot-toast';
import { appLogo } from '../../../shared/utils/imagePaths';

const VendorVerification = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const OTP_LENGTH = 6;
  const [codes, setCodes] = useState(Array(OTP_LENGTH).fill(''));
  const [isLoading, setIsLoading] = useState(false);
  const inputRefs = useRef([]);

  const email = location.state?.email || 'your email';
  const [resendCooldown, setResendCooldown] = useState(0);

  // Focus first input on mount
  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, []);

  const handleChange = (index, value) => {
    // Handle pasting multi-digit into single box
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, OTP_LENGTH).split('');
      if (digits.length > 0) {
        const newCodes = [...codes];
        digits.forEach((d, i) => {
          if (index + i < OTP_LENGTH) {
            newCodes[index + i] = d;
          }
        });
        setCodes(newCodes);
        const nextIndex = Math.min(index + digits.length, OTP_LENGTH - 1);
        inputRefs.current[nextIndex]?.focus();
      }
      return;
    }

    const cleanVal = value.replace(/\D/g, '');
    const newCodes = [...codes];
    newCodes[index] = cleanVal;
    setCodes(newCodes);

    // Auto-focus next input
    if (cleanVal && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    // Handle backspace
    if (e.key === 'Backspace' && !codes[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim().replace(/\D/g, '');
    if (pastedData.length === OTP_LENGTH) {
      const newCodes = pastedData.split('');
      setCodes(newCodes);
      inputRefs.current[OTP_LENGTH - 1]?.focus();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const verificationCode = codes.join('');

    if (verificationCode.length !== OTP_LENGTH) {
      toast.error('Please enter the complete 6-digit verification code.');
      return;
    }

    setIsLoading(true);
    try {
      await verifyVendorOTP(email, verificationCode);
      toast.success('Email verified successfully! Your seller account is pending admin approval.');
      navigate('/vendor/login');
    } catch {
      // Error toast is handled by API interceptor
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !email) return;
    try {
      await resendVendorOTP(email);
      toast.success('Verification code resent! Please check your inbox.');
      setResendCooldown(30);
      const timer = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) { clearInterval(timer); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch {
      // API interceptor shows toast
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1F2937] flex flex-col justify-between">
      {/* 1. Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-[#E5E7EB] px-4 lg:px-8 py-3.5 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <img src={appLogo} alt="Fire Safety Shop Logo" className="h-9 w-auto object-contain" />
            <div>
              <span className="text-lg font-bold text-[#0F172A] tracking-tight group-hover:text-[#E31E24] transition-colors block leading-none">
                Fire Safety Shop
              </span>
              <span className="text-xs text-[#64748B] font-medium block mt-0.5">
                Seller Account Verification
              </span>
            </div>
          </Link>

          <Link
            to="/vendor/login"
            className="px-4 py-2 text-xs font-semibold text-[#E31E24] bg-[#FEF2F2] hover:bg-red-100 rounded-xl border border-red-200 transition-colors"
          >
            Back to Login
          </Link>
        </div>
      </header>

      {/* 2. Main Verification Content */}
      <main className="flex-1 flex items-center justify-center p-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl border border-[#E5E7EB] p-6 sm:p-8 w-full max-w-md shadow-xl space-y-6"
        >
          {/* Top Icon & Text */}
          <div className="text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-[#FEF2F2] text-[#E31E24] border border-red-100 flex items-center justify-center mx-auto shadow-sm">
              <FiMail className="text-2xl" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-[#0F172A] tracking-tight">Verify Your Email</h1>
              <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
                We sent a 6-digit verification code to <br />
                <span className="font-bold text-[#0F172A]">{email}</span>
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Responsive non-overflowing OTP inputs */}
            <div className="flex justify-center gap-1.5 sm:gap-2.5">
              {codes.map((code, index) => (
                <input
                  key={index}
                  ref={(el) => (inputRefs.current[index] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={code}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={index === 0 ? handlePaste : undefined}
                  className="w-10 h-12 sm:w-12 sm:h-14 text-center text-xl font-extrabold bg-[#F8FAFC] border-2 border-[#E5E7EB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:bg-white text-[#0F172A] transition-all shadow-xs"
                />
              ))}
            </div>

            {/* Resend OTP button */}
            <div className="text-center">
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#E31E24] hover:text-[#C8191E] disabled:text-[#94A3B8] disabled:cursor-not-allowed transition-colors"
              >
                <FiRefreshCw className={resendCooldown > 0 ? "animate-spin" : ""} />
                {resendCooldown > 0
                  ? `Resend OTP in ${resendCooldown}s`
                  : "Didn't receive the code? Resend OTP"}
              </button>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || codes.some(c => !c)}
              className="w-full py-3.5 px-4 rounded-xl bg-[#E31E24] hover:bg-[#C8191E] text-white font-bold text-sm shadow-md transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <span>Verifying Code...</span>
              ) : (
                <>
                  <FiCheckCircle className="text-base" />
                  <span>Verify Seller Email</span>
                </>
              )}
            </button>

            {/* Back to Login */}
            <div className="text-center pt-2 border-t border-[#E5E7EB]">
              <Link
                to="/vendor/login"
                className="inline-flex items-center gap-2 text-xs font-semibold text-[#64748B] hover:text-[#0F172A] transition-colors"
              >
                <FiArrowLeft />
                Return to Seller Login
              </Link>
            </div>
          </form>
        </motion.div>
      </main>

      {/* 3. Simple Footer */}
      <footer className="py-4 text-center text-xs text-[#64748B] border-t border-[#E5E7EB] bg-white">
        © {new Date().getFullYear()} SafeFire Marketplace. Certified Fire Safety & Compliance Platform.
      </footer>
    </div>
  );
};

export default VendorVerification;

