import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  FiX,
  FiCheck,
  FiMapPin,
  FiCalendar,
  FiClock,
  FiShield,
  FiStar,
  FiPhone,
  FiArrowRight,
  FiArrowLeft,
  FiCreditCard,
  FiDollarSign,
  FiAlertCircle,
  FiCheckCircle,
  FiLoader,
  FiSearch,
  FiAward,
  FiMinus,
  FiPlus,
  FiLayers,
  FiLogIn,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import {
  checkServiceability,
  createBooking,
  verifyServicePayment,
  getServiceQuote,
  getServiceSchedule,
} from '../services/customerServiceApi';
import api from '../../../shared/utils/api';
import { useAuthStore } from '../../../shared/store/authStore';

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

const formatINR = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const formatDateChip = (dateStr) => {
  const d = new Date(`${dateStr}T00:00:00`);
  return {
    weekday: d.toLocaleDateString('en-IN', { weekday: 'short' }),
    day: d.toLocaleDateString('en-IN', { day: '2-digit' }),
    month: d.toLocaleDateString('en-IN', { month: 'short' }),
  };
};

const formatLongDate = (dateStr) =>
  dateStr ? new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '';

const getActiveVariants = (service) =>
  (Array.isArray(service?.variants) ? service.variants : [])
    .filter((v) => v && v.isActive !== false && v.key)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

const getQuantityRules = (service) => {
  const enabled = service?.serviceSettings?.requiresQuantity === true;
  const cfg = service?.quantityConfig || {};
  const min = Math.max(1, Number(cfg.min) || 1);
  const max = Math.max(min, Number(cfg.max) || 100);
  return { enabled, label: cfg.label || 'Quantity', unitLabel: cfg.unitLabel || 'unit', min, max };
};

/** Builds the step list from the service's admin configuration. */
const buildSteps = (service) => {
  const variantLabel = service?.variantConfig?.label || 'Category Type';
  const quantity = getQuantityRules(service);
  return [
    { id: 'pincode', label: 'Pincode', title: 'Check Pincode Serviceability' },
    { id: 'provider', label: 'Provider', title: 'Select Service Provider' },
    getActiveVariants(service).length > 0 && { id: 'type', label: variantLabel, title: `Select ${variantLabel}` },
    quantity.enabled && { id: 'quantity', label: quantity.label, title: quantity.label },
    { id: 'price', label: 'Price', title: 'Price Breakdown' },
    { id: 'address', label: 'Address', title: 'Service Address' },
    { id: 'schedule', label: 'Schedule', title: 'Select Date & Time Slot' },
    { id: 'payment', label: 'Payment', title: 'Review & Payment' },
  ].filter(Boolean);
};

const emptyAddress = { fullName: '', phone: '', address: '', city: '', state: '' };

const inputCls =
  'w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-[#E31E24]';

