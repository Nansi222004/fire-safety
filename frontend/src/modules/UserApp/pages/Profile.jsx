import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { 
  FiUser, 
  FiMail, 
  FiPhone, 
  FiLock, 
  FiEye, 
  FiEyeOff, 
  FiSave, 
  FiCamera, 
  FiPackage, 
  FiMapPin, 
  FiLogOut, 
  FiChevronRight, 
  FiBell, 
  FiMessageCircle, 
  FiCreditCard,
  FiHeart,
  FiShield,
  FiTag,
  FiHelpCircle,
  FiFileText,
  FiCheckCircle,
  FiX
} from 'react-icons/fi';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import MobileLayout from "../components/Layout/MobileLayout";
import { useAuthStore } from '../../../shared/store/authStore';
import { useWishlistStore } from '../../../shared/store/wishlistStore';
import { isValidEmail, isValidPhone } from '../../../shared/utils/helpers';
import toast from 'react-hot-toast';
import PageTransition from '../../../shared/components/PageTransition';
import PasswordStrengthMeter from '../components/Mobile/PasswordStrengthMeter';
import { useUserNotificationStore } from '../store/userNotificationStore';

const MobileProfile = () => {
  const navigate = useNavigate();
  const { user, updateProfile, uploadProfileAvatar, changePassword, logout, isLoading } = useAuthStore();
  const { items: wishlistItems } = useWishlistStore();
  const avatarInputRef = useRef(null);
  
  const [activeModal, setActiveModal] = useState(null); // 'personal', 'password', null
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const unreadNotificationCount = useUserNotificationStore((state) => state.unreadCount);
  const ensureNotificationHydrated = useUserNotificationStore((state) => state.ensureHydrated);

  const { 
    register: registerPersonal, 
    handleSubmit: handleSubmitPersonal, 
    reset: resetPersonal, 
    formState: { errors: personalErrors } 
  } = useForm({
    defaultValues: { 
      name: user?.name || '', 
      email: user?.email || '', 
      phone: user?.phone || '' 
    },
  });

  const { 
    register: registerPassword, 
    handleSubmit: handleSubmitPassword, 
    watch, 
    formState: { errors: passwordErrors }, 
    reset: resetPassword 
  } = useForm();
  const newPassword = watch('newPassword');

  useEffect(() => { 
    ensureNotificationHydrated(); 
  }, [ensureNotificationHydrated]);

  useEffect(() => {
    resetPersonal({ 
      name: user?.name || '', 
      email: user?.email || '', 
      phone: user?.phone || '' 
    });
  }, [user, resetPersonal]);

  const onPersonalSubmit = async (data) => {
    try {
      await updateProfile({ name: data?.name, phone: data?.phone });
      toast.success('Profile updated successfully!');
      setActiveModal(null);
    } catch (error) { 
      toast.error(error.message || 'Failed to update profile'); 
    }
  };

  const onPasswordSubmit = async (data) => {
    try {
      await changePassword(data.currentPassword, data.newPassword);
      toast.success('Password changed successfully!');
      resetPassword();
      setActiveModal(null);
    } catch (error) { 
      toast.error(error.message || 'Failed to change password'); 
    }
  };

  const handleLogout = () => { 
    logout(); 
    navigate('/home'); 
    toast.success('Logged out successfully'); 
  };

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) { 
      toast.error('Only JPEG, PNG, WEBP and GIF images are allowed.'); 
      event.target.value = ''; 
      return; 
    }
    if (file.size > 5 * 1024 * 1024) { 
      toast.error('Image size must be 5MB or less.'); 
      event.target.value = ''; 
      return; 
    }
    try { 
      await uploadProfileAvatar(file); 
      toast.success('Profile picture updated!'); 
    } catch (error) { 
      toast.error(error?.message || 'Failed to upload image'); 
    } finally { 
      event.target.value = ''; 
    }
  };

  const quickStats = [
    {
      title: 'My Orders',
      subtitle: 'View & Track',
      icon: FiPackage,
      color: 'text-primary-600',
      bg: 'bg-primary-50',
      border: 'border-primary-100',
      link: '/orders',
    },
    {
      title: 'Wishlist',
      subtitle: `${wishlistItems?.length || 0} Items`,
      icon: FiHeart,
      color: 'text-rose-600',
      bg: 'bg-rose-50',
      border: 'border-rose-100',
      link: '/wishlist',
    },
    {
      title: 'Addresses',
      subtitle: 'Delivery Locations',
      icon: FiMapPin,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-100',
      link: '/addresses',
    },
    {
      title: 'Wallet',
      subtitle: 'Balance & Refunds',
      icon: FiCreditCard,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      border: 'border-amber-100',
      link: '/user/wallet',
    },
  ];

  const accountSections = [
    {
      title: 'Orders & Services',
      items: [
        {
          label: 'Order History & Invoices',
          description: 'Track ongoing orders and download tax invoices',
          icon: FiPackage,
          iconColor: 'text-primary-600',
          iconBg: 'bg-primary-50',
          link: '/orders',
        },
        {
          label: 'Refill & AMC Services',
          description: 'Book fire extinguisher refilling and maintenance inspection',
          icon: FiShield,
          iconColor: 'text-blue-600',
          iconBg: 'bg-blue-50',
          link: '/services',
        },
        {
          label: 'Coupons & Exclusive Offers',
          description: 'Discounts on certified fire safety equipment',
          icon: FiTag,
          iconColor: 'text-amber-600',
          iconBg: 'bg-amber-50',
          link: '/offers',
        },
      ],
    },
    {
      title: 'Account Settings',
      items: [
        {
          label: 'Personal Information',
          description: 'Update your name and primary phone number',
          icon: FiUser,
          iconColor: 'text-emerald-600',
          iconBg: 'bg-emerald-50',
          action: () => setActiveModal('personal'),
        },
        {
          label: 'Security & Password',
          description: 'Update your account login password',
          icon: FiLock,
          iconColor: 'text-purple-600',
          iconBg: 'bg-purple-50',
          action: () => setActiveModal('password'),
        },
        {
          label: 'Saved Delivery Addresses',
          description: 'Manage warehouse, factory, and home delivery addresses',
          icon: FiMapPin,
          iconColor: 'text-teal-600',
          iconBg: 'bg-teal-50',
          link: '/addresses',
        },
        {
          label: 'Notifications',
          description: 'Order status updates and safety compliance alerts',
          icon: FiBell,
          iconColor: 'text-indigo-600',
          iconBg: 'bg-indigo-50',
          badge: unreadNotificationCount > 0 ? unreadNotificationCount : null,
          link: '/notifications',
        },
      ],
    },
    {
      title: 'Help & Compliance',
      items: [
        {
          label: 'Support & Help Desk',
          description: '24/7 Fire safety support and service tickets',
          icon: FiHelpCircle,
          iconColor: 'text-cyan-600',
          iconBg: 'bg-cyan-50',
          link: '/support',
        },
        {
          label: 'Safety Policies & Terms',
          description: 'Equipment warranty, terms of service, and privacy policy',
          icon: FiFileText,
          iconColor: 'text-gray-600',
          iconBg: 'bg-gray-100',
          link: '/policy/privacy-policy',
        },
      ],
    },
  ];

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={false}>
        <div className="min-h-screen bg-gray-50/50 pb-20">
          <input 
            ref={avatarInputRef} 
            type="file" 
            className="hidden" 
            accept="image/jpeg,image/png,image/webp,image/gif" 
            onChange={handleAvatarChange} 
          />

          {/* Top Header */}
          <header className="bg-white border-b border-gray-100 sticky top-0 z-30 px-4 py-3.5 flex items-center justify-between shadow-sm">
            <h1 className="text-lg font-bold text-gray-900">My Account</h1>
            <div className="flex items-center gap-2">
              <Link 
                to="/notifications" 
                className="relative p-2 text-gray-600 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-colors"
              >
                <FiBell className="text-xl" />
                {unreadNotificationCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary-600 text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                    {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                  </span>
                )}
              </Link>
            </div>
          </header>

          <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">
            {/* User Profile Card */}
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4 relative overflow-hidden"
            >
              {/* Decorative Accent Background */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-primary-500/10 via-amber-500/5 to-transparent rounded-bl-full pointer-events-none" />

              {/* Avatar with Camera Overlay */}
              <div className="relative flex-shrink-0">
                <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-primary-600 to-primary-800 text-white font-bold text-2xl flex items-center justify-center overflow-hidden border-2 border-white shadow-md">
                  {user?.avatar ? (
                    <img src={user.avatar} alt={user?.name} className="w-full h-full object-cover" />
                  ) : (
                    <span>{user?.name?.charAt(0)?.toUpperCase() || 'U'}</span>
                  )}
                </div>
                <button 
                  type="button" 
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={isLoading}
                  title="Upload profile photo"
                  className="absolute bottom-0 right-0 w-7 h-7 bg-primary-600 hover:bg-primary-700 active:scale-95 text-white rounded-full flex items-center justify-center border-2 border-white shadow transition-transform"
                >
                  <FiCamera className="text-xs" />
                </button>
              </div>

              {/* User Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <h2 className="text-base sm:text-lg font-bold text-gray-900 truncate">
                    {user?.name || 'SafeFire Customer'}
                  </h2>
                  <span title="Verified SafeFire Customer">
                    <FiCheckCircle className="text-primary-600 text-sm flex-shrink-0" />
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-gray-500 truncate mb-1.5 flex items-center gap-1.5">
                  <FiMail className="text-gray-400 text-xs flex-shrink-0" />
                  <span className="truncate">{user?.email || 'customer@safefire.com'}</span>
                </p>
                {user?.phone ? (
                  <p className="text-xs text-gray-500 flex items-center gap-1.5">
                    <FiPhone className="text-gray-400 text-xs flex-shrink-0" />
                    <span>{user.phone}</span>
                  </p>
                ) : (
                  <button 
                    onClick={() => setActiveModal('personal')} 
                    className="text-xs text-primary-600 hover:text-primary-700 font-semibold hover:underline"
                  >
                    + Add Phone Number
                  </button>
                )}
              </div>

              {/* Edit Button */}
              <button 
                onClick={() => setActiveModal('personal')}
                className="hidden sm:flex items-center gap-1 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold transition-colors"
              >
                Edit
              </button>
            </motion.div>

            {/* E-Commerce Quick Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {quickStats.map((stat, idx) => (
                <Link 
                  key={idx} 
                  to={stat.link}
                  className={`bg-white p-3.5 rounded-2xl border ${stat.border} shadow-sm hover:shadow-md transition-all flex flex-col justify-between group active:scale-98`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className={`w-9 h-9 rounded-xl ${stat.bg} ${stat.color} flex items-center justify-center font-bold text-lg group-hover:scale-110 transition-transform`}>
                      <stat.icon />
                    </div>
                    <FiChevronRight className="text-gray-300 group-hover:text-gray-500 transition-colors text-sm" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-gray-900 leading-tight">
                      {stat.title}
                    </h3>
                    <p className="text-[11px] text-gray-500 font-medium mt-0.5">
                      {stat.subtitle}
                    </p>
                  </div>
                </Link>
              ))}
            </div>

            {/* Account Action Sections */}
            <div className="space-y-4">
              {accountSections.map((sec, secIdx) => (
                <motion.div 
                  key={secIdx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: secIdx * 0.05 }}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
                >
                  <div className="px-4.5 py-3 border-b border-gray-50 bg-gray-50/40">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                      {sec.title}
                    </h3>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {sec.items.map((item, itemIdx) => {
                      const Content = (
                        <div className="flex items-center gap-3.5 px-4.5 py-3.5 hover:bg-gray-50/80 transition-colors cursor-pointer group">
                          <div className={`w-10 h-10 rounded-xl ${item.iconBg} ${item.iconColor} flex items-center justify-center text-lg flex-shrink-0 group-hover:scale-105 transition-transform`}>
                            <item.icon />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-gray-900 group-hover:text-primary-600 transition-colors">
                                {item.label}
                              </span>
                              {item.badge && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-primary-600 text-white rounded-full">
                                  {item.badge}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 truncate mt-0.5">
                              {item.description}
                            </p>
                          </div>
                          <FiChevronRight className="text-gray-400 group-hover:text-gray-700 group-hover:translate-x-0.5 transition-all text-base flex-shrink-0" />
                        </div>
                      );

                      if (item.link) {
                        return (
                          <Link key={itemIdx} to={item.link} className="block">
                            {Content}
                          </Link>
                        );
                      }

                      return (
                        <div key={itemIdx} onClick={item.action}>
                          {Content}
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Logout Card */}
            <div className="pt-2">
              <button 
                type="button" 
                onClick={handleLogout}
                className="w-full py-3.5 px-4 rounded-2xl bg-white hover:bg-rose-50 border border-gray-200 hover:border-rose-200 text-rose-600 font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all active:scale-98"
              >
                <FiLogOut className="text-base" />
                <span>Sign Out of SafeFire</span>
              </button>
              <p className="text-center text-[11px] text-gray-400 mt-3 font-medium">
                SafeFire E-Commerce Platform • Version 1.0.0
              </p>
            </div>
          </div>

          {/* Edit Personal Information Modal */}
          <AnimatePresence>
            {activeModal === 'personal' && (
              <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-gray-100 relative max-h-[90vh] overflow-y-auto"
                >
                  <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-5">
                    <h3 className="text-lg font-bold text-gray-900">Personal Information</h3>
                    <button 
                      onClick={() => setActiveModal(null)} 
                      className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
                    >
                      <FiX size={20} />
                    </button>
                  </div>

                  <form onSubmit={handleSubmitPersonal(onPersonalSubmit)} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
                        Full Name
                      </label>
                      <div className="relative">
                        <FiUser className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input 
                          type="text" 
                          {...registerPersonal('name', { 
                            required: 'Name is required', 
                            minLength: { value: 2, message: 'At least 2 characters' } 
                          })} 
                          className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm ${personalErrors.name ? 'border-red-300 focus:ring-red-500' : 'border-gray-200 focus:border-primary-600 focus:ring-2 focus:ring-primary-100'} focus:outline-none`} 
                          placeholder="Your full name" 
                        />
                      </div>
                      {personalErrors.name && (
                        <p className="mt-1 text-xs text-red-600">{personalErrors.name.message}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
                        Email Address
                      </label>
                      <div className="relative">
                        <FiMail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input 
                          type="email" 
                          {...registerPersonal('email')} 
                          readOnly 
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-500 text-sm cursor-not-allowed focus:outline-none" 
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-gray-400">Email address is linked to your account.</p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
                        Phone Number
                      </label>
                      <div className="relative">
                        <FiPhone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input 
                          type="tel" 
                          {...registerPersonal('phone', { 
                            validate: (v) => !v || isValidPhone(v) || 'Enter a valid phone number' 
                          })} 
                          className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm ${personalErrors.phone ? 'border-red-300 focus:ring-red-500' : 'border-gray-200 focus:border-primary-600 focus:ring-2 focus:ring-primary-100'} focus:outline-none`} 
                          placeholder="e.g. +91 98765 43210" 
                        />
                      </div>
                      {personalErrors.phone && (
                        <p className="mt-1 text-xs text-red-600">{personalErrors.phone.message}</p>
                      )}
                    </div>

                    <div className="pt-2 flex gap-3">
                      <button 
                        type="button" 
                        onClick={() => setActiveModal(null)} 
                        className="flex-1 py-2.5 border border-gray-200 text-gray-700 font-semibold rounded-xl text-sm hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button 
                        type="submit" 
                        disabled={isLoading} 
                        className="flex-1 py-2.5 gradient-green text-white font-bold rounded-xl text-sm hover:shadow-glow-green active:scale-98 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        <FiSave /> {isLoading ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}

            {/* Change Password Modal */}
            {activeModal === 'password' && (
              <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-gray-100 relative max-h-[90vh] overflow-y-auto"
                >
                  <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-5">
                    <h3 className="text-lg font-bold text-gray-900">Change Password</h3>
                    <button 
                      onClick={() => setActiveModal(null)} 
                      className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
                    >
                      <FiX size={20} />
                    </button>
                  </div>

                  <form onSubmit={handleSubmitPassword(onPasswordSubmit)} className="space-y-4">
                    {[
                      { 
                        label: 'Current Password', 
                        name: 'currentPassword', 
                        show: showCurrentPassword, 
                        setShow: setShowCurrentPassword, 
                        rules: { required: 'Current password is required' } 
                      },
                      { 
                        label: 'New Password', 
                        name: 'newPassword', 
                        show: showNewPassword, 
                        setShow: setShowNewPassword, 
                        rules: { required: 'New password is required', minLength: { value: 6, message: 'At least 6 characters' } } 
                      },
                      { 
                        label: 'Confirm New Password', 
                        name: 'confirmPassword', 
                        show: showConfirmPassword, 
                        setShow: setShowConfirmPassword, 
                        rules: { 
                          required: 'Please confirm your password', 
                          validate: (v) => v === newPassword || 'Passwords do not match' 
                        } 
                      },
                    ].map(({ label, name, show, setShow, rules }) => (
                      <div key={name}>
                        <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
                          {label}
                        </label>
                        <div className="relative">
                          <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input 
                            type={show ? 'text' : 'password'} 
                            {...registerPassword(name, rules)} 
                            className={`w-full pl-10 pr-10 py-2.5 rounded-xl border text-sm ${passwordErrors[name] ? 'border-red-300 focus:ring-red-500' : 'border-gray-200 focus:border-primary-600 focus:ring-2 focus:ring-primary-100'} focus:outline-none`} 
                            placeholder={label} 
                          />
                          <button 
                            type="button" 
                            onClick={() => setShow(!show)} 
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                          >
                            {show ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                          </button>
                        </div>
                        {passwordErrors[name] && (
                          <p className="mt-1 text-xs text-red-600">{passwordErrors[name].message}</p>
                        )}
                        {name === 'newPassword' && <PasswordStrengthMeter password={newPassword} />}
                      </div>
                    ))}

                    <div className="pt-2 flex gap-3">
                      <button 
                        type="button" 
                        onClick={() => setActiveModal(null)} 
                        className="flex-1 py-2.5 border border-gray-200 text-gray-700 font-semibold rounded-xl text-sm hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button 
                        type="submit" 
                        disabled={isLoading} 
                        className="flex-1 py-2.5 gradient-green text-white font-bold rounded-xl text-sm hover:shadow-glow-green active:scale-98 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        <FiSave /> {isLoading ? 'Updating...' : 'Update Password'}
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default MobileProfile;
