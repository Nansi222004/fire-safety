import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSave, FiUser, FiLock, FiShield, FiFile, FiGrid, FiAlertTriangle, FiCheckCircle } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { useVendorAuthStore } from "../../store/vendorAuthStore";
import toast from 'react-hot-toast';
import api from '../../../../shared/utils/api';

const ProfileSettings = () => {
  const navigate = useNavigate();
  const { vendor, updateProfile, logout } = useVendorAuthStore();
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [activeSection, setActiveSection] = useState('profile');

  // Capability Toggle Confirmation Modal State
  const [pendingDisableCap, setPendingDisableCap] = useState(null); // 'sellsProducts' | 'providesServices'
  const [isSubmittingCap, setIsSubmittingCap] = useState(false);

  useEffect(() => {
    if (vendor) {
      setFormData((prev) => ({
        ...prev,
        name: vendor.name || '',
        phone: vendor.phone || '',
      }));
    }
  }, [vendor]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    if (!vendor) return;

    try {
      await updateProfile({
        name: formData.name,
        phone: formData.phone,
      });
      toast.success('Profile updated successfully');
    } catch {
      // api.js shows toast
    }
  };

  const caps = vendor?.vendorCapabilities || { sellsProducts: true, providesServices: false };

  const handleCapabilityToggleClick = (capKey) => {
    const currentVal = caps[capKey];
    if (currentVal === true) {
      // Trying to disable -> show confirmation modal
      setPendingDisableCap(capKey);
    } else {
      // Enabling capability -> enable immediately
      executeCapabilityChange(capKey, true);
    }
  };

  const executeCapabilityChange = async (capKey, newValue) => {
    setIsSubmittingCap(true);
    try {
      const updatedCaps = {
        ...caps,
        [capKey]: newValue,
      };

      if (!updatedCaps.sellsProducts && !updatedCaps.providesServices) {
        toast.error('At least one capability (Products or Services) must remain enabled.');
        return;
      }

      const res = await api.put('/vendor/auth/profile', {
        vendorCapabilities: updatedCaps,
      });

      const updatedVendor = res.data?.data || res.data;
      if (typeof updateProfile === 'function') {
        updateProfile(updatedVendor);
      }
      toast.success(`Capability updated successfully.`);
      setPendingDisableCap(null);
    } catch (err) {
      toast.error(err.message || 'Failed to update capability.');
    } finally {
      setIsSubmittingCap(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!vendor) return;

    if (!formData.currentPassword) {
      toast.error('Please enter your current password');
      return;
    }

    if (formData.newPassword.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    try {
      toast.success('Password changed successfully');
      setFormData({
        ...formData,
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch {
      toast.error('Failed to change password');
    }
  };

  const sections = [
    { id: 'profile', label: 'Profile Info', icon: FiUser },
    { id: 'capabilities', label: 'Business Capabilities', icon: FiGrid },
    { id: 'password', label: 'Change Password', icon: FiLock },
    { id: 'security', label: 'Security', icon: FiShield },
    { id: 'documents', label: 'Documents', icon: FiFile },
  ];

  if (!vendor) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Loading vendor information...</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-full overflow-x-hidden"
    >
      <div className="lg:hidden">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Profile Settings</h1>
        <p className="text-sm sm:text-base text-gray-600">Manage your profile and account security</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 max-w-full overflow-x-hidden">
        <div className="border-b border-gray-200 overflow-x-hidden">
          <div className="flex overflow-x-auto scrollbar-hide -mx-1 px-1">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => {
                    if (section.id === 'documents') {
                      navigate('/vendor/documents');
                    } else {
                      setActiveSection(section.id);
                    }
                  }}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 md:px-6 py-3 sm:py-4 border-b-2 transition-colors whitespace-nowrap text-xs sm:text-sm ${
                    activeSection === section.id
                      ? 'border-[#E31E24] text-[#E31E24] font-bold'
                      : 'border-transparent text-gray-600 hover:text-gray-800'
                  }`}
                >
                  <Icon className="text-base sm:text-lg" />
                  <span>{section.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4 sm:p-6 md:p-8">
          {/* Profile Info Section */}
          {activeSection === 'profile' && (
            <div className="space-y-6">
              {/* Commission Rate Summary Card */}
              <div className="bg-red-50/60 border border-red-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-[#E31E24] text-white rounded-xl flex items-center justify-center shadow-md font-bold text-xl">
                    %
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">Active Store Commission Rate</h3>
                    <p className="text-xs sm:text-sm text-slate-600">Configured by Admin for your vendor account</p>
                  </div>
                </div>
                <div className="bg-white border border-red-200 px-4 py-2 rounded-xl shadow-inner text-center self-stretch sm:self-auto">
                  <span className="text-2xl font-black text-[#E31E24]">
                    {((vendor?.commissionRate !== undefined && vendor?.commissionRate !== null ? (vendor.commissionRate <= 1 ? vendor.commissionRate * 100 : vendor.commissionRate) : 10)).toFixed(1)}%
                  </span>
                </div>
              </div>

              <form onSubmit={handleProfileSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:border-[#E31E24] text-sm text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={vendor.email}
                      disabled
                      className="w-full px-4 py-2.5 border border-gray-200 bg-gray-50 rounded-xl text-sm text-slate-500 cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                      Phone Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      required
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:border-[#E31E24] text-sm text-slate-900"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-gray-200">
                  <button
                    type="submit"
                    className="flex items-center gap-2 px-6 py-2.5 bg-[#E31E24] text-white rounded-xl hover:bg-[#c6151b] transition-all font-bold text-sm shadow-md"
                  >
                    <FiSave />
                    Save Profile
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Business Capabilities Section */}
          {activeSection === 'capabilities' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight">Marketplace Capabilities</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Manage the marketplace modules your store participates in. At least one capability must remain enabled.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Product Seller Capability Toggle Card */}
                <div className={`p-6 rounded-2xl border transition-all ${
                  caps.sellsProducts
                    ? 'bg-white border-slate-200 shadow-sm'
                    : 'bg-slate-50 border-slate-200 opacity-75'
                }`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-red-50 text-[#E31E24] flex items-center justify-center text-xl font-bold">
                        🛒
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">Fire Safety Products</h4>
                        <p className="text-xs text-slate-500">Sell equipment & products</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCapabilityToggleClick('sellsProducts')}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        caps.sellsProducts ? 'bg-[#E31E24]' : 'bg-gray-300'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        caps.sellsProducts ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed mb-3">
                    Enables managing catalog products, inventory stock, and accepting new product purchases.
                  </p>

                  <div className="text-[11px] font-bold flex items-center gap-1.5 text-slate-500">
                    <FiCheckCircle className={caps.sellsProducts ? "text-emerald-600" : "text-gray-400"} />
                    <span>Status: {caps.sellsProducts ? 'ACTIVE' : 'DISABLED'}</span>
                  </div>
                </div>

                {/* Service Provider Capability Toggle Card */}
                <div className={`p-6 rounded-2xl border transition-all ${
                  caps.providesServices
                    ? 'bg-white border-slate-200 shadow-sm'
                    : 'bg-slate-50 border-slate-200 opacity-75'
                }`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-orange-50 text-[#FF6A00] flex items-center justify-center text-xl font-bold">
                        🛠️
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">Fire Safety Services</h4>
                        <p className="text-xs text-slate-500">Provide maintenance & refill services</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCapabilityToggleClick('providesServices')}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        caps.providesServices ? 'bg-[#E31E24]' : 'bg-gray-300'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        caps.providesServices ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed mb-3">
                    Enables configuring VendorServices, setting pincode coverage, daily capacity, and accepting service bookings.
                  </p>

                  <div className="text-[11px] font-bold flex items-center gap-1.5 text-slate-500">
                    <FiCheckCircle className={caps.providesServices ? "text-emerald-600" : "text-gray-400"} />
                    <span>Status: {caps.providesServices ? 'ACTIVE' : 'DISABLED'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Change Password Section */}
          {activeSection === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-6">
              <div className="space-y-4 max-w-md">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                    Current Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    name="currentPassword"
                    value={formData.currentPassword}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:border-[#E31E24] text-sm text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                    New Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    name="newPassword"
                    value={formData.newPassword}
                    onChange={handleChange}
                    required
                    minLength={6}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:border-[#E31E24] text-sm text-slate-900"
                  />
                  <p className="text-xs text-slate-500 mt-1">Must be at least 6 characters</p>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                    Confirm New Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    required
                    minLength={6}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:border-[#E31E24] text-sm text-slate-900"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-gray-200">
                <button
                  type="submit"
                  className="flex items-center gap-2 px-6 py-2.5 bg-[#E31E24] text-white rounded-xl hover:bg-[#c6151b] transition-all font-bold text-sm shadow-md"
                >
                  <FiSave />
                  Change Password
                </button>
              </div>
            </form>
          )}

          {/* Security Section */}
          {activeSection === 'security' && (
            <div className="space-y-6">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <h3 className="text-sm font-bold text-slate-900 mb-2">Account Status & Verification</h3>
                <div className="space-y-2 text-xs text-slate-700">
                  <div className="flex items-center justify-between">
                    <span>Account Status:</span>
                    <span className="font-bold uppercase text-[#E31E24]">{vendor.status || 'pending'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Verified:</span>
                    <span className="font-bold">{vendor.isVerified ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Joined Platform:</span>
                    <span className="font-bold">{new Date(vendor.joinDate).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <button
                  onClick={logout}
                  className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-all font-bold text-sm shadow-md"
                >
                  Logout from Account
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal for Disabling Capabilities */}
      <AnimatePresence>
        {pendingDisableCap && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPendingDisableCap(null)}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-white rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl border border-slate-200 z-10 space-y-5"
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-2xl border border-amber-200">
                <FiAlertTriangle />
              </div>

              <div>
                <h3 className="text-lg font-black text-slate-900">Are you sure?</h3>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  {pendingDisableCap === 'sellsProducts'
                    ? 'Your existing products and orders will remain stored safely, but your products will no longer be available for new customer purchases.'
                    : 'Your existing service bookings and service configurations will remain accessible, but you will no longer receive new customer service bookings.'}
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPendingDisableCap(null)}
                  disabled={isSubmittingCap}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() => executeCapabilityChange(pendingDisableCap, false)}
                  disabled={isSubmittingCap}
                  className="px-5 py-2.5 bg-[#E31E24] hover:bg-[#c6151b] text-white rounded-xl font-bold text-xs transition-colors shadow-md disabled:opacity-50"
                >
                  {isSubmittingCap ? 'Updating...' : 'Disable Capability'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default ProfileSettings;
