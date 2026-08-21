import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiShield,
  FiMapPin,
  FiCheckCircle,
  FiXCircle,
  FiPhoneCall,
  FiCalendar,
  FiClock,
  FiUser,
  FiPhone,
  FiDollarSign,
  FiPlus,
  FiMinus,
  FiArrowRight,
  FiTool,
  FiLayers,
  FiCreditCard,
  FiCheck,
} from "react-icons/fi";
import toast from "react-hot-toast";
import MobileLayout from "../components/Layout/MobileLayout";
import PageTransition from "../../../shared/components/PageTransition";
import {
  getServiceBySlug,
  checkPincodeServiceability,
  createServiceBooking,
} from "../services/customerServiceApi";
import api from "../../../shared/utils/api";

const TIME_SLOTS = [
  "09:00 AM - 12:00 PM (Morning)",
  "12:00 PM - 03:00 PM (Afternoon)",
  "03:00 PM - 06:00 PM (Evening)",
];

const ServiceDetailPage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();

  const [service, setService] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Pincode & Serviceability State
  const [pincode, setPincode] = useState("");
  const [isCheckingPincode, setIsCheckingPincode] = useState(false);
  const [serviceability, setServiceability] = useState(null); // { available, vendors, message }

  // Booking Flow Selections
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [bookingDate, setBookingDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState(TIME_SLOTS[0]);
  const [customFieldValues, setCustomFieldValues] = useState({});

  // Address & Payment
  const [userAddresses, setUserAddresses] = useState([]);
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [showNewAddressForm, setShowNewAddressForm] = useState(false);
  const [newAddress, setNewAddress] = useState({
    fullName: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
  });

  const [paymentMethod, setPaymentMethod] = useState("cod");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch Service Details
  useEffect(() => {
    const fetchDetail = async () => {
      setIsLoading(true);
      try {
        const res = await getServiceBySlug(slug);
        const data = res?.data?.service || res?.service || null;
        setService(data);
      } catch (err) {
        toast.error("Failed to load service details");
      } finally {
        setIsLoading(false);
      }
    };
    fetchDetail();
  }, [slug]);

  // Fetch User Addresses if logged in
  useEffect(() => {
    const fetchAddresses = async () => {
      try {
        const res = await api.get("/user/addresses");
        const list = Array.isArray(res?.data?.addresses)
          ? res.data.addresses
          : Array.isArray(res?.data)
          ? res.data
          : [];
        setUserAddresses(list);
        if (list.length > 0) {
          const defaultAddr = list.find((a) => a.isDefault) || list[0];
          setSelectedAddress(defaultAddr);
          if (defaultAddr.zipCode && !pincode) {
            setPincode(defaultAddr.zipCode);
          }
        }
      } catch (err) {
        // Silently handle
      }
    };
    fetchAddresses();
  }, []);

  const handleCheckServiceability = async (e) => {
    if (e) e.preventDefault();
    if (!pincode || pincode.trim().length < 6) {
      toast.error("Please enter a valid 6-digit pincode.");
      return;
    }

    setIsCheckingPincode(true);
    setServiceability(null);
    setSelectedVendor(null);

    try {
      const res = await checkPincodeServiceability({
        serviceId: service._id,
        pincode: pincode.trim(),
      });
      const payload = res?.data || res || {};
      setServiceability(payload);

      if (payload.available && payload.vendors?.length > 0) {
        setSelectedVendor(payload.vendors[0]); // Default to first vendor
        toast.success(`Service available in pincode ${pincode}!`);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to check serviceability");
    } finally {
      setIsCheckingPincode(false);
    }
  };

  const handleCustomFieldChange = (key, val) => {
    setCustomFieldValues((prev) => ({ ...prev, [key]: val }));
  };

  const calculateTotals = () => {
    if (!selectedVendor) return { unitPrice: 0, subtotal: 0, tax: 0, total: 0 };
    let unitPrice = selectedVendor.price || 0;
    if (selectedVariant && selectedVariant.price) {
      unitPrice = selectedVariant.price;
    }
    const subtotal = unitPrice * quantity;
    const tax = Math.round(subtotal * 0.18 * 100) / 100;
    const total = subtotal + tax;
    return { unitPrice, subtotal, tax, total };
  };

  const handleConfirmBooking = async () => {
    if (!serviceability?.available || !selectedVendor) {
      toast.error("Please select an available vendor.");
      return;
    }
    if (!bookingDate) {
      toast.error("Please select a preferred service date.");
      return;
    }
    if (!selectedSlot) {
      toast.error("Please select a time slot.");
      return;
    }

    let finalAddress = selectedAddress;
    if (showNewAddressForm) {
      if (
        !newAddress.fullName ||
        !newAddress.phone ||
        !newAddress.address ||
        !newAddress.city ||
        !newAddress.zipCode
      ) {
        toast.error("Please fill in all address fields.");
        return;
      }
      finalAddress = newAddress;
    }

    if (!finalAddress || !finalAddress.address) {
      toast.error("Please select or add a service address.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        serviceId: service._id,
        vendorId: selectedVendor.vendorId,
        variant: selectedVariant || {},
        quantity,
        pincode: pincode.trim(),
        serviceAddress: {
          fullName: finalAddress.fullName || finalAddress.name,
          phone: finalAddress.phone,
          address: finalAddress.address,
          city: finalAddress.city,
          state: finalAddress.state || "State",
          zipCode: finalAddress.zipCode,
        },
        bookingDate,
        timeSlot: selectedSlot,
        customFields: customFieldValues,
        paymentMethod,
        notes,
      };

      const res = await createServiceBooking(payload);
      const bookingData = res?.data?.booking || res?.booking;

      toast.success("Service booking confirmed!");
      navigate(`/booking-success/${bookingData?._id || bookingData?.bookingId}`);
    } catch (err) {
      toast.error(
        err?.response?.data?.message || err?.message || "Failed to confirm service booking"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const { unitPrice, subtotal, tax, total } = calculateTotals();

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={false} showHeader={true}>
        <div className="min-h-[calc(100vh-60px)] bg-[#F8FAFC] text-slate-900 font-sans pb-24">
          <div className="max-w-4xl mx-auto px-4 py-4 sm:py-6 space-y-6">
            
            {isLoading ? (
              <div className="text-center py-20">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#E31E24] border-t-transparent mb-3"></div>
                <p className="text-slate-500 text-xs font-medium">Loading service details...</p>
              </div>
            ) : !service ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
                <FiXCircle className="mx-auto text-4xl text-red-500" />
                <h3 className="text-base font-bold text-slate-800">Service Not Found</h3>
                <button
                  onClick={() => navigate("/services")}
                  className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl"
                >
                  Back to Services Catalog
                </button>
              </div>
            ) : (
              <>
                {/* 1. HERO HEADER */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-start gap-4">
                  {service.image ? (
                    <img
                      src={service.image}
                      alt={service.name}
                      className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-2xl border border-slate-200 flex-shrink-0"
                    />
                  ) : (
                    <div className="w-20 h-20 sm:w-24 sm:h-24 bg-red-50 text-[#E31E24] rounded-2xl flex items-center justify-center font-bold text-3xl border border-red-100 flex-shrink-0">
                      <FiTool />
                    </div>
                  )}

                  <div className="space-y-2 flex-1">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-red-50 text-[#E31E24] text-[11px] font-extrabold rounded-full uppercase">
                      <FiLayers />
                      {service.categoryId?.name || "Fire Safety"}
                    </span>
                    <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 leading-tight">
                      {service.name}
                    </h1>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {service.description || service.shortDescription || "Certified service provided by verified marketplace vendors."}
                    </p>
                  </div>
                </div>

                {/* 2. PINCODE SERVICEABILITY CHECK CARD */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-red-50 text-[#E31E24] flex items-center justify-center font-bold text-sm">
                      <FiMapPin />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Check Pincode Serviceability</h3>
                      <p className="text-[11px] text-slate-500">Enter your 6-digit delivery/facility pincode to check vendor coverage.</p>
                    </div>
                  </div>

                  <form onSubmit={handleCheckServiceability} className="flex gap-2">
                    <input
                      type="text"
                      maxLength={6}
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
                      placeholder="e.g. 110001"
                      className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#E31E24]"
                    />
                    <button
                      type="submit"
                      disabled={isCheckingPincode}
                      className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-sm disabled:opacity-50"
                    >
                      {isCheckingPincode ? "Checking..." : "Check Availability"}
                    </button>
                  </form>

                  {/* Serviceability Result Banners */}
                  {serviceability && (
                    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
                      {!serviceability.available ? (
                        /* NOT AVAILABLE STATE */
                        <div className="p-4 bg-red-50 rounded-2xl border border-red-200 text-red-800 space-y-3">
                          <div className="flex items-start gap-3">
                            <FiXCircle className="text-xl text-red-600 flex-shrink-0 mt-0.5" />
                            <div>
                              <h4 className="text-xs font-bold text-red-900">Service Not Available in Your Area</h4>
                              <p className="text-xs text-red-700 mt-0.5 leading-relaxed">
                                {serviceability.message || `Currently no vendors offer "${service.name}" in pincode ${pincode}.`}
                              </p>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-red-200/60 flex items-center justify-between flex-wrap gap-2">
                            <span className="text-[11px] font-semibold text-red-800">Need emergency or custom installation?</span>
                            <a
                              href={`tel:${serviceability.supportPhone ? serviceability.supportPhone.replace(/\s+/g, '') : '+9118001234567'}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-xl hover:bg-red-700 transition-colors shadow-xs"
                            >
                              <FiPhoneCall />
                              <span>Call Support {serviceability.supportPhone ? `(${serviceability.supportPhone})` : ''}</span>
                            </a>
                          </div>
                        </div>
                      ) : (
                        /* AVAILABLE STATE */
                        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
                          <FiCheckCircle className="text-emerald-600 text-base" />
                          <span>Service is AVAILABLE in pincode {pincode}! Select vendor and date below.</span>
                        </div>
                      )}
                    </motion.div>
                  )}
                </div>

                {/* 3. STEP-BY-STEP BOOKING FLOW (ACTIVE ONLY IF AVAILABLE) */}
                {serviceability?.available && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    {/* STEP A: SELECT VENDOR */}
                    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
                      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                        <FiUser className="text-[#E31E24]" />
                        1. Select Servicing Vendor ({serviceability.vendors.length} Available)
                      </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {serviceability.vendors.map((v) => (
                          <div
                            key={v.vendorServiceId}
                            onClick={() => setSelectedVendor(v)}
                            className={`p-4 rounded-2xl border-2 transition-all cursor-pointer space-y-2 ${
                              selectedVendor?.vendorServiceId === v.vendorServiceId
                                ? "border-[#E31E24] bg-red-50/40 ring-2 ring-[#E31E24]/10"
                                : "border-slate-200 bg-white hover:border-slate-300"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900 text-sm">{v.storeName}</span>
                              <span className="text-[11px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
                                ★ {v.rating}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                              <span className="text-slate-500">Service Rate:</span>
                              <span className="font-extrabold text-[#E31E24] text-sm">₹{v.price}</span>
                            </div>

                            <div className="text-[11px] text-slate-500 flex items-center gap-1">
                              <FiClock className="text-slate-400" />
                              <span>Working Hours: {v.workingHours?.start} - {v.workingHours?.end}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* STEP B: QUANTITY */}
                    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
                      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                        <FiTool className="text-[#E31E24]" />
                        2. Service Quantity
                      </h3>

                      <div className="flex items-center gap-4">
                        <span className="text-xs font-semibold text-slate-700">Number of Units/Equipment:</span>
                        <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-xl">
                          <button
                            type="button"
                            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                            className="w-7 h-7 bg-white rounded-lg flex items-center justify-center text-slate-700 shadow-xs"
                          >
                            <FiMinus />
                          </button>
                          <span className="font-extrabold text-sm text-slate-900 px-2">{quantity}</span>
                          <button
                            type="button"
                            onClick={() => setQuantity((q) => q + 1)}
                            className="w-7 h-7 bg-white rounded-lg flex items-center justify-center text-slate-700 shadow-xs"
                          >
                            <FiPlus />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* STEP C: DATE & TIME SLOT */}
                    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
                      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                        <FiCalendar className="text-[#E31E24]" />
                        3. Schedule Date & Time Slot
                      </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Preferred Date *</label>
                          <input
                            type="date"
                            min={new Date().toISOString().split("T")[0]}
                            value={bookingDate}
                            onChange={(e) => setBookingDate(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E31E24]"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Preferred Time Slot *</label>
                          <select
                            value={selectedSlot}
                            onChange={(e) => setSelectedSlot(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E31E24]"
                          >
                            {TIME_SLOTS.map((slot) => (
                              <option key={slot} value={slot}>
                                {slot}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* STEP D: SERVICE ADDRESS */}
                    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                          <FiMapPin className="text-[#E31E24]" />
                          4. Service Location Address
                        </h3>
                        <button
                          type="button"
                          onClick={() => setShowNewAddressForm(!showNewAddressForm)}
                          className="text-xs font-bold text-[#E31E24] hover:underline"
                        >
                          {showNewAddressForm ? "Select Saved Address" : "+ Add New Address"}
                        </button>
                      </div>

                      {showNewAddressForm ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
                          <div>
                            <label className="block font-semibold text-slate-600 mb-1">Full Name *</label>
                            <input
                              type="text"
                              value={newAddress.fullName}
                              onChange={(e) => setNewAddress({ ...newAddress, fullName: e.target.value })}
                              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs"
                            />
                          </div>
                          <div>
                            <label className="block font-semibold text-slate-600 mb-1">Phone Number *</label>
                            <input
                              type="tel"
                              value={newAddress.phone}
                              onChange={(e) => setNewAddress({ ...newAddress, phone: e.target.value })}
                              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block font-semibold text-slate-600 mb-1">Full Address / Facility *</label>
                            <input
                              type="text"
                              value={newAddress.address}
                              onChange={(e) => setNewAddress({ ...newAddress, address: e.target.value })}
                              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs"
                            />
                          </div>
                          <div>
                            <label className="block font-semibold text-slate-600 mb-1">City *</label>
                            <input
                              type="text"
                              value={newAddress.city}
                              onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
                              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs"
                            />
                          </div>
                          <div>
                            <label className="block font-semibold text-slate-600 mb-1">Pincode *</label>
                            <input
                              type="text"
                              value={newAddress.zipCode}
                              onChange={(e) => setNewAddress({ ...newAddress, zipCode: e.target.value })}
                              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs"
                            />
                          </div>
                        </div>
                      ) : userAddresses.length === 0 ? (
                        <p className="text-xs text-slate-500">
                          No saved address found. Click "+ Add New Address" above to enter service location.
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {userAddresses.map((addr) => (
                            <div
                              key={addr._id || addr.id}
                              onClick={() => setSelectedAddress(addr)}
                              className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                                selectedAddress?._id === addr._id
                                  ? "border-[#E31E24] bg-red-50/40"
                                  : "border-slate-200 bg-white"
                              }`}
                            >
                              <p className="font-bold text-slate-900 text-xs">{addr.fullName || addr.name}</p>
                              <p className="text-[11px] text-slate-600 line-clamp-1">{addr.address}, {addr.city}</p>
                              <p className="text-[10px] text-slate-500 font-semibold mt-1">Pincode: {addr.zipCode} | Ph: {addr.phone}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* STEP E: DYNAMIC CUSTOM SERVICE FIELDS (IF ANY) */}
                    {service.serviceFields && service.serviceFields.length > 0 && (
                      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                          <FiTool className="text-[#E31E24]" />
                          5. Additional Service Specifications
                        </h3>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {service.serviceFields.map((field) => (
                            <div key={field.key}>
                              <label className="block text-xs font-semibold text-slate-600 mb-1">
                                {field.label} {field.required && "*"}
                              </label>
                              <input
                                type={field.type === "NUMBER" ? "number" : "text"}
                                placeholder={field.placeholder || ""}
                                value={customFieldValues[field.key] || ""}
                                onChange={(e) => handleCustomFieldChange(field.key, e.target.value)}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E31E24]"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* STEP F: BOOKING SUMMARY & PAYMENT */}
                    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
                      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                        <FiCreditCard className="text-[#E31E24]" />
                        6. Booking Summary & Payment
                      </h3>

                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
                        <div className="flex justify-between text-slate-600">
                          <span>Service Rate (₹{unitPrice} x {quantity} unit):</span>
                          <span className="font-bold text-slate-800">₹{subtotal}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>Estimated GST (18%):</span>
                          <span className="font-bold text-slate-800">₹{tax}</span>
                        </div>
                        <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-extrabold text-slate-900">
                          <span>Total Amount Payable:</span>
                          <span className="text-[#E31E24] text-base">₹{total}</span>
                        </div>
                      </div>

                      {/* Payment Option */}
                      <div className="space-y-2">
                        <label className="block text-xs font-semibold text-slate-600">Payment Mode</label>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setPaymentMethod("cod")}
                            className={`p-3 rounded-xl border-2 text-xs font-bold transition-all ${
                              paymentMethod === "cod"
                                ? "border-[#E31E24] bg-red-50/50 text-[#E31E24]"
                                : "border-slate-200 bg-white text-slate-700"
                            }`}
                          >
                            Pay After Service (COD)
                          </button>
                          <button
                            type="button"
                            onClick={() => setPaymentMethod("online")}
                            className={`p-3 rounded-xl border-2 text-xs font-bold transition-all ${
                              paymentMethod === "online"
                                ? "border-[#E31E24] bg-red-50/50 text-[#E31E24]"
                                : "border-slate-200 bg-white text-slate-700"
                            }`}
                          >
                            Online Payment
                          </button>
                        </div>
                      </div>

                      {/* Confirm Booking Action */}
                      <button
                        type="button"
                        onClick={handleConfirmBooking}
                        disabled={isSubmitting}
                        className="w-full py-3.5 bg-[#E31E24] hover:bg-[#c6151b] text-white font-extrabold text-sm rounded-xl transition-all shadow-md shadow-[#E31E24]/20 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-98"
                      >
                        {isSubmitting ? (
                          <span>Confirming Booking...</span>
                        ) : (
                          <>
                            <FiCheck className="text-base" />
                            <span>Confirm & Book Service Now (₹{total})</span>
                          </>
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}
              </>
            )}
          </div>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default ServiceDetailPage;
