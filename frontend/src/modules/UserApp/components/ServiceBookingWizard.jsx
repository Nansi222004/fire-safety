import React, { useState, useEffect } from 'react';
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
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { checkServiceability, createBooking } from '../services/customerServiceApi';

const ServiceBookingWizard = ({ isOpen, onClose, service }) => {
  const navigate = useNavigate();

  // Multi-step Wizard State
  const [step, setStep] = useState(1); // 1: Pincode, 2: Provider, 3: Slot, 4: Details, 5: Address/Payment

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
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (service) {
      setStep(1);
      setPincode('452001');
      setServiceabilityResult(null);
      setSelectedVendor(null);
      
      // Default tomorrow date
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setSelectedDate(tomorrow.toISOString().split('T')[0]);
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
    if (!pincode || !/^\d{6}$/.test(pincode.trim())) {
      toast.error('Please enter a valid 6-digit postal pincode.');
      return;
    }

    setIsCheckingPincode(true);
    try {
      const res = await checkServiceability({
        serviceId: service._id || service.id,
        pincode: pincode.trim(),
      });

      const data = res?.data ?? res ?? {};
      setServiceabilityResult(data);

      if (data.available && Array.isArray(data.vendors) && data.vendors.length > 0) {
        toast.success(`Found ${data.vendors.length} certified provider(s) for pincode ${pincode}`);
        setStep(2);
      } else {
        toast.error(data.message || `No service providers available in pincode ${pincode}`);
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

  // Calculate pricing
  const calculateTotal = () => {
    const unitPrice = selectedVendor?.price || service.price || 499;
    const qty = Math.max(1, Number(customFieldValues.quantity || customFieldValues.number_of_units || 1));
    const subtotal = unitPrice * qty;
    const tax = 0; // Configured tax fallback
    const total = subtotal + tax;
    return { unitPrice, qty, subtotal, tax, total };
  };

  const { unitPrice, qty, subtotal, tax, total } = calculateTotal();

  // SUBMIT BOOKING
  const handleSubmitBooking = async (e) => {
    e.preventDefault();

    if (!address.fullName.trim() || !address.phone.trim() || !address.address.trim()) {
      toast.error('Please fill in your full name, phone number, and service address.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        serviceId: service._id || service.id,
        vendorId: selectedVendor.vendorId,
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

      toast.success('Service Booking Created Successfully! 🎉');
      onClose();

      if (createdBooking?.bookingId || createdBooking?._id) {
        navigate(`/booking-success/${createdBooking._id || createdBooking.bookingId}`);
      } else {
        navigate('/customer/my-bookings');
      }
    } catch (err) {
      console.error('Booking submission error:', err);
      toast.error(err.message || 'Failed to submit service booking.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#0F172A] text-white flex items-center justify-between border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-[10px] font-bold rounded-full uppercase">
                Step {step} of 5
              </span>
              <span className="text-slate-400 text-xs font-medium">• {service.name}</span>
            </div>
            <h3 className="text-base sm:text-lg font-extrabold text-white leading-tight mt-0.5">
              {step === 1 && 'Check Pincode Serviceability'}
              {step === 2 && 'Select Service Provider'}
              {step === 3 && 'Select Appointment Date & Slot'}
              {step === 4 && 'Service Specific Details'}
              {step === 5 && 'Address & Payment Options'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
          >
            <FiX className="text-lg" />
          </button>
        </div>

        {/* Wizard Body Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* STEP 1: PINCODE CHECK */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="p-4 bg-red-50/50 border border-red-100 rounded-xl flex items-start gap-3">
                <FiMapPin className="text-[#E31E24] text-xl mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Enter Delivery / Site Pincode</h4>
                  <p className="text-[11px] text-slate-600 leading-relaxed mt-0.5">
                    We will find verified, certified vendors who directly serve your area pincode.
                  </p>
                </div>
              </div>

              <form onSubmit={handleCheckPincode} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">Postal Pincode</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={6}
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value)}
                      placeholder="e.g. 452001"
                      className="flex-1 px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:border-[#E31E24]"
                    />
                    <button
                      type="submit"
                      disabled={isCheckingPincode}
                      className="px-6 py-3 bg-[#E31E24] hover:bg-[#c6151b] text-white font-bold text-xs rounded-xl transition-all shadow-sm shadow-[#E31E24]/20 flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isCheckingPincode ? 'Checking...' : 'Check Availability'}
                    </button>
                  </div>
                </div>
              </form>

              {/* Serviceability Result Feedback */}
              {serviceabilityResult && !serviceabilityResult.available && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold">
                    <FiAlertCircle className="text-amber-600 text-base" />
                    <span>Service Not Available in Pincode {pincode}</span>
                  </div>
                  <p className="text-amber-800 text-[11px] leading-relaxed">
                    {serviceabilityResult.message || 'No active service providers currently serve this pincode.'}
                  </p>
                  {serviceabilityResult.supportPhone && (
                    <p className="text-[11px] font-bold text-amber-900 pt-1">
                      Call Support for Enterprise Assistance: {serviceabilityResult.supportPhone}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: CHOOSE VENDOR */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">Available Providers in Pincode {pincode}:</span>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs text-[#E31E24] font-bold hover:underline"
                >
                  Change Pincode
                </button>
              </div>

              {serviceabilityResult?.vendors?.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-xl text-xs text-slate-500">
                  No providers available for pincode {pincode}.
                </div>
              ) : (
                <div className="space-y-3">
                  {serviceabilityResult?.vendors?.map((v) => (
                    <div
                      key={v.vendorId}
                      onClick={() => setSelectedVendor(v)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        selectedVendor?.vendorId === v.vendorId
                          ? 'bg-red-50/60 border-[#E31E24] shadow-sm'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-slate-900">{v.storeName}</h4>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold rounded-md">
                            <FiStar className="fill-amber-400 text-amber-400" />
                            {v.rating || 4.8}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 font-bold">
                          Starting Price: ₹{v.price || 499}
                        </p>
                        <p className="text-[11px] text-slate-500 flex items-center gap-1">
                          <FiClock className="text-slate-400" />
                          Hours: {v.workingHours?.start || '09:00'} - {v.workingHours?.end || '18:00'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <div
                          className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                            selectedVendor?.vendorId === v.vendorId
                              ? 'bg-[#E31E24] border-[#E31E24] text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {selectedVendor?.vendorId === v.vendorId && <FiCheck className="text-xs stroke-[3]" />}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 3: DATE & TIME SLOT */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
                  <FiCalendar className="text-[#E31E24]" />
                  <span>Select Preferred Date</span>
                </label>
                <input
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-[#E31E24]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
                  <FiClock className="text-[#E31E24]" />
                  <span>Select Time Slot</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {generateSlots().map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setSelectedTimeSlot(slot)}
                      className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center ${
                        selectedTimeSlot === slot
                          ? 'bg-[#E31E24] text-white border-[#E31E24] shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: DYNAMIC SERVICE FIELDS */}
          {step === 4 && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600 font-medium">
                Please answer the required service specifications for accurate technician dispatch:
              </p>

              {Array.isArray(service.serviceFields) && service.serviceFields.length > 0 ? (
                service.serviceFields.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-800">
                      {field.label} {field.required && <span className="text-red-500">*</span>}
                    </label>

                    {field.type === 'SELECT' ? (
                      <select
                        value={customFieldValues[field.key] || ''}
                        onChange={(e) =>
                          setCustomFieldValues({ ...customFieldValues, [field.key]: e.target.value })
                        }
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-[#E31E24]"
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
                        className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-[#E31E24]"
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
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-[#E31E24]"
                      />
                    )}
                  </div>
                ))
              ) : (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
                  Standard service specs apply. Click next to proceed.
                </div>
              )}
            </div>
          )}

          {/* STEP 5: ADDRESS & PAYMENT */}
          {step === 5 && (
            <form id="booking-final-form" onSubmit={handleSubmitBooking} className="space-y-4">
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider text-[#E31E24]">
                  Site Address Details
                </h4>

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
                      type="text"
                      value={address.phone}
                      onChange={(e) => setAddress({ ...address, phone: e.target.value })}
                      placeholder="e.g. +91 98765 43210"
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
                    placeholder="Flat / Floor / Building name, Street area..."
                    required
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-[#E31E24]"
                  />
                </div>
              </div>

              {/* Payment Method */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider text-[#E31E24]">
                  Payment Method
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cod')}
                    className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                      paymentMethod === 'cod'
                        ? 'bg-red-50 text-[#E31E24] border-[#E31E24]'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    <FiDollarSign />
                    <span>Pay on Service (COD)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('upi')}
                    className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                      paymentMethod === 'upi'
                        ? 'bg-red-50 text-[#E31E24] border-[#E31E24]'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    <FiCreditCard />
                    <span>UPI / Online Payment</span>
                  </button>
                </div>
              </div>

              {/* Summary Card */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Selected Provider:</span>
                  <span className="font-bold text-slate-900">{selectedVendor?.storeName}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Rate per unit:</span>
                  <span className="font-bold text-slate-900">₹{unitPrice} × {qty}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Date & Slot:</span>
                  <span className="font-bold text-slate-900">{selectedDate} ({selectedTimeSlot})</span>
                </div>
                <div className="flex justify-between text-slate-900 font-extrabold pt-2 border-t border-slate-200 text-sm">
                  <span>Total Amount Payable:</span>
                  <span className="text-[#E31E24]">₹{total}</span>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Wizard Footer Controls */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="px-4 py-2.5 bg-white border border-slate-300 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-100 transition-all flex items-center gap-1.5"
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
              disabled={isCheckingPincode}
              className="px-6 py-2.5 bg-[#E31E24] hover:bg-[#c6151b] text-white font-bold rounded-xl text-xs transition-all shadow-sm shadow-[#E31E24]/20 flex items-center gap-1.5 disabled:opacity-50"
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
              className="px-6 py-2.5 bg-[#E31E24] hover:bg-[#c6151b] text-white font-bold rounded-xl text-xs transition-all shadow-sm shadow-[#E31E24]/20 flex items-center gap-1.5 disabled:opacity-50"
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
              className="px-6 py-2.5 bg-[#E31E24] hover:bg-[#c6151b] text-white font-bold rounded-xl text-xs transition-all shadow-sm shadow-[#E31E24]/20 flex items-center gap-1.5 disabled:opacity-50"
            >
              <span>Continue to Details</span>
              <FiArrowRight />
            </button>
          )}

          {step === 4 && (
            <button
              type="button"
              onClick={() => setStep(5)}
              className="px-6 py-2.5 bg-[#E31E24] hover:bg-[#c6151b] text-white font-bold rounded-xl text-xs transition-all shadow-sm shadow-[#E31E24]/20 flex items-center gap-1.5"
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
              className="px-6 py-2.5 bg-[#E31E24] hover:bg-[#c6151b] text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-[#E31E24]/30 flex items-center gap-1.5 disabled:opacity-50"
            >
              <FiCheck />
              <span>{isSubmitting ? 'Confirming Booking...' : 'Confirm & Book Service'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ServiceBookingWizard;
