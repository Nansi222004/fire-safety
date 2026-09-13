import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import { useDeliveryAuthStore } from '../store/deliveryStore';
import { FiUser, FiMail, FiPhone, FiTruck, FiEdit2, FiSave, FiX, FiLogOut, FiChevronDown, FiTrash2, FiShield, FiChevronRight } from 'react-icons/fi';
import PageTransition from '../../../shared/components/PageTransition';
import { formatPrice } from '../../../shared/utils/helpers';

const DeliveryProfile = () => {
  const navigate = useNavigate();
  const { deliveryBoy, updateProfile, fetchProfile, fetchProfileSummary, isLoading, logout, deleteAccount } = useDeliveryAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [profileMetrics, setProfileMetrics] = useState({
    totalDeliveries: 0,
    completedToday: 0,
    earnings: 0,
  });
  const [formData, setFormData] = useState({
    name: deliveryBoy?.name || '',
    email: deliveryBoy?.email || '',
    phone: deliveryBoy?.phone || '',
    vehicleType: deliveryBoy?.vehicleType || '',
    vehicleNumber: deliveryBoy?.vehicleNumber || '',
  });
  const [vehicleDropdownOpen, setVehicleDropdownOpen] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      setLoadFailed(false);
      const profile = await fetchProfile();
      try {
        const summary = await fetchProfileSummary();
        setProfileMetrics({
          totalDeliveries: Number(summary?.totalDeliveries || 0),
          completedToday: Number(summary?.completedToday || 0),
          earnings: Number(summary?.earnings || 0),
        });
      } catch {
        setProfileMetrics({
          totalDeliveries: Number(profile?.totalDeliveries || 0),
          completedToday: 0,
          earnings: 0,
        });
      }
    } catch {
      setLoadFailed(true);
    }
  }, [fetchProfile, fetchProfileSummary]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    setFormData({
      name: deliveryBoy?.name || '',
      email: deliveryBoy?.email || '',
      phone: deliveryBoy?.phone || '',
      vehicleType: deliveryBoy?.vehicleType || '',
      vehicleNumber: deliveryBoy?.vehicleNumber || '',
    });
  }, [deliveryBoy]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSave = async () => {
    if (!formData.name?.trim()) return;
    if (!formData.email?.trim()) return;
    if (!formData.phone?.trim()) return;
    if (!formData.vehicleType?.trim()) return;
    if (!formData.vehicleNumber?.trim()) return;
    try {
      await updateProfile({
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        vehicleType: formData.vehicleType.trim(),
        vehicleNumber: formData.vehicleNumber.trim(),
      });
      setIsEditing(false);
    } catch {
      // Error handled
    }
  };

  const handleCancel = () => {
    setFormData({
      name: deliveryBoy?.name || '',
      email: deliveryBoy?.email || '',
      phone: deliveryBoy?.phone || '',
      vehicleType: deliveryBoy?.vehicleType || '',
      vehicleNumber: deliveryBoy?.vehicleNumber || '',
    });
    setIsEditing(false);
  };

  const handleLogout = () => {
    logout();
    navigate('/delivery/login');
  };

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);
    try {
      await deleteAccount();
      setShowDeleteModal(false);
      setDeleteConfirmText('');
      navigate('/delivery/login');
    } catch (err) {
      console.error(err);
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const stats = [
    { 
      label: 'Total Deliveries', 
      value: Number(profileMetrics.totalDeliveries || 0),
      bg: 'bg-gradient-to-br from-blue-50 to-indigo-50/30 border-blue-100',
      color: 'text-blue-600'
    },
    { 
      label: 'Completed Today', 
      value: Number(profileMetrics.completedToday || 0),
      bg: 'bg-gradient-to-br from-green-50 to-emerald-50/30 border-green-100',
      color: 'text-green-600'
    },
    { 
      label: 'Rating', 
      value: `${Number(deliveryBoy?.rating || 0).toFixed(1)} ★`,
      bg: 'bg-gradient-to-br from-yellow-50 to-amber-50/30 border-yellow-100',
      color: 'text-yellow-600'
    },
    { 
      label: 'Earnings', 
      value: formatPrice(Number(profileMetrics.earnings || 0)),
      bg: 'bg-gradient-to-br from-purple-50 to-violet-50/30 border-purple-100',
      color: 'text-purple-600'
    },
  ];

  const initials = (() => {
    const name = deliveryBoy?.name || 'Delivery Boy';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  })();

  return (
    <PageTransition>
      <div className="px-4 py-6 space-y-6 max-w-3xl mx-auto pb-24">
        {/* Profile Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-primary-600 to-primary-800 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden"
        >
          {/* Decorative shapes */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16" />
          <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-white/5 rounded-full" />

          <div className="flex items-center justify-between mb-4 relative z-10">
            <h1 className="text-lg font-extrabold tracking-tight">My Profile</h1>
            {loadFailed && (
              <button
                onClick={loadProfile}
                className="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-lg font-bold uppercase tracking-wider"
              >
                Retry
              </button>
            )}
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="p-2 bg-white bg-opacity-20 rounded-xl hover:bg-opacity-30 transition-all"
              >
                <FiEdit2 className="text-sm" />
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={isLoading}
                  className="p-2 bg-white bg-opacity-20 rounded-xl hover:bg-opacity-30 transition-all"
                >
                  <FiSave className="text-sm" />
                </button>
                <button
                  onClick={handleCancel}
                  className="p-2 bg-white bg-opacity-20 rounded-xl hover:bg-opacity-30 transition-all"
                >
                  <FiX className="text-sm" />
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center font-black text-white text-xl shadow-sm flex-shrink-0">
              {initials}
            </div>
            <div>
              <p className="text-base font-extrabold">{deliveryBoy?.name || 'Delivery Boy'}</p>
              <p className="text-primary-100 text-xs mt-0.5">{deliveryBoy?.email || 'email@example.com'}</p>
            </div>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className={`${stat.bg} rounded-3xl p-5 border shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden`}
            >
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">{stat.label}</p>
              <p className={`text-xl font-black font-mono leading-none ${stat.color}`}>{stat.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Profile Information */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4"
        >
          <h2 className="text-base font-black text-slate-800 uppercase tracking-wide mb-2">Personal Information</h2>

          {/* Name */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <FiUser />
              Full Name
            </label>
            {isEditing ? (
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-2xl border-2 border-slate-100 focus:border-primary-500 focus:outline-none text-sm transition-all"
              />
            ) : (
              <p className="px-4 py-3 bg-slate-50/50 border border-slate-50 rounded-2xl text-slate-800 text-sm font-semibold">{formData.name}</p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <FiMail />
              Email Address
            </label>
            {isEditing ? (
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-2xl border-2 border-slate-100 focus:border-primary-500 focus:outline-none text-sm transition-all"
              />
            ) : (
              <p className="px-4 py-3 bg-slate-50/50 border border-slate-50 rounded-2xl text-slate-800 text-sm font-semibold">{formData.email}</p>
            )}
          </div>

          {/* Phone */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <FiPhone />
              Phone Number
            </label>
            {isEditing ? (
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-2xl border-2 border-slate-100 focus:border-primary-500 focus:outline-none text-sm transition-all"
              />
            ) : (
              <p className="px-4 py-3 bg-slate-50/50 border border-slate-50 rounded-2xl text-slate-800 text-sm font-semibold font-mono">{formData.phone}</p>
            )}
          </div>
        </motion.div>

        {/* Vehicle Information */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4"
        >
          <h2 className="text-base font-black text-slate-800 uppercase tracking-wide mb-2 flex items-center gap-2">
            <FiTruck />
            Vehicle Information
          </h2>

          {/* Vehicle Type */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">Vehicle Type</label>
            {isEditing ? (
              <div className="relative w-full">
                <button
                  type="button"
                  onClick={() => setVehicleDropdownOpen(!vehicleDropdownOpen)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 border-slate-100 focus:border-primary-500 focus:outline-none text-sm bg-white transition-all text-left"
                >
                  <span className="font-semibold text-slate-800">{formData.vehicleType || 'Select Vehicle Type'}</span>
                  <FiChevronDown className={`text-slate-400 text-base flex-shrink-0 transition-transform ${vehicleDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {vehicleDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 overflow-hidden"
                    >
                      {['Bike', 'Scooter', 'Car', 'Van'].map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, vehicleType: type });
                            setVehicleDropdownOpen(false);
                          }}
                          className={`w-full text-left px-4 py-3 text-sm font-semibold hover:bg-primary-50 transition-colors ${formData.vehicleType === type ? 'bg-primary-50 text-primary-700 font-extrabold' : 'text-slate-700'}`}
                        >
                          {type}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <p className="px-4 py-3 bg-slate-50/50 border border-slate-50 rounded-2xl text-slate-800 text-sm font-semibold">{formData.vehicleType}</p>
            )}
          </div>

          {/* Vehicle Number */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">Vehicle Number</label>
            {isEditing ? (
              <input
                type="text"
                name="vehicleNumber"
                value={formData.vehicleNumber}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-2xl border-2 border-slate-100 focus:border-primary-500 focus:outline-none text-sm transition-all"
              />
            ) : (
              <p className="px-4 py-3 bg-slate-50/50 border border-slate-50 rounded-2xl text-slate-800 text-sm font-semibold font-mono">{formData.vehicleNumber}</p>
            )}
          </div>
        </motion.div>

        {/* Policies & Privacy */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm"
        >
          <Link
            to="/delivery/privacy-policy"
            className="flex items-center justify-between group py-1"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center text-lg group-hover:scale-105 transition-transform">
                <FiShield />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 group-hover:text-red-600 transition-colors">
                  Delivery Partner Policies & Privacy
                </h3>
                <p className="text-xs text-slate-400">
                  Data protection guidelines and partner support contacts
                </p>
              </div>
            </div>
            <FiChevronRight className="text-slate-400 text-lg group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </motion.div>

        {/* Logout Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-3"
        >
          <button
            onClick={handleLogout}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-red-50 text-red-600 rounded-2xl font-bold hover:bg-red-100 transition-colors text-sm uppercase tracking-wider"
          >
            <FiLogOut className="text-lg" />
            <span>Logout</span>
          </button>

          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="w-full flex items-center justify-center gap-2 py-2 text-slate-400 hover:text-red-600 transition-colors text-xs font-bold uppercase tracking-wider"
          >
            <FiTrash2 className="text-sm" />
            <span>Delete Delivery Account</span>
          </button>
        </motion.div>

        {/* Delete Confirmation Modal rendered to document.body to ensure true screen centering */}
        {typeof document !== 'undefined' && createPortal(
          <AnimatePresence>
            {showDeleteModal && (
              <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
                <div className="absolute inset-0" onClick={() => !isDeletingAccount && setShowDeleteModal(false)} />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  className="bg-white rounded-3xl p-6 w-full max-w-md relative z-10 shadow-2xl border border-slate-100 space-y-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center font-bold text-lg">
                        <FiTrash2 />
                      </div>
                      <div>
                        <h3 className="text-base font-black text-slate-900">Delete Account</h3>
                        <p className="text-xs text-red-500 font-bold">Permanent Action</p>
                      </div>
                    </div>
                    <button
                      onClick={() => !isDeletingAccount && setShowDeleteModal(false)}
                      className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 transition-colors"
                    >
                      <FiX className="text-lg" />
                    </button>
                  </div>

                  <div className="p-4 rounded-2xl bg-red-50/60 border border-red-100 space-y-2">
                    <p className="text-xs text-slate-800 font-semibold leading-relaxed">
                      Are you sure you want to permanently delete your delivery partner account?
                    </p>
                    <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
                      <li>Your delivery profile, documents, and vehicle records will be wiped.</li>
                      <li>Deletion is blocked if you have ongoing assigned shipments, pending pickups, or unremitted cash-in-hand.</li>
                    </ul>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Type <span className="text-red-600 font-black">DELETE</span> to confirm
                    </label>
                    <input
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder="Type DELETE"
                      className="w-full px-4 py-2.5 border-2 border-slate-100 focus:border-red-500 rounded-xl text-sm font-semibold focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteConfirmText('');
                        setShowDeleteModal(false);
                      }}
                      disabled={isDeletingAccount}
                      className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteAccount}
                      disabled={deleteConfirmText !== 'DELETE' || isDeletingAccount}
                      className="flex-1 py-3 px-4 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-sm"
                    >
                      {isDeletingAccount ? (
                        <span>Deleting...</span>
                      ) : (
                        <>
                          <FiTrash2 />
                          <span>Delete Account</span>
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
      </div>
    </PageTransition>
  );
};

export default DeliveryProfile;
