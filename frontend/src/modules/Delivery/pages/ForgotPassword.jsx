import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiCheck, FiMail, FiRefreshCw, FiTruck } from 'react-icons/fi';
import toast from 'react-hot-toast';
import PageTransition from '../../../shared/components/PageTransition';
import { useDeliveryAuthStore } from '../store/deliveryStore';
import { appLogo } from '../../../shared/utils/imagePaths';

const OTP_LENGTH = 6;

const DeliveryForgotPassword = () => {
  const navigate = useNavigate();
  const { forgotPassword, verifyResetOtp, isLoading } = useDeliveryAuthStore();
  const [email, setEmail] = useState('');
  const [step, setStep] = useState('request');
  const [codes, setCodes] = useState(Array(OTP_LENGTH).fill(''));
  const inputRefs = useRef([]);

  useEffect(() => {
    if (step === 'verify' && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [step]);

  const handleRequestOtp = async (e) => {
    if (e) e.preventDefault();
    if (!email.trim()) {
      toast.error('Please enter your email.');
      return;
    }

    try {
      await forgotPassword(email.trim().toLowerCase());
      toast.success('If the email exists, reset OTP has been sent.');
      setStep('verify');
    } catch {
      // Global API interceptor shows toast
    }
  };

  const handleCodeChange = (index, value) => {
    if (value.length > 1 || (value && !/^\d$/.test(value))) return;
    const next = [...codes];
    next[index] = value;
    setCodes(next);
    if (value && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !codes[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').trim();
    if (!/^\d{6}$/.test(pasted)) return;
    setCodes(pasted.split(''));
    inputRefs.current[OTP_LENGTH - 1]?.focus();
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    const otp = codes.join('');
    if (otp.length !== OTP_LENGTH) {
      toast.error('Please enter the full OTP.');
      return;
    }

    try {
      await verifyResetOtp(email.trim().toLowerCase(), otp);
      toast.success('OTP verified. Please set your new password.');
      navigate(`/delivery/reset-password?email=${encodeURIComponent(email.trim().toLowerCase())}`);
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
                <h1 className="text-2xl font-extrabold text-[#0F172A] tracking-tight">Forgot Password</h1>
                <p className="text-xs text-[#64748B] mt-1">
                  {step === 'request'
                    ? 'Enter your registered delivery account email to receive a recovery OTP'
                    : `Enter the 6-digit OTP sent to ${email}`}
                </p>
              </div>
            </div>

            {step === 'request' ? (
              <form onSubmit={handleRequestOtp} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-[#1F2937] uppercase tracking-wider mb-1.5">
                    Email Address <span className="text-[#E31E24]">*</span>
                  </label>
                  <div className="relative">
                    <FiMail className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-[#64748B]" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="delivery@delivery.com"
                      className="w-full pl-10 pr-4 py-3 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:bg-white text-sm text-[#0F172A] placeholder:text-[#94A3B8] transition-all"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3.5 px-4 rounded-xl bg-[#E31E24] hover:bg-[#C8191F] text-white font-bold text-sm shadow-md transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoading ? 'Sending OTP...' : 'Send Recovery OTP'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-5">
                <div className="flex justify-center gap-2">
                  {codes.map((code, index) => (
                    <input
                      key={index}
                      ref={(el) => (inputRefs.current[index] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={code}
                      onChange={(e) => handleCodeChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      onPaste={index === 0 ? handlePaste : undefined}
                      className="w-11 h-12 text-center text-lg font-bold bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:bg-white text-[#0F172A] transition-all"
                    />
                  ))}
                </div>

                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={handleRequestOtp}
                    disabled={isLoading}
                    className="text-[#E31E24] hover:underline font-semibold disabled:text-gray-400 inline-flex items-center gap-1.5"
                  >
                    <FiRefreshCw className="text-xs" />
                    Resend OTP
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep('request')}
                    className="text-[#64748B] hover:text-[#0F172A] font-medium"
                  >
                    Change Email
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || codes.some((c) => !c)}
                  className="w-full py-3.5 px-4 rounded-xl bg-[#E31E24] hover:bg-[#C8191F] text-white font-bold text-sm shadow-md transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoading ? 'Verifying...' : <><FiCheck /> Verify OTP</>}
                </button>
              </form>
            )}

            <div className="text-center pt-2 border-t border-[#E5E7EB]">
              <Link to="/delivery/login" className="inline-flex items-center gap-1.5 text-xs text-[#64748B] hover:text-[#0F172A] font-semibold">
                <FiArrowLeft />
                <span>Return to Login</span>
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

export default DeliveryForgotPassword;
