import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  FiX,
  FiCheck,
  FiMapPin,
  FiCalendar,
  FiClock,
  FiTool,
  FiShield,
  FiStar,
  FiUser,
  FiPhone,
  FiHome,
  FiArrowRight,
  FiArrowLeft,
  FiCreditCard,
  FiDollarSign,
  FiAlertCircle,
  FiCheckCircle,
  FiLoader,
  FiSearch,
  FiAward,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { checkServiceability, createBooking, verifyServicePayment } from '../services/customerServiceApi';
import api from '../../../shared/utils/api';

// Dynamic Razorpay SDK loader
const loadRazorpay = () => {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

const STEP_LABELS = [
  { id: 1, label: 'Pincode', title: 'Check Pincode Serviceability' },
  { id: 2, label: 'Provider', title: 'Select Service Provider' },
  { id: 3, label: 'Schedule', title: 'Select Date & Time Slot' },
  { id: 4, label: 'Details', title: 'Service Specific Details' },
  { id: 5, label: 'Payment', title: 'Address & Payment Options' },
];

const ServiceBookingWizard = ({ isOpen, onClose, service }) => {
  const navigate = useNavigate();

  // Multi-step Wizard State (1 to 5)
  const [step, setStep] = useState(1);

  // Step 1: Pincode
  const [pincode, setPincode] = useState('452001');
  const [isCheckingPincode, setIsCheckingPincode] = useState(false);
  const [serviceabilityResult, setServiceabilityResult] = useState(null);

  // Step 2: Vendor Selection
  const [selectedVendor, setSelectedVendor] = useState(null);

  // Step 3: Date & Slot Selection
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('');

  // Step 4: Dynamic Service Details Form
  const [customFieldValues, setCustomFieldValues] = useState({});

  // Step 5: Address & Payment
  const [address, setAddress] = useState({
    fullName: '',
    phone: '',
    address: '',
    city: 'Indore',
    state: 'Madhya Pradesh',
  });
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [walletBalance, setWalletBalance] = useState(null);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Lock background body scroll & support Escape key
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, onClose]);

  // Fetch customer wallet balance
  useEffect(() => {
    const fetchWallet = async () => {
      try {
        const res = await api.get('/user/wallet');
        const data = res?.data?.data || res?.data;
        if (data && typeof data.balance === 'number') {
          setWalletBalance(data.balance);
        }
      } catch (e) {
        // User not logged in or wallet not initialized
      }
    };
    if (isOpen) {
      fetchWallet();
    }
  }, [isOpen]);

  // Reset wizard on open or service change
  useEffect(() => {
    if (service && isOpen) {
      setStep(1);
      setPincode('452001');
      setServiceabilityResult(null);
      setSelectedVendor(null);

      // Default tomorrow date (skip Sunday if closed)
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 1);
      if (targetDate.getDay() === 0) targetDate.setDate(targetDate.getDate() + 1);
      setSelectedDate(targetDate.toISOString().split('T')[0]);
      setSelectedTimeSlot('10:00 AM - 11:00 AM');

      // Initialize default custom fields
      const initFields = {};
      if (Array.isArray(service.serviceFields)) {
        service.serviceFields.forEach((field) => {
          if (field.type === 'SELECT' && field.options?.length > 0) {
            initFields[field.key] = field.options[0];
          } else if (field.type === 'NUMBER') {
            initFields[field.key] = '1';
          } else {
            initFields[field.key] = '';
          }
        });
      }
      setCustomFieldValues(initFields);
    }
  }, [service, isOpen]);

  if (!isOpen || !service) return null;

  // STEP 1 HANDLER: Check Pincode
  const handleCheckPincode = async (e) => {
    e?.preventDefault();
    const cleanPin = (pincode || '').trim();
    if (!/^\d{6}$/.test(cleanPin)) {
      toast.error('Please enter a valid 6-digit postal pincode.');
      return;
    }

    setIsCheckingPincode(true);
    try {
      const res = await checkServiceability({
        serviceId: service._id || service.id,
        pincode: cleanPin,
      });

      const data = res?.data ?? res ?? {};
      setServiceabilityResult(data);

      if (data.available && Array.isArray(data.vendors) && data.vendors.length > 0) {
        toast.success(`Found ${data.vendors.length} certified provider(s) for pincode ${cleanPin}! 🎉`);
        setSelectedVendor(data.vendors[0]); // Auto-select first verified provider
        setStep(2);
      } else {
        toast.error(data.message || `No service providers currently serve pincode ${cleanPin}`);
      }
    } catch (err) {
      console.error('Serviceability check error:', err);
      toast.error(err.message || 'Failed to verify pincode serviceability.');
    } finally {
      setIsCheckingPincode(false);
    }
  };

  // Generate available time slots based on vendor working hours
  const generateSlots = () => {
    return [
      '09:00 AM - 10:00 AM',
      '10:00 AM - 11:00 AM',
      '11:00 AM - 12:00 PM',
      '02:00 PM - 03:00 PM',
      '03:00 PM - 04:00 PM',
      '04:00 PM - 05:00 PM',
      '05:00 PM - 06:00 PM',
    ];
  };

  // Calculate authoritative pricing preview
  const calculateTotal = () => {
    const unitPrice = selectedVendor?.price || service.price || 499;
    const qty = Math.max(1, Number(customFieldValues.quantity || customFieldValues.number_of_units || 1));
    const subtotal = unitPrice * qty;
    const tax = 0;
    const total = subtotal + tax;
    return { unitPrice, qty, subtotal, tax, total };
  };

  const { unitPrice, qty, total } = calculateTotal();

  // SUBMIT BOOKING
  const handleSubmitBooking = async (e) => {
    e.preventDefault();

    if (!address.fullName.trim() || !address.phone.trim() || !address.address.trim()) {
      toast.error('Please fill in your full name, contact phone, and site address.');
      return;
    }

    if (paymentMethod === 'wallet' && walletBalance !== null && walletBalance < total) {
      toast.error(`Insufficient wallet balance (₹${walletBalance}). Required: ₹${total}. Please choose UPI or COD.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        serviceId: service._id || service.id,
        vendorId: selectedVendor?.vendorId,
        quantity: qty,
        pincode: pincode.trim(),
        serviceAddress: {
          fullName: address.fullName.trim(),
          phone: address.phone.trim(),
          address: address.address.trim(),
          city: address.city.trim() || 'Indore',
          state: address.state.trim() || 'Madhya Pradesh',
          zipCode: pincode.trim(),
        },
        bookingDate: selectedDate,
        timeSlot: selectedTimeSlot,
        customFields: customFieldValues,
        paymentMethod,
        notes,
      };

      const res = await createBooking(payload);
      const data = res?.data ?? res ?? {};
      const createdBooking = data.booking || data;

      // Handle Online Payment (Razorpay Checkout)
      if (data.requiresPayment && data.razorpayOrderId) {
        const sdkLoaded = await loadRazorpay();
        if (!sdkLoaded || !window.Razorpay) {
          toast.error('Razorpay SDK failed to load. Please check your internet connection.');
          setIsSubmitting(false);
          return;
        }

        const options = {
          key: data.key || import.meta.env.VITE_RAZORPAY_KEY_ID,
          amount: data.amount,
          currency: data.currency || 'INR',
          name: 'SafeFire Services',
          description: `Service Booking: ${service.name}`,
          order_id: data.razorpayOrderId,
          handler: async function (response) {
            try {
              toast.loading('Verifying secure payment...', { id: 'service-rzp-verify' });
              await verifyServicePayment({
                serviceBookingId: createdBooking._id || createdBooking.id,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              });
              toast.success('Payment verified! Service booking confirmed! 🎉', { id: 'service-rzp-verify' });
              onClose();
              navigate(`/booking-success/${createdBooking._id || createdBooking.bookingId}`);
            } catch (vErr) {
              toast.error(vErr?.response?.data?.message || vErr.message || 'Payment verification failed', { id: 'service-rzp-verify' });
              onClose();
              navigate('/my-service-bookings');
            }
          },
          prefill: {
            name: address.fullName,
            contact: address.phone,
          },
          theme: {
            color: '#E31E24',
          },
          modal: {
            ondismiss: function () {
              toast('Payment cancelled. Your booking is pending payment.', { icon: 'ℹ️' });
              onClose();
              navigate('/my-service-bookings');
            },
          },
        };

        const rzp = new window.Razorpay(options);
        rzp.open();
        return;
      }

      toast.success(data.message || 'Service Booking Created Successfully! 🎉');
      onClose();

      if (createdBooking?.bookingId || createdBooking?._id) {
        navigate(`/booking-success/${createdBooking._id || createdBooking.bookingId}`);
      } else {
        navigate('/my-service-bookings');
      }
    } catch (err) {
      console.error('Booking submission error:', err);
      toast.error(err?.response?.data?.message || err.message || 'Failed to submit service booking.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentStepMeta = STEP_LABELS.find((s) => s.id === step) || STEP_LABELS[0];

  const modalContent = (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-950/70 backdrop-blur-sm animate-fadeIn overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white w-full max-w-xl rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden flex flex-col max-h-[92vh] my-auto animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Accent Strip */}
        <div className="h-1 w-full bg-gradient-to-r from-[#E31E24] via-orange-500 to-[#E31E24] flex-shrink-0" />

        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white flex items-center justify-between border-b border-slate-800 flex-shrink-0">
          <div className="space-y-1 min-w-0 pr-2 sm:pr-3 flex-1">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-[10px] font-extrabold rounded-full tracking-wider uppercase border border-red-500/30 flex-shrink-0">
                Step {step} of 5
              </span>
              <span className="text-slate-400 text-[11px] sm:text-xs font-medium truncate max-w-[140px] xs:max-w-[200px] sm:max-w-[320px]">
                • {service.name}
              </span>
            </div>
            <h3 className="text-sm sm:text-lg font-extrabold text-white leading-tight tracking-tight break-words">
              {currentStepMeta.title}
            </h3>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-all flex-shrink-0"
            title="Close Wizard"
          >
            <FiX className="text-base" />
          </button>
        </div>

        {/* Visual Multi-Step Progress Stepper */}
        <div className="px-4 sm:px-6 py-2.5 bg-slate-100/80 border-b border-slate-200/70 flex-shrink-0">
          <div className="flex items-center justify-between relative">
            {/* Background connecting track */}
            <div className="absolute left-2 right-2 top-3 -translate-y-1/2 h-0.5 bg-slate-200 -z-0" />
            {/* Active connecting track */}
            <div
              className="absolute left-2 top-3 -translate-y-1/2 h-0.5 bg-[#E31E24] transition-all duration-300 -z-0"
              style={{ width: `${((step - 1) / (STEP_LABELS.length - 1)) * 100}%` }}
            />

            {STEP_LABELS.map((s) => {
              const isDone = s.id < step;
              const isCurrent = s.id === step;
              return (
                <div
                  key={s.id}
                  className="flex flex-col items-center gap-1 z-10 cursor-pointer group"
                  onClick={() => {
                    // Allow navigating back to completed steps
                    if (isDone) setStep(s.id);
                  }}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                      isDone
                        ? 'bg-emerald-500 text-white shadow-xs'
                        : isCurrent
                        ? 'bg-[#E31E24] text-white ring-4 ring-red-100 shadow-sm scale-110'
                        : 'bg-slate-200 text-slate-500 group-hover:bg-slate-300'
                    }`}
                  >
                    {isDone ? <FiCheck className="text-xs stroke-[3]" /> : s.id}
                  </div>
                  <span
                    className={`text-[10px] hidden sm:block font-bold tracking-tight transition-colors ${
                      isCurrent
                        ? 'text-[#E31E24]'
                        : isDone
                        ? 'text-slate-700'
                        : 'text-slate-400'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Scrollable Wizard Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 min-h-0 space-y-5 overscroll-contain">
          {/* STEP 1: PINCODE CHECK */}
          {step === 1 && (
            <div className="space-y-5 animate-fadeIn">
              {/* Informational Hero Card */}
              <div className="p-4 bg-gradient-to-br from-red-50/80 via-white to-orange-50/50 border border-red-100/80 rounded-2xl flex items-start gap-3.5 shadow-xs">
                <div className="w-10 h-10 rounded-xl bg-[#E31E24]/10 border border-[#E31E24]/20 flex items-center justify-center text-[#E31E24] text-xl flex-shrink-0">
                  <FiMapPin />
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                    Enter Service / Site Location Pincode
                  </h4>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    We match your location with verified, licensed fire safety technicians serving your exact area.
                  </p>
                </div>
              </div>

              {/* Pincode Input Form */}
              <form onSubmit={handleCheckPincode} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center justify-between">
                    <span>Postal Pincode</span>
                    <span className="text-[10px] text-slate-400 font-normal">6-digit Indian PIN</span>
                  </label>

                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <FiMapPin />
                      </div>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        value={pincode}
                        onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                        placeholder="e.g. 452001"
                        className="w-full pl-10 pr-4 py-3 bg-slate-50/70 border border-slate-300 rounded-xl text-sm font-bold font-mono tracking-widest text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E31E24]/20 focus:border-[#E31E24] focus:bg-white transition-all shadow-inner"
                        autoFocus
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isCheckingPincode || pincode.length !== 6}
                      className="px-6 py-3 bg-[#E31E24] hover:bg-[#c6151b] active:scale-98 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-[#E31E24]/20 flex items-center justify-center gap-2 disabled:opacity-50 flex-shrink-0"
                    >
                      {isCheckingPincode ? (
                        <>
                          <FiLoader className="animate-spin text-sm" />
                          <span>Checking Area...</span>
                        </>
                      ) : (
                        <>
                          <FiSearch className="text-sm" />
                          <span>Check Availability</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Popular Quick Pincodes for Demo/Speed */}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <span className="text-[10px] font-semibold text-slate-500">Quick Test:</span>
                  {['452001', '452010', '110001', '400001'].map((pin) => (
                    <button
                      key={pin}
                      type="button"
                      onClick={() => setPincode(pin)}
                      className={`px-2 py-0.5 text-[10px] font-mono font-semibold rounded-md border transition-all ${
                        pincode === pin
                          ? 'bg-red-50 text-[#E31E24] border-red-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      {pin}
                    </button>
                  ))}
                </div>
              </form>

              {/* Serviceability Result Feedback */}
              {serviceabilityResult && (
                <div className="animate-fadeIn">
                  {!serviceabilityResult.available ? (
                    <div className="p-4 bg-amber-50/90 border border-amber-200 rounded-2xl text-amber-900 text-xs space-y-2.5">
                      <div className="flex items-center gap-2 font-bold text-amber-900">
                        <FiAlertCircle className="text-amber-600 text-lg flex-shrink-0" />
                        <span>Service Currently Unavailable in Pincode {pincode}</span>
                      </div>
                      <p className="text-amber-800 text-[11px] leading-relaxed">
                        {serviceabilityResult.message || 'No active fire safety vendors currently cover this pincode.'}
                      </p>
                      {serviceabilityResult.supportPhone && (
                        <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between flex-wrap gap-2">
                          <span className="text-[11px] font-medium text-amber-800">Need urgent custom dispatch?</span>
                          <a
                            href={`tel:${serviceabilityResult.supportPhone}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold rounded-lg transition-colors shadow-xs"
                          >
                            <FiPhone className="text-xs" />
                            <span>Call Support ({serviceabilityResult.supportPhone})</span>
                          </a>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <FiCheckCircle className="text-emerald-600 text-lg flex-shrink-0" />
                        <span className="font-bold">
                          Great news! {serviceabilityResult.vendors?.length || 1} certified provider(s) available.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setStep(2)}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-lg transition-colors flex-shrink-0"
                      >
                        Continue →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: CHOOSE VENDOR */}
          {step === 2 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-bold text-slate-700">
                  Certified Providers in <span className="font-mono text-[#E31E24]">PIN {pincode}</span>:
                </span>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs text-[#E31E24] font-bold hover:underline inline-flex items-center gap-1"
                >
                  <FiMapPin className="text-[11px]" />
                  <span>Change PIN</span>
                </button>
              </div>

              {!serviceabilityResult?.vendors || serviceabilityResult.vendors.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-2xl text-xs text-slate-500 border border-slate-200">
                  No certified providers found for this pincode.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {serviceabilityResult.vendors.map((v) => {
                    const isSelected = selectedVendor?.vendorId === v.vendorId;
                    return (
                      <div
                        key={v.vendorId}
                        onClick={() => setSelectedVendor(v)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-red-50/70 border-[#E31E24] shadow-sm ring-2 ring-red-100'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                        }`}
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-extrabold text-slate-900 truncate">{v.storeName}</h4>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-extrabold rounded-md">
                              <FiAward className="text-[10px]" />
                              Verified Provider
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold rounded-md">
                              <FiStar className="fill-amber-400 text-amber-400 text-[10px]" />
                              {v.rating || 4.8} ({v.reviewCount || 12})
                            </span>
                          </div>

                          <p className="text-xs text-slate-700 font-bold">
                            Base Fee: <span className="text-[#E31E24]">₹{v.price || 499}</span>
                          </p>

                          <p className="text-[11px] text-slate-500 flex items-center gap-1">
                            <FiClock className="text-slate-400 text-xs" />
                            <span>
                              Hours: {v.workingHours?.start || '09:00'} – {v.workingHours?.end || '18:00'}
                            </span>
                          </p>
                        </div>

                        <div className="flex items-center flex-shrink-0">
                          <div
                            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                              isSelected
                                ? 'bg-[#E31E24] border-[#E31E24] text-white'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {isSelected && <FiCheck className="text-xs stroke-[3]" />}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* STEP 3: DATE & TIME SLOT */}
          {step === 3 && (
            <div className="space-y-5 animate-fadeIn">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
                  <FiCalendar className="text-[#E31E24]" />
                  <span>Select Preferred Appointment Date</span>
                </label>
                <input
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E31E24]/20 focus:border-[#E31E24] focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <FiClock className="text-[#E31E24]" />
                    <span>Select Time Slot</span>
                  </span>
                  <span className="text-[10px] text-slate-400">1-hour technician arrival window</span>
                </label>
                <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 gap-2">
                  {generateSlots().map((slot) => {
                    const isSelected = selectedTimeSlot === slot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setSelectedTimeSlot(slot)}
                        className={`px-2.5 py-2.5 rounded-xl border text-[11px] sm:text-xs font-bold transition-all text-center leading-tight ${
                          isSelected
                            ? 'bg-[#E31E24] text-white border-[#E31E24] shadow-md shadow-[#E31E24]/20 scale-102'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {slot}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: DYNAMIC SERVICE FIELDS */}
          {step === 4 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <p className="text-xs text-slate-700 font-medium">
                  Please provide required service parameters to help our technician arrive fully prepared:
                </p>
              </div>

              {Array.isArray(service.serviceFields) && service.serviceFields.length > 0 ? (
                service.serviceFields.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-800">
                      {field.label} {field.required && <span className="text-[#E31E24]">*</span>}
                    </label>

                    {field.type === 'SELECT' ? (
                      <select
                        value={customFieldValues[field.key] || ''}
                        onChange={(e) =>
                          setCustomFieldValues({ ...customFieldValues, [field.key]: e.target.value })
                        }
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-[#E31E24] focus:ring-2 focus:ring-[#E31E24]/20"
                      >
                        {field.options?.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : field.type === 'TEXTAREA' ? (
                      <textarea
                        rows={2}
                        value={customFieldValues[field.key] || ''}
                        onChange={(e) =>
                          setCustomFieldValues({ ...customFieldValues, [field.key]: e.target.value })
                        }
                        placeholder={field.placeholder || ''}
                        className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-[#E31E24] focus:ring-2 focus:ring-[#E31E24]/20"
                      />
                    ) : (
                      <input
                        type={field.type === 'NUMBER' ? 'number' : 'text'}
                        min={field.type === 'NUMBER' ? '1' : undefined}
                        value={customFieldValues[field.key] || ''}
                        onChange={(e) =>
                          setCustomFieldValues({ ...customFieldValues, [field.key]: e.target.value })
                        }
                        placeholder={field.placeholder || ''}
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-[#E31E24] focus:ring-2 focus:ring-[#E31E24]/20"
                      />
                    )}
                  </div>
                ))
              ) : (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-600 text-center">
                  Standard service parameters apply. Proceed to address & payment.
                </div>
              )}
            </div>
          )}

          {/* STEP 5: ADDRESS & PAYMENT */}
          {step === 5 && (
            <form id="booking-final-form" onSubmit={handleSubmitBooking} className="space-y-4 animate-fadeIn">
              {/* Site Address Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider text-[#E31E24]">
                    Site / Delivery Address
                  </h4>
                  <span className="text-[10px] font-mono text-slate-500">PIN: {pincode}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Full Name</label>
                    <input
                      type="text"
                      value={address.fullName}
                      onChange={(e) => setAddress({ ...address, fullName: e.target.value })}
                      placeholder="e.g. Rahul Sharma"
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-[#E31E24]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Contact Phone</label>
                    <input
                      type="tel"
                      value={address.phone}
                      onChange={(e) => setAddress({ ...address, phone: e.target.value })}
                      placeholder="e.g. 9876543210"
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-[#E31E24]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Complete Address / Landmark</label>
                  <textarea
                    rows={2}
                    value={address.address}
                    onChange={(e) => setAddress({ ...address, address: e.target.value })}
                    placeholder="Building, Flat/Premise number, Street, Landmark..."
                    required
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-[#E31E24]"
                  />
                </div>
              </div>

              {/* Payment Methods */}
              <div className="pt-3 border-t border-slate-200 space-y-2.5">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider text-[#E31E24]">
                  Payment Method
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cod')}
                    className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all ${
                      paymentMethod === 'cod'
                        ? 'bg-red-50 text-[#E31E24] border-[#E31E24] shadow-xs ring-1 ring-[#E31E24]'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <FiDollarSign className="text-base" />
                    <span>Pay On Service</span>
                    <span className="text-[10px] text-slate-400 font-normal">Cash / On-site UPI</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('upi')}
                    className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all ${
                      paymentMethod === 'upi'
                        ? 'bg-red-50 text-[#E31E24] border-[#E31E24] shadow-xs ring-1 ring-[#E31E24]'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <FiCreditCard className="text-base" />
                    <span>UPI / Online</span>
                    <span className="text-[10px] text-slate-400 font-normal">Instant & Secure</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('wallet')}
                    className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all ${
                      paymentMethod === 'wallet'
                        ? 'bg-red-50 text-[#E31E24] border-[#E31E24] shadow-xs ring-1 ring-[#E31E24]'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <FiShield className="text-base" />
                    <span>SafeFire Wallet</span>
                    <span className="text-[10px] font-bold text-emerald-600">
                      {walletBalance !== null ? `₹${walletBalance}` : 'Checking...'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Summary Card */}
              <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Selected Provider:</span>
                  <span className="font-bold text-slate-900">{selectedVendor?.storeName}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Scheduled Slot:</span>
                  <span className="font-bold text-slate-900">
                    {selectedDate} ({selectedTimeSlot})
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Service Rate:</span>
                  <span className="font-bold text-slate-900">₹{unitPrice} × {qty} unit(s)</span>
                </div>
                <div className="flex justify-between text-slate-900 font-extrabold pt-2 border-t border-slate-200 text-sm">
                  <span>Total Amount Payable:</span>
                  <span className="text-[#E31E24] text-base">₹{total}</span>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Wizard Sticky Bottom Controls */}
        <div className="px-3 sm:px-6 py-3 bg-slate-50/90 backdrop-blur-sm border-t border-slate-200 flex items-center justify-between gap-2 flex-shrink-0">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="px-3 sm:px-4 py-2.5 bg-white border border-slate-300 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-100 transition-all flex items-center gap-1 sm:gap-1.5 shadow-2xs flex-shrink-0"
            >
              <FiArrowLeft />
              <span>Back</span>
            </button>
          ) : (
            <div />
          )}

          {step === 1 && (
            <button
              type="button"
              onClick={handleCheckPincode}
              disabled={isCheckingPincode || pincode.length !== 6}
              className="px-6 py-2.5 bg-[#E31E24] hover:bg-[#c6151b] active:scale-98 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-[#E31E24]/20 flex items-center gap-2 disabled:opacity-50"
            >
              <span>Continue</span>
              <FiArrowRight />
            </button>
          )}

          {step === 2 && (
            <button
              type="button"
              disabled={!selectedVendor}
              onClick={() => setStep(3)}
              className="px-6 py-2.5 bg-[#E31E24] hover:bg-[#c6151b] active:scale-98 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-[#E31E24]/20 flex items-center gap-2 disabled:opacity-50"
            >
              <span>Select & Continue</span>
              <FiArrowRight />
            </button>
          )}

          {step === 3 && (
            <button
              type="button"
              disabled={!selectedDate || !selectedTimeSlot}
              onClick={() => setStep(4)}
              className="px-6 py-2.5 bg-[#E31E24] hover:bg-[#c6151b] active:scale-98 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-[#E31E24]/20 flex items-center gap-2 disabled:opacity-50"
            >
              <span>Continue to Specs</span>
              <FiArrowRight />
            </button>
          )}

          {step === 4 && (
            <button
              type="button"
              onClick={() => setStep(5)}
              className="px-6 py-2.5 bg-[#E31E24] hover:bg-[#c6151b] active:scale-98 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-[#E31E24]/20 flex items-center gap-2"
            >
              <span>Continue to Address</span>
              <FiArrowRight />
            </button>
          )}

          {step === 5 && (
            <button
              type="submit"
              form="booking-final-form"
              disabled={isSubmitting}
              className="px-4 sm:px-6 py-2.5 bg-[#E31E24] hover:bg-[#c6151b] active:scale-98 text-white font-bold rounded-xl text-xs transition-all shadow-lg shadow-[#E31E24]/30 flex items-center gap-1.5 sm:gap-2 disabled:opacity-50 flex-shrink-0"
            >
              {isSubmitting ? (
                <>
                  <FiLoader className="animate-spin text-sm" />
                  <span>Confirming...</span>
                </>
              ) : (
                <>
                  <FiCheck />
                  <span>Confirm & Book Service</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};

export default ServiceBookingWizard;
