import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { FiKey } from "react-icons/fi";
import toast from "react-hot-toast";
import { useWholesalerAuthStore } from "../store/wholesalerAuthStore";
import AuthShell, { inputClass, labelClass, primaryButtonClass } from "../components/AuthShell";

const STEP_SUBTITLES = {
  email: "Enter your registered email to receive a reset code.",
  otp: "Enter the 6-digit code sent to your email.",
  password: "Choose a new password for your wholesaler account.",
};

// Single-page password reset: email → OTP → new password.
const WholesalerForgotPassword = () => {
  const navigate = useNavigate();
  const { forgotPassword, verifyResetOtp, resetPassword, isLoading } = useWholesalerAuthStore();
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const run = async (action) => {
    try {
      await action();
    } catch (error) {
      if (!error?.toastShown) toast.error(error.message || "Something went wrong.");
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (step === "email") {
      return run(async () => {
        const result = await forgotPassword(normalizedEmail);
        toast.success(result.message || "If the email exists, a reset code has been sent.");
        setStep("otp");
      });
    }
    if (step === "otp") {
      if (!/^\d{6}$/.test(otp)) return toast.error("Enter the 6-digit code.");
      return run(async () => {
        await verifyResetOtp(normalizedEmail, otp);
        setStep("password");
      });
    }
    if (password.length < 6) return toast.error("Password must be at least 6 characters.");
    if (password !== confirmPassword) return toast.error("Passwords do not match.");
    return run(async () => {
      await resetPassword(normalizedEmail, password, confirmPassword);
      toast.success("Password reset. Please log in.");
      navigate("/wholesaler/login", { replace: true });
    });
  };

  return (
    <AuthShell icon={FiKey} title="Reset Password" subtitle={STEP_SUBTITLES[step]}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {step === "email" && (
          <div>
            <label className={labelClass}>Email</label>
            <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
        )}
        {step === "otp" && (
          <div>
            <label className={labelClass}>Reset Code</label>
            <input
              inputMode="numeric"
              maxLength={6}
              className={`${inputClass} text-center tracking-[0.5em] font-bold`}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              required
            />
          </div>
        )}
        {step === "password" && (
          <>
            <div>
              <label className={labelClass}>New Password</label>
              <input type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div>
              <label className={labelClass}>Confirm Password</label>
              <input type="password" className={inputClass} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            </div>
          </>
        )}
        <button type="submit" disabled={isLoading} className={primaryButtonClass}>
          {isLoading ? "Please wait..." : step === "password" ? "Reset Password" : "Continue"}
        </button>
        <div className="text-center text-xs">
          <Link to="/wholesaler/login" className="font-semibold text-[#64748B] hover:text-[#0F172A]">Back to login</Link>
        </div>
      </form>
    </AuthShell>
  );
};

export default WholesalerForgotPassword;
