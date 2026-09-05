import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiMail, FiLock, FiEye, FiEyeOff, FiUser, FiPhone, FiTruck, FiMapPin, FiFileText, FiChevronDown, FiArrowLeft } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useDeliveryAuthStore } from '../store/deliveryStore';
import { appLogo } from '../../../shared/utils/imagePaths';
import PageTransition from '../../../shared/components/PageTransition';

const DeliveryRegister = () => {
  const navigate = useNavigate();
  const { register, isLoading } = useDeliveryAuthStore();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    vehicleType: 'Bike',
    vehicleNumber: '',
    password: '',
    confirmPassword: '',
    drivingLicense: null,
    aadharCard: null,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [vehicleDropdownOpen, setVehicleDropdownOpen] = useState(false);

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    if (name === 'drivingLicense' || name === 'aadharCard') {
      setFormData((prev) => ({ ...prev, [name]: files?.[0] || null }));
      return;
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name || !formData.email || !formData.phone || !formData.address || !formData.vehicleType || !formData.vehicleNumber || !formData.password) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (!formData.drivingLicense || !formData.aadharCard) {
      toast.error('Driving License and Aadhar Card are required');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (formData.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    try {
      const result = await register({
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        address: formData.address.trim(),
        vehicleType: formData.vehicleType,
        vehicleNumber: formData.vehicleNumber.trim(),
        password: formData.password,
        drivingLicense: formData.drivingLicense,
        aadharCard: formData.aadharCard,
      });
      toast.success(result.message || 'Registration submitted');
      navigate('/delivery/login', { replace: true });
    } catch (error) {
      toast.error(error.message || 'Registration failed');
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
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-[#E31E24] bg-[#FEF2F2] hover:bg-red-100 rounded-xl border border-red-200 transition-colors"
            >
              <FiArrowLeft className="text-sm" />
              <span>Back to Login</span>
            </Link>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 flex items-center justify-center p-4 py-8 sm:py-12">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="bg-white rounded-3xl border border-[#E5E7EB] p-6 sm:p-8 w-full max-w-2xl shadow-xl space-y-6"
          >
            {/* Header */}
            <div className="text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-[#FEF2F2] text-[#E31E24] border border-red-100 flex items-center justify-center mx-auto shadow-sm">
                <FiTruck className="text-2xl" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-[#0F172A] tracking-tight">Join as Delivery Partner</h1>
                <p className="text-xs text-[#64748B] mt-1">
                  Register your account and submit details for verification
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Personal Information */}
              <div>
                <h3 className="text-xs font-bold text-[#1F2937] uppercase tracking-wider mb-3">Personal Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Full Name <span className="text-[#E31E24]">*</span>
                    </label>
                    <div className="relative">
                      <FiUser className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-[#64748B]" />
                      <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="John Doe"
                        required
                        className="w-full pl-10 pr-4 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:bg-white text-sm text-[#0F172A] placeholder:text-[#94A3B8] transition-all"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Email Address <span className="text-[#E31E24]">*</span>
                    </label>
                    <div className="relative">
                      <FiMail className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-[#64748B]" />
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="delivery@example.com"
                        required
                        className="w-full pl-10 pr-4 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:bg-white text-sm text-[#0F172A] placeholder:text-[#94A3B8] transition-all"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Phone Number <span className="text-[#E31E24]">*</span>
                    </label>
                    <div className="relative">
                      <FiPhone className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-[#64748B]" />
                      <input
                        type="tel"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        placeholder="+91 9876543210"
                        required
                        className="w-full pl-10 pr-4 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:bg-white text-sm text-[#0F172A] placeholder:text-[#94A3B8] transition-all"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Address <span className="text-[#E31E24]">*</span>
                    </label>
                    <div className="relative">
                      <FiMapPin className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-[#64748B]" />
                      <input
                        type="text"
                        name="address"
                        value={formData.address}
                        onChange={handleChange}
                        placeholder="City, State"
                        required
                        className="w-full pl-10 pr-4 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:bg-white text-sm text-[#0F172A] placeholder:text-[#94A3B8] transition-all"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Vehicle Information */}
              <div>
                <h3 className="text-xs font-bold text-[#1F2937] uppercase tracking-wider mb-3">Vehicle Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative w-full">
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Vehicle Type <span className="text-[#E31E24]">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setVehicleDropdownOpen(!vehicleDropdownOpen)}
                      className="w-full flex items-center justify-between px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:bg-white text-sm text-[#0F172A] text-left transition-all"
                    >
                      <span className="font-medium">{formData.vehicleType || 'Select Vehicle Type'}</span>
                      <FiChevronDown className={`text-[#64748B] text-base flex-shrink-0 transition-transform ${vehicleDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    <AnimatePresence>
                      {vehicleDropdownOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          className="absolute left-0 right-0 top-full mt-1 bg-white border border-[#E5E7EB] rounded-xl shadow-xl z-50 overflow-hidden"
                        >
                          {['Bike', 'Scooter', 'Car', 'Van'].map((type) => (
                            <button
                              key={type}
                              type="button"
                              onClick={() => {
                                setFormData((prev) => ({ ...prev, vehicleType: type }));
                                setVehicleDropdownOpen(false);
                              }}
                              className={`w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-red-50 transition-colors ${formData.vehicleType === type ? 'bg-[#FEF2F2] text-[#E31E24] font-bold' : 'text-gray-700'}`}
                            >
                              {type}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Vehicle Number <span className="text-[#E31E24]">*</span>
                    </label>
                    <input
                      type="text"
                      name="vehicleNumber"
                      value={formData.vehicleNumber}
                      onChange={handleChange}
                      placeholder="e.g. DL 01 AB 1234"
                      required
                      className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:bg-white text-sm text-[#0F172A] placeholder:text-[#94A3B8] transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Document Upload */}
              <div>
                <h3 className="text-xs font-bold text-[#1F2937] uppercase tracking-wider mb-3">Document Upload</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Driving License <span className="text-[#E31E24]">*</span>
                    </label>
                    <div className="relative">
                      <FiFileText className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-[#64748B]" />
                      <input
                        type="file"
                        name="drivingLicense"
                        onChange={handleChange}
                        accept=".pdf,image/*"
                        required
                        className="w-full pl-10 pr-4 py-2 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl focus:outline-none focus:border-[#E31E24] text-xs text-[#0F172A] file:mr-3 file:rounded-lg file:border-0 file:bg-[#FEF2F2] file:px-3 file:py-1 file:text-xs file:font-semibold file:text-[#E31E24] hover:file:bg-red-100"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Aadhar Card <span className="text-[#E31E24]">*</span>
                    </label>
                    <div className="relative">
                      <FiFileText className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-[#64748B]" />
                      <input
                        type="file"
                        name="aadharCard"
                        onChange={handleChange}
                        accept=".pdf,image/*"
                        required
                        className="w-full pl-10 pr-4 py-2 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl focus:outline-none focus:border-[#E31E24] text-xs text-[#0F172A] file:mr-3 file:rounded-lg file:border-0 file:bg-[#FEF2F2] file:px-3 file:py-1 file:text-xs file:font-semibold file:text-[#E31E24] hover:file:bg-red-100"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Account Security */}
              <div>
                <h3 className="text-xs font-bold text-[#1F2937] uppercase tracking-wider mb-3">Account Security</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Password <span className="text-[#E31E24]">*</span>
                    </label>
                    <div className="relative">
                      <FiLock className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-[#64748B]" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        placeholder="Minimum 6 characters"
                        required
                        className="w-full pl-10 pr-11 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:bg-white text-sm text-[#0F172A] placeholder:text-[#94A3B8] transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3.5 top-1/2 transform -translate-y-1/2 text-[#64748B] hover:text-[#0F172A]"
                      >
                        {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Confirm Password <span className="text-[#E31E24]">*</span>
                    </label>
                    <div className="relative">
                      <FiLock className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-[#64748B]" />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        name="confirmPassword"
                        value={formData.confirmPassword}
                        onChange={handleChange}
                        placeholder="Re-enter password"
                        required
                        className="w-full pl-10 pr-11 py-2.5 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:bg-white text-sm text-[#0F172A] placeholder:text-[#94A3B8] transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        className="absolute right-3.5 top-1/2 transform -translate-y-1/2 text-[#64748B] hover:text-[#0F172A]"
                      >
                        {showConfirmPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Note */}
              <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 text-xs text-amber-900 leading-relaxed">
                <strong className="font-semibold text-amber-950">Application Note:</strong> Your partner registration will be reviewed and verified by the SafeFire administration team. You will be able to access the delivery dashboard once verified.
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 px-4 rounded-xl bg-[#E31E24] hover:bg-[#C8191F] text-white font-bold text-sm shadow-md transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? 'Submitting Registration...' : 'Submit Delivery Application'}
              </button>

              <div className="text-center pt-2 border-t border-[#E5E7EB]">
                <p className="text-xs text-[#64748B]">
                  Already registered?{' '}
                  <Link to="/delivery/login" className="font-bold text-[#E31E24] hover:underline">
                    Sign in to Partner Account
                  </Link>
                </p>
              </div>
            </form>
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

export default DeliveryRegister;
