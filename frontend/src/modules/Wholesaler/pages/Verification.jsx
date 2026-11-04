import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { FiMail } from "react-icons/fi";
import toast from "react-hot-toast";
import { useWholesalerAuthStore } from "../store/wholesalerAuthStore";
import AuthShell, { inputClass, labelClass, primaryButtonClass } from "../components/AuthShell";

const WholesalerVerification = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { verifyOtp, resendOtp } = useWholesalerAuthStore();
  const [email, setEmail] = useState(location.state?.email || "");
  const [otp, setOtp] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!email.trim() || !/^\d{6}$/.test(otp)) {
      toast.error("Enter your email and the 6-digit OTP.");
      return;
    }
    setIsVerifying(true);
    try {
      await verifyOtp(email.trim().toLowerCase(), otp);
      toast.success("Email verified. Your account is now awaiting admin approval.");
      navigate("/wholesaler/login", { replace: true });
    } catch (error) {
      if (!error?.toastShown) toast.error(error.message || "Verification failed.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!email.trim()) {
      toast.error("Enter your email first.");
      return;
    }
    setIsResending(true);
    try {
      await resendOtp(email.trim().toLowerCase());
      toast.success("A new OTP has been sent.");
    } catch (error) {
      if (!error?.toastShown) toast.error(error.message || "Could not resend OTP.");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <AuthShell icon={FiMail} title="Verify Your Email" subtitle="Enter the 6-digit code we sent to your business email.">
      <form onSubmit={handleVerify} className="space-y-4">
        <div>
          <label className={labelClass}>Email</label>
          <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className={labelClass}>OTP</label>
          <input
            inputMode="numeric"
            maxLength={6}
            className={`${inputClass} text-center tracking-[0.5em] font-bold`}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            placeholder="••••••"
            required
          />
        </div>
        <button type="submit" disabled={isVerifying} className={primaryButtonClass}>
          {isVerifying ? "Verifying..." : "Verify Email"}
        </button>
        <div className="flex items-center justify-between text-xs pt-1">
          <button type="button" onClick={handleResend} disabled={isResending} className="font-bold text-[#E31E24] hover:underline disabled:opacity-50">
            {isResending ? "Sending..." : "Resend OTP"}
          </button>
          <Link to="/wholesaler/login" className="font-semibold text-[#64748B] hover:text-[#0F172A]">Back to login</Link>
        </div>
      </form>
    </AuthShell>
  );
};

export default WholesalerVerification;