const ServiceBookingWizard = ({ isOpen, onClose, service: initialService }) => {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();

  // The serviceability response returns the live service config; fall back to the card's copy.
  const [serviceConfig, setServiceConfig] = useState(initialService);
  const service = serviceConfig || initialService;
  const steps = useMemo(() => buildSteps(service), [service]);
  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = steps[Math.min(stepIndex, steps.length - 1)];

  // Pincode & providers
  const [pincode, setPincode] = useState('');
  const [isCheckingPincode, setIsCheckingPincode] = useState(false);
  const [serviceabilityResult, setServiceabilityResult] = useState(null);
  const [selectedVendor, setSelectedVendor] = useState(null);

  // Category type & quantity
  const [selectedVariantKey, setSelectedVariantKey] = useState('');
  const [quantity, setQuantity] = useState(1);

  // Price
  const [quote, setQuote] = useState(null);
  const [isQuoting, setIsQuoting] = useState(false);

  // Address & service details
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [address, setAddress] = useState(emptyAddress);
  const [customFieldValues, setCustomFieldValues] = useState({});
  const [notes, setNotes] = useState('');

  // Schedule
  const [schedule, setSchedule] = useState([]);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('');

  // Payment
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [walletBalance, setWalletBalance] = useState(null);
  const [isCodOnly, setIsCodOnly] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const variants = getActiveVariants(service);
  const quantityRules = getQuantityRules(service);
  const variantOptions = selectedVendor?.variantOptions || [];

  // Checkout payment mode (admin settings)
  useEffect(() => {
    let active = true;
    api.get('/settings/checkout')
      .then((res) => {
        const data = res?.data ?? res;
        if (active && data) {
          const codOnly = data.paymentMode === 'COD_ONLY' || !data.payment?.razorpay;
          setIsCodOnly(codOnly);
          if (codOnly) setPaymentMethod('cod');
        }
      })
      .catch(() => {
        if (active) {
          setIsCodOnly(true);
          setPaymentMethod('cod');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // Lock background scroll & support Escape key
  useEffect(() => {
    if (!isOpen) return undefined;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Wallet balance & saved addresses for logged-in customers
  useEffect(() => {
    if (!isOpen || !isAuthenticated) return;
    api.get('/user/wallet')
      .then((res) => {
        const data = res?.data?.data || res?.data || res;
        if (data && typeof data.balance === 'number') setWalletBalance(data.balance);
      })
      .catch(() => {});
    api.get('/user/addresses')
      .then((res) => {
        const list = Array.isArray(res) ? res : res?.data || [];
        setSavedAddresses(list);
        const preferred = list.find((a) => a.isDefault) || list[0];
        if (preferred?.zipCode) setPincode((current) => current || String(preferred.zipCode));
      })
      .catch(() => {});
  }, [isOpen, isAuthenticated]);

  // Reset on open / service change
  useEffect(() => {
    if (!initialService || !isOpen) return;
    setServiceConfig(initialService);
    setStepIndex(0);
    setServiceabilityResult(null);
    setSelectedVendor(null);
    setSelectedVariantKey('');
    setQuantity(getQuantityRules(initialService).min);
    setQuote(null);
    setSchedule([]);
    setSelectedDate('');
    setSelectedTimeSlot('');
    setSelectedAddressId('');
    setAddress({ ...emptyAddress, fullName: user?.name || '', phone: user?.phone || '' });
    setNotes('');
    const initFields = {};
    (initialService.serviceFields || []).forEach((field) => {
      initFields[field.key] = field.type === 'SELECT' && field.options?.length ? field.options[0] : '';
    });
    setCustomFieldValues(initFields);
  }, [initialService, isOpen, user?.name, user?.phone]);

  // Saved addresses that are inside the checked pincode
  const matchingAddresses = useMemo(
    () => savedAddresses.filter((a) => String(a.zipCode || '').trim() === pincode.trim()),
    [savedAddresses, pincode]
  );
  const pincodeSuggestions = useMemo(
    () => [...new Set(savedAddresses.map((a) => String(a.zipCode || '').trim()).filter((z) => /^\d{6}$/.test(z)))],
    [savedAddresses]
  );

  const goToStep = (id) => {
    const idx = steps.findIndex((s) => s.id === id);
    if (idx >= 0) setStepIndex(idx);
  };
  const goNext = () => setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  const goBack = () => setStepIndex((i) => Math.max(i - 1, 0));

  // ── Price: always calculated by the server ──
  const fetchQuote = useCallback(async () => {
    if (!selectedVendor) return null;
    setIsQuoting(true);
    try {
      const res = await getServiceQuote({
        serviceId: service._id || service.id,
        vendorId: selectedVendor.vendorId,
        pincode: pincode.trim(),
        variantKey: selectedVariantKey || undefined,
        quantity,
      });
      const data = res?.data ?? res;
      setQuote(data);
      return data;
    } catch {
      setQuote(null);
      return null;
    } finally {
      setIsQuoting(false);
    }
  }, [service, selectedVendor, pincode, selectedVariantKey, quantity]);

  useEffect(() => {
    if (currentStep?.id === 'price') fetchQuote();
  }, [currentStep?.id, fetchQuote]);

  // ── Schedule: provider's real availability ──
  useEffect(() => {
    if (currentStep?.id !== 'schedule' || !selectedVendor) return;
    let active = true;
    setIsLoadingSchedule(true);
    getServiceSchedule({ serviceId: service._id || service.id, vendorId: selectedVendor.vendorId, pincode: pincode.trim() })
      .then((res) => {
        if (!active) return;
        const days = (res?.data ?? res)?.days || [];
        setSchedule(days);
        const stillValid = days.find((d) => d.date === selectedDate && d.slots.some((s) => s.label === selectedTimeSlot));
        if (!stillValid) {
          const firstOpen = days.find((d) => d.slots.length > 0);
          setSelectedDate(firstOpen?.date || '');
          setSelectedTimeSlot('');
        }
      })
      .catch(() => active && setSchedule([]))
      .finally(() => active && setIsLoadingSchedule(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep?.id, selectedVendor, service, pincode]);

  if (!isOpen || !service) return null;

  const selectedDay = schedule.find((d) => d.date === selectedDate);

  // STEP: Pincode
  const handleCheckPincode = async (e) => {
    e?.preventDefault();
    const cleanPin = (pincode || '').trim();
    if (!/^\d{6}$/.test(cleanPin)) {
      toast.error('Please enter a valid 6-digit postal pincode.');
      return;
    }
    setIsCheckingPincode(true);
    try {
      const res = await checkServiceability({ serviceId: service._id || service.id, pincode: cleanPin });
      const data = res?.data ?? res ?? {};
      setServiceabilityResult(data);
      if (data.service) setServiceConfig(data.service);
      if (data.available && Array.isArray(data.vendors) && data.vendors.length > 0) {
        setSelectedVendor(data.vendors.length === 1 ? data.vendors[0] : null);
        setSelectedVariantKey('');
        setQuote(null);
        setSchedule([]);
        setSelectedDate('');
        setSelectedTimeSlot('');
        setSelectedAddressId('');
        setStepIndex(1);
      }
    } catch (err) {
      // API client shows the error toast
    } finally {
      setIsCheckingPincode(false);
    }
  };

  const selectSavedAddress = (a) => {
    setSelectedAddressId(a._id || a.id);
    setAddress({
      fullName: a.fullName || a.name || '',
      phone: String(a.phone || '').replace(/\D/g, '').slice(-10),
      address: a.address || '',
      city: a.city || '',
      state: a.state || '',
    });
  };

  const addressError = () => {
    if (!address.fullName.trim()) return 'Please enter the contact name.';
    if (String(address.phone).replace(/\D/g, '').length !== 10) return 'Please enter a valid 10-digit phone number.';
    if (!address.address.trim()) return 'Please enter the site address.';
    if (!address.city.trim()) return 'Please enter the city.';
    const missing = (service.serviceFields || []).find((f) => f.required && !String(customFieldValues[f.key] ?? '').trim());
    if (missing) return `Please fill in "${missing.label}".`;
    return null;
  };

  // Step gating
  const canContinue = () => {
    switch (currentStep.id) {
      case 'pincode': return /^\d{6}$/.test(pincode.trim());
      case 'provider': return Boolean(selectedVendor);
      case 'type': return Boolean(selectedVariantKey);
      case 'quantity': return Number.isInteger(Number(quantity)) && quantity >= quantityRules.min && quantity <= quantityRules.max;
      case 'price': return Boolean(quote) && !isQuoting;
      case 'address': return isAuthenticated;
      case 'schedule': return Boolean(selectedDate && selectedTimeSlot);
      default: return true;
    }
  };

  const handleContinue = () => {
    if (currentStep.id === 'pincode') return handleCheckPincode();
    if (currentStep.id === 'address') {
      const err = addressError();
      if (err) return toast.error(err);
    }
    return goNext();
  };

  // SUBMIT
  const handleSubmitBooking = async (e) => {
    e?.preventDefault();
    const err = addressError();
    if (err) {
      toast.error(err);
      goToStep('address');
      return;
    }
    const latestQuote = await fetchQuote();
    if (!latestQuote) return;
    if (paymentMethod === 'wallet' && walletBalance !== null && walletBalance < latestQuote.total) {
      toast.error(`Insufficient wallet balance (${formatINR(walletBalance)}). Required: ${formatINR(latestQuote.total)}.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        serviceId: service._id || service.id,
        vendorId: selectedVendor?.vendorId,
        ...(selectedVariantKey ? { variant: { key: selectedVariantKey } } : {}),
        quantity,
        pincode: pincode.trim(),
        serviceAddress: {
          fullName: address.fullName.trim(),
          phone: String(address.phone).replace(/\D/g, '').slice(-10),
          address: address.address.trim(),
          city: address.city.trim(),
          state: address.state.trim(),
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

      if (data.requiresPayment && data.razorpayOrderId) {
        const sdkLoaded = await loadRazorpay();
        if (!sdkLoaded || !window.Razorpay) {
          toast.error('Razorpay SDK failed to load. Please check your internet connection.');
          setIsSubmitting(false);
          return;
        }
        const rzp = new window.Razorpay({
          key: data.key || import.meta.env.VITE_RAZORPAY_KEY_ID,
          amount: data.amountPaise || Math.round(Number(data.amount || 0) * 100),
          currency: data.currency || 'INR',
          name: 'SafeFire Services',
          description: `Service Booking: ${service.name}`,
          order_id: data.razorpayOrderId,
          handler: async (response) => {
            try {
              toast.loading('Verifying secure payment...', { id: 'service-rzp-verify' });
              await verifyServicePayment({
                serviceBookingId: createdBooking._id || createdBooking.id,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              });
              toast.success('Payment verified! Service booking confirmed!', { id: 'service-rzp-verify' });
              onClose();
              navigate(`/booking-success/${createdBooking._id || createdBooking.bookingId}`);
            } catch (vErr) {
              toast.error(vErr?.response?.data?.message || vErr.message || 'Payment verification failed', { id: 'service-rzp-verify' });
              onClose();
              navigate('/my-service-bookings');
            }
          },
          prefill: { name: address.fullName, contact: address.phone },
          theme: { color: '#E31E24' },
          modal: {
            ondismiss: () => {
              toast('Payment cancelled. Your booking is pending payment.', { icon: 'ℹ️' });
              onClose();
              navigate('/my-service-bookings');
            },
          },
        });
        rzp.open();
        return;
      }

      toast.success(data.message || 'Service booking created successfully!', { id: 'service-booking-created' });
      onClose();
      navigate(createdBooking?._id || createdBooking?.bookingId
        ? `/booking-success/${createdBooking._id || createdBooking.bookingId}`
        : '/my-service-bookings');
    } catch (err) {
      // API client shows the error toast
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedVariantOption = variantOptions.find((v) => v.key === selectedVariantKey);

  const modalContent = (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-950/70 backdrop-blur-sm animate-fadeIn overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true">
      <div
        className="bg-white w-full max-w-xl rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden flex flex-col max-h-[92vh] my-auto animate-scaleUp"
        onClick={(e) => e.stopPropagation()}>
        <div className="h-1 w-full bg-gradient-to-r from-[#E31E24] via-orange-500 to-[#E31E24] flex-shrink-0" />

        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white flex items-center justify-between border-b border-slate-800 flex-shrink-0">
          <div className="space-y-1 min-w-0 pr-2 sm:pr-3 flex-1">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-[10px] font-extrabold rounded-full tracking-wider uppercase border border-red-500/30 flex-shrink-0">
                Step {stepIndex + 1} of {steps.length}
              </span>
              <span className="text-slate-400 text-[11px] sm:text-xs font-medium truncate max-w-[140px] xs:max-w-[200px] sm:max-w-[320px]">
                • {service.name}
              </span>
            </div>
            <h3 className="text-sm sm:text-lg font-extrabold text-white leading-tight tracking-tight break-words">{currentStep.title}</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-all flex-shrink-0"
            title="Close"
            aria-label="Close booking">
            <FiX className="text-base" />
          </button>
        </div>

        {/* Stepper */}
        <div className="px-3 sm:px-6 py-2.5 bg-slate-100/80 border-b border-slate-200/70 flex-shrink-0">
          <div className="flex items-center justify-between relative">
            <div className="absolute left-2 right-2 top-3 -translate-y-1/2 h-0.5 bg-slate-200 -z-0" />
            <div
              className="absolute left-2 top-3 -translate-y-1/2 h-0.5 bg-[#E31E24] transition-all duration-300 -z-0"
              style={{ width: `${(stepIndex / Math.max(1, steps.length - 1)) * 100}%` }}
            />
            {steps.map((s, idx) => {
              const isDone = idx < stepIndex;
              const isCurrent = idx === stepIndex;
              return (
                <button
                  type="button"
                  key={s.id}
                  className="flex flex-col items-center gap-1 z-10 group min-w-0"
                  onClick={() => isDone && setStepIndex(idx)}
                  disabled={!isDone}
                  aria-label={`Step ${idx + 1}: ${s.label}`}>
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                      isDone
                        ? 'bg-emerald-500 text-white shadow-xs'
                        : isCurrent
                        ? 'bg-[#E31E24] text-white ring-4 ring-red-100 shadow-sm scale-110'
                        : 'bg-slate-200 text-slate-500'
                    }`}>
                    {isDone ? <FiCheck className="text-xs stroke-[3]" /> : idx + 1}
                  </span>
                  <span
                    className={`text-[9px] hidden sm:block font-bold tracking-tight truncate max-w-[64px] ${
                      isCurrent ? 'text-[#E31E24]' : isDone ? 'text-slate-700' : 'text-slate-400'
                    }`}>
                    {s.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 min-h-0 space-y-5 overscroll-contain">
          {/* ── PINCODE ── */}
          {currentStep.id === 'pincode' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="p-4 bg-gradient-to-br from-red-50/80 via-white to-orange-50/50 border border-red-100/80 rounded-2xl flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#E31E24]/10 border border-[#E31E24]/20 flex items-center justify-center text-[#E31E24] text-xl flex-shrink-0">
                  <FiMapPin />
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900">Enter the service location pincode</h4>
                  <p className="text-[11px] text-slate-600 leading-relaxed">We show providers that serve this exact area.</p>
                </div>
              </div>

              <form onSubmit={handleCheckPincode} className="space-y-3">
                <label className="block text-xs font-bold text-slate-800">Postal Pincode</label>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <div className="relative flex-1">
                    <FiMapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                      placeholder="6-digit pincode"
                      className="w-full pl-10 pr-4 py-3 bg-slate-50/70 border border-slate-300 rounded-xl text-sm font-bold font-mono tracking-widest text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E31E24]/20 focus:border-[#E31E24] focus:bg-white"
                      autoFocus
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isCheckingPincode || pincode.length !== 6}
                    className="px-6 py-3 bg-[#E31E24] hover:bg-[#c6151b] text-white font-bold text-xs rounded-xl shadow-md shadow-[#E31E24]/20 flex items-center justify-center gap-2 disabled:opacity-50 flex-shrink-0">
                    {isCheckingPincode ? <><FiLoader className="animate-spin text-sm" /> Checking…</> : <><FiSearch className="text-sm" /> Check Availability</>}
                  </button>
                </div>

                {pincodeSuggestions.length > 0 && (
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <span className="text-[10px] font-semibold text-slate-500">Your saved locations:</span>
                    {pincodeSuggestions.map((pin) => (
                      <button
                        key={pin}
                        type="button"
                        onClick={() => setPincode(pin)}
                        className={`px-2 py-0.5 text-[10px] font-mono font-semibold rounded-md border ${
                          pincode === pin ? 'bg-red-50 text-[#E31E24] border-red-200' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                        }`}>
                        {pin}
                      </button>
                    ))}
                  </div>
                )}
              </form>

              {serviceabilityResult && !serviceabilityResult.available && (
                <div className="p-4 bg-amber-50/90 border border-amber-200 rounded-2xl text-amber-900 text-xs space-y-2.5 animate-fadeIn">
                  <div className="flex items-center gap-2 font-bold">
                    <FiAlertCircle className="text-amber-600 text-lg flex-shrink-0" />
                    <span>Service currently unavailable in pincode {serviceabilityResult.pincode}</span>
                  </div>
                  <p className="text-amber-800 text-[11px] leading-relaxed">{serviceabilityResult.message}</p>
                  {serviceabilityResult.supportPhone && (
                    <a
                      href={`tel:${serviceabilityResult.supportPhone}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold rounded-lg">
                      <FiPhone className="text-xs" /> Call Support ({serviceabilityResult.supportPhone})
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── PROVIDER ── */}
          {currentStep.id === 'provider' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-bold text-slate-700">
                  Available providers in <span className="font-mono text-[#E31E24]">PIN {pincode}</span>:
                </span>
                <button type="button" onClick={() => goToStep('pincode')} className="text-xs text-[#E31E24] font-bold hover:underline inline-flex items-center gap-1">
                  <FiMapPin className="text-[11px]" /> Change PIN
                </button>
              </div>
              <div className="space-y-2.5">
                {(serviceabilityResult?.vendors || []).map((v) => {
                  const isSelected = selectedVendor?.vendorId === v.vendorId;
                  return (
                    <button
                      type="button"
                      key={v.vendorId}
                      onClick={() => {
                        setSelectedVendor(v);
                        setSelectedVariantKey('');
                        setQuote(null);
                        setSchedule([]);
                        setSelectedDate('');
                        setSelectedTimeSlot('');
                      }}
                      className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                        isSelected ? 'bg-red-50/70 border-[#E31E24] shadow-sm ring-2 ring-red-100' : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                      }`}>
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-extrabold text-slate-900 truncate">{v.storeName}</h4>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-extrabold rounded-md">
                            <FiAward className="text-[10px]" /> Verified Provider
                          </span>
                          {v.reviewCount > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold rounded-md">
                              <FiStar className="fill-amber-400 text-amber-400 text-[10px]" />
                              {Number(v.rating).toFixed(1)} ({v.reviewCount})
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded-md">New provider</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-700 font-bold">
                          {variants.length > 0 ? 'Starting at' : 'Price'}: <span className="text-[#E31E24]">{formatINR(v.startingPrice ?? v.price)}</span>
                          {quantityRules.enabled && <span className="text-slate-500 font-medium"> / {quantityRules.unitLabel}</span>}
                        </p>
                        {v.workingHours?.start && v.workingHours?.end && (
                          <p className="text-[11px] text-slate-500 flex items-center gap-1">
                            <FiClock className="text-slate-400 text-xs" /> Hours: {v.workingHours.start} – {v.workingHours.end}
                          </p>
                        )}
                        {v.vendorNotes && <p className="text-[11px] text-slate-500">{v.vendorNotes}</p>}
                      </div>
                      <span
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'bg-[#E31E24] border-[#E31E24] text-white' : 'border-slate-300 bg-white'
                        }`}>
                        {isSelected && <FiCheck className="text-xs stroke-[3]" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── CATEGORY TYPE ── */}
          {currentStep.id === 'type' && (
            <div className="space-y-4 animate-fadeIn">
              {service.variantConfig?.description && (
                <p className="text-xs text-slate-600 p-3 bg-slate-50 border border-slate-200 rounded-xl">{service.variantConfig.description}</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {variantOptions.map((opt) => {
                  const isSelected = selectedVariantKey === opt.key;
                  return (
                    <button
                      type="button"
                      key={opt.key}
                      onClick={() => {
                        setSelectedVariantKey(opt.key);
                        setQuote(null);
                      }}
                      className={`text-left p-4 rounded-2xl border transition-all ${
                        isSelected ? 'bg-red-50/70 border-[#E31E24] ring-2 ring-red-100' : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                          <FiLayers className="text-[#E31E24]" /> {opt.label}
                        </span>
                        {isSelected && <FiCheckCircle className="text-[#E31E24] flex-shrink-0" />}
                      </div>
                      {opt.description && <p className="text-[11px] text-slate-500 mt-1">{opt.description}</p>}
                      <p className="text-xs font-bold text-slate-800 mt-2">
                        {formatINR(opt.unitPrice)}
                        {quantityRules.enabled && <span className="text-slate-500 font-medium"> / {quantityRules.unitLabel}</span>}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── QUANTITY ── */}
          {currentStep.id === 'quantity' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col items-center gap-3">
                <p className="text-xs font-bold text-slate-700">
                  How many {quantityRules.unitLabel}(s)?{' '}
                  <span className="text-slate-400 font-medium">({quantityRules.min}–{quantityRules.max})</span>
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    disabled={quantity <= quantityRules.min}
                    onClick={() => { setQuantity((q) => Math.max(quantityRules.min, q - 1)); setQuote(null); }}
                    className="w-10 h-10 rounded-xl border border-slate-300 bg-white flex items-center justify-center text-slate-700 disabled:opacity-40">
                    <FiMinus />
                  </button>
                  <input
                    type="number"
                    min={quantityRules.min}
                    max={quantityRules.max}
                    value={quantity}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      setQuantity(Number.isNaN(n) ? quantityRules.min : Math.min(quantityRules.max, Math.max(quantityRules.min, n)));
                      setQuote(null);
                    }}
                    className="w-20 text-center px-2 py-2 border border-slate-300 rounded-xl text-lg font-extrabold text-slate-900 focus:outline-none focus:border-[#E31E24]"
                  />
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    disabled={quantity >= quantityRules.max}
                    onClick={() => { setQuantity((q) => Math.min(quantityRules.max, q + 1)); setQuote(null); }}
                    className="w-10 h-10 rounded-xl border border-slate-300 bg-white flex items-center justify-center text-slate-700 disabled:opacity-40">
                    <FiPlus />
                  </button>
                </div>
                {selectedVariantOption && (
                  <p className="text-[11px] text-slate-500">{selectedVariantOption.label} · {formatINR(selectedVariantOption.unitPrice)} / {quantityRules.unitLabel}</p>
                )}
              </div>
            </div>
          )}

          {/* ── PRICE ── */}
          {currentStep.id === 'price' && (
            <div className="space-y-4 animate-fadeIn">
              {isQuoting || !quote ? (
                <div className="py-10 flex items-center justify-center gap-2 text-xs text-slate-500">
                  {isQuoting ? <><FiLoader className="animate-spin" /> Calculating price…</> : 'Unable to calculate price. Please go back and check your selection.'}
                </div>
              ) : (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Provider</span>
                    <span className="font-bold text-slate-900">{selectedVendor?.storeName}</span>
                  </div>
                  {quote.variant && (
                    <div className="flex justify-between text-slate-600">
                      <span>{service.variantConfig?.label || 'Category Type'}</span>
                      <span className="font-bold text-slate-900">{quote.variant.label}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-600">
                    <span>Rate</span>
                    <span className="font-bold text-slate-900">
                      {formatINR(quote.unitPrice)} × {quote.quantity} {quote.unitLabel}(s)
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Service subtotal</span>
                    <span className="font-bold text-slate-900">{formatINR(quote.subtotal)}</span>
                  </div>
                  {quote.visitCharge > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Visit charge</span>
                      <span className="font-bold text-slate-900">{formatINR(quote.visitCharge)}</span>
                    </div>
                  )}
                  {quote.taxRate > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Tax ({quote.taxRate}%)</span>
                      <span className="font-bold text-slate-900">{formatINR(quote.tax)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-900 font-extrabold pt-2 border-t border-slate-200 text-sm">
                    <span>{quote.isEstimate ? 'Estimated total' : 'Total payable'}</span>
                    <span className="text-[#E31E24] text-base">{formatINR(quote.total)}</span>
                  </div>
                  {quote.isEstimate && (
                    <p className="text-[11px] text-amber-700">Final price is confirmed by the provider after inspecting the site.</p>
                  )}
                  {quote.priceNote && <p className="text-[11px] text-slate-500">{quote.priceNote}</p>}
                </div>
              )}
            </div>
          )}

          {/* ── ADDRESS ── */}
          {currentStep.id === 'address' && (
            <div className="space-y-4 animate-fadeIn">
              {!isAuthenticated ? (
                <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-3">
                  <p className="text-xs text-slate-700 font-semibold">Please log in to add the service address and complete your booking.</p>
                  <button
                    type="button"
                    onClick={() => { onClose(); navigate('/login', { state: { from: { pathname: '/services' } } }); }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#E31E24] hover:bg-[#c6151b] text-white text-xs font-bold rounded-xl">
                    <FiLogIn /> Log in to continue
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#E31E24]">Site address</h4>
                    <span className="text-[10px] font-mono text-slate-500">PIN: {pincode}</span>
                  </div>

                  {matchingAddresses.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold text-slate-600">Your saved addresses in this pincode</p>
                      {matchingAddresses.map((a) => {
                        const id = a._id || a.id;
                        const isSelected = selectedAddressId === id;
                        return (
                          <button
                            type="button"
                            key={id}
                            onClick={() => selectSavedAddress(a)}
                            className={`w-full text-left p-3 rounded-xl border text-xs ${
                              isSelected ? 'border-[#E31E24] bg-red-50/60 ring-1 ring-[#E31E24]' : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}>
                            <p className="font-bold text-slate-900">{a.name ? `${a.name} · ` : ''}{a.fullName}</p>
                            <p className="text-slate-600">{a.address}, {a.city}{a.state ? `, ${a.state}` : ''}</p>
                            <p className="text-slate-500">{a.phone}</p>
                          </button>
                        );
                      })}
                      <p className="text-[11px] text-slate-500">Or edit the details below.</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="block text-[11px] font-bold text-slate-700 mb-1">Contact name *</span>
                      <input value={address.fullName} onChange={(e) => { setSelectedAddressId(''); setAddress({ ...address, fullName: e.target.value }); }} className={inputCls} />
                    </label>
                    <label className="block">
                      <span className="block text-[11px] font-bold text-slate-700 mb-1">Contact phone *</span>
                      <input type="tel" inputMode="numeric" maxLength={10} value={address.phone} onChange={(e) => { setSelectedAddressId(''); setAddress({ ...address, phone: e.target.value.replace(/\D/g, '') }); }} className={inputCls} />
                    </label>
                  </div>
                  <label className="block">
                    <span className="block text-[11px] font-bold text-slate-700 mb-1">Complete address / landmark *</span>
                    <textarea rows={2} value={address.address} onChange={(e) => { setSelectedAddressId(''); setAddress({ ...address, address: e.target.value }); }} placeholder="Building, floor, street, landmark" className={inputCls} />
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="block text-[11px] font-bold text-slate-700 mb-1">City *</span>
                      <input value={address.city} onChange={(e) => { setSelectedAddressId(''); setAddress({ ...address, city: e.target.value }); }} className={inputCls} />
                    </label>
                    <label className="block">
                      <span className="block text-[11px] font-bold text-slate-700 mb-1">State</span>
                      <input value={address.state} onChange={(e) => { setSelectedAddressId(''); setAddress({ ...address, state: e.target.value }); }} className={inputCls} />
                    </label>
                  </div>

                  {/* Admin-defined service details */}
                  {(service.serviceFields || []).length > 0 && (
                    <div className="pt-3 border-t border-slate-200 space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[#E31E24]">Service details</h4>
                      {[...service.serviceFields].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).map((field) => (
                        <label key={field.key} className="block">
                          <span className="block text-[11px] font-bold text-slate-700 mb-1">
                            {field.label} {field.required && <span className="text-[#E31E24]">*</span>}
                          </span>
                          {field.type === 'SELECT' ? (
                            <select value={customFieldValues[field.key] || ''} onChange={(e) => setCustomFieldValues({ ...customFieldValues, [field.key]: e.target.value })} className={inputCls}>
                              {(field.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                          ) : field.type === 'TEXTAREA' ? (
                            <textarea rows={2} value={customFieldValues[field.key] || ''} onChange={(e) => setCustomFieldValues({ ...customFieldValues, [field.key]: e.target.value })} placeholder={field.placeholder || ''} className={inputCls} />
                          ) : (
                            <input
                              type={field.type === 'NUMBER' ? 'number' : field.type === 'DATE' ? 'date' : 'text'}
                              value={customFieldValues[field.key] || ''}
                              onChange={(e) => setCustomFieldValues({ ...customFieldValues, [field.key]: e.target.value })}
                              placeholder={field.placeholder || ''}
                              className={inputCls}
                            />
                          )}
                        </label>
                      ))}
                    </div>
                  )}

                  <label className="block">
                    <span className="block text-[11px] font-bold text-slate-700 mb-1">Notes for the technician</span>
                    <textarea rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
                  </label>
                </>
              )}
            </div>
          )}

          {/* ── SCHEDULE ── */}
          {currentStep.id === 'schedule' && (
            <div className="space-y-5 animate-fadeIn">
              {isLoadingSchedule ? (
                <div className="py-10 flex items-center justify-center gap-2 text-xs text-slate-500"><FiLoader className="animate-spin" /> Loading availability…</div>
              ) : schedule.every((d) => d.slots.length === 0) ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900">
                  This provider has no available slots in the booking window. Please go back and choose another provider.
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5"><FiCalendar className="text-[#E31E24]" /> Select date</p>
                    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                      {schedule.map((d) => {
                        const chip = formatDateChip(d.date);
                        const disabled = d.slots.length === 0;
                        const isSelected = selectedDate === d.date;
                        return (
                          <button
                            type="button"
                            key={d.date}
                            disabled={disabled}
                            title={d.unavailableReason || ''}
                            onClick={() => { setSelectedDate(d.date); setSelectedTimeSlot(''); }}
                            className={`flex-shrink-0 w-16 py-2 rounded-xl border text-center transition-all ${
                              isSelected
                                ? 'bg-[#E31E24] text-white border-[#E31E24] shadow-md'
                                : disabled
                                ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
                                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                            }`}>
                            <span className="block text-[10px] font-semibold">{chip.weekday}</span>
                            <span className="block text-base font-extrabold leading-tight">{chip.day}</span>
                            <span className="block text-[10px]">{disabled ? d.unavailableReason : chip.month}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {selectedDay && (
                    <div>
                      <p className="text-xs font-bold text-slate-800 mb-2 flex items-center justify-between">
                        <span className="flex items-center gap-1.5"><FiClock className="text-[#E31E24]" /> Select time slot</span>
                        <span className="text-[10px] text-slate-400 font-medium">{selectedDay.remainingCapacity} booking(s) left that day</span>
                      </p>
                      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 gap-2">
                        {selectedDay.slots.map((slot) => {
                          const isSelected = selectedTimeSlot === slot.label;
                          return (
                            <button
                              type="button"
                              key={slot.label}
                              onClick={() => setSelectedTimeSlot(slot.label)}
                              className={`px-2.5 py-2.5 rounded-xl border text-[11px] sm:text-xs font-bold text-center ${
                                isSelected ? 'bg-[#E31E24] text-white border-[#E31E24] shadow-md' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                              }`}>
                              {slot.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── PAYMENT ── */}
          {currentStep.id === 'payment' && (
            <form id="booking-final-form" onSubmit={handleSubmitBooking} className="space-y-4 animate-fadeIn">
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#E31E24]">Payment method</h4>
                {isCodOnly ? (
                  <div className="p-3 rounded-xl border border-red-200 bg-red-50 text-[#E31E24] flex items-center gap-3">
                    <FiDollarSign className="text-xl shrink-0" />
                    <div>
                      <p className="font-bold text-xs">Pay On Service (Cash / On-site UPI)</p>
                      <p className="text-[11px] text-slate-600 mt-0.5">You pay the provider after the service is completed.</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { id: 'cod', icon: FiDollarSign, title: 'Pay On Service', sub: 'Cash / On-site UPI' },
                      { id: 'upi', icon: FiCreditCard, title: 'UPI / Online', sub: 'Instant & Secure' },
                      { id: 'wallet', icon: FiShield, title: 'SafeFire Wallet', sub: walletBalance !== null ? formatINR(walletBalance) : 'Unavailable' },
                    ].map((m) => (
                      <button
                        type="button"
                        key={m.id}
                        disabled={m.id === 'wallet' && walletBalance === null}
                        onClick={() => setPaymentMethod(m.id)}
                        className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 disabled:opacity-50 ${
                          paymentMethod === m.id ? 'bg-red-50 text-[#E31E24] border-[#E31E24] ring-1 ring-[#E31E24]' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}>
                        <m.icon className="text-base" />
                        <span>{m.title}</span>
                        <span className="text-[10px] text-slate-400 font-normal">{m.sub}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-2 text-xs">
                <div className="flex justify-between text-slate-600"><span>Provider</span><span className="font-bold text-slate-900 text-right">{selectedVendor?.storeName}</span></div>
                {quote?.variant && (
                  <div className="flex justify-between text-slate-600"><span>{service.variantConfig?.label || 'Category Type'}</span><span className="font-bold text-slate-900">{quote.variant.label}</span></div>
                )}
                {quantityRules.enabled && (
                  <div className="flex justify-between text-slate-600"><span>{quantityRules.label}</span><span className="font-bold text-slate-900">{quantity} {quantityRules.unitLabel}(s)</span></div>
                )}
                <div className="flex justify-between text-slate-600 gap-3"><span>Address</span><span className="font-bold text-slate-900 text-right">{address.address}, {address.city} – {pincode}</span></div>
                <div className="flex justify-between text-slate-600"><span>Schedule</span><span className="font-bold text-slate-900">{formatLongDate(selectedDate)} · {selectedTimeSlot}</span></div>
                {quote && (
                  <div className="flex justify-between text-slate-900 font-extrabold pt-2 border-t border-slate-200 text-sm">
                    <span>{quote.isEstimate ? 'Estimated total' : 'Total payable'}</span>
                    <span className="text-[#E31E24] text-base">{formatINR(quote.total)}</span>
                  </div>
                )}
              </div>
            </form>
          )}
        </div>

        {/* Footer controls */}
        <div className="px-3 sm:px-6 py-3 bg-slate-50/90 backdrop-blur-sm border-t border-slate-200 flex items-center justify-between gap-2 flex-shrink-0">
          {stepIndex > 0 ? (
            <button
              type="button"
              onClick={goBack}
              className="px-3 sm:px-4 py-2.5 bg-white border border-slate-300 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-100 flex items-center gap-1.5">
              <FiArrowLeft /> <span>Back</span>
            </button>
          ) : (
            <div />
          )}

          {currentStep.id === 'payment' ? (
            <button
              type="submit"
              form="booking-final-form"
              disabled={isSubmitting}
              className="px-4 sm:px-6 py-2.5 bg-[#E31E24] hover:bg-[#c6151b] text-white font-bold rounded-xl text-xs shadow-lg shadow-[#E31E24]/30 flex items-center gap-2 disabled:opacity-50">
              {isSubmitting ? <><FiLoader className="animate-spin text-sm" /> Confirming…</> : <><FiCheck /> Confirm & Book</>}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleContinue}
              disabled={!canContinue() || isCheckingPincode}
              className="px-6 py-2.5 bg-[#E31E24] hover:bg-[#c6151b] text-white font-bold rounded-xl text-xs shadow-md shadow-[#E31E24]/20 flex items-center gap-2 disabled:opacity-50">
              {isCheckingPincode ? <FiLoader className="animate-spin" /> : null}
              <span>{currentStep.id === 'pincode' ? 'Check & Continue' : 'Continue'}</span>
              <FiArrowRight />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};

export default ServiceBookingWizard;
