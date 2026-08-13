import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiShield,
  FiRotateCw,
  FiSearch,
  FiCalendar,
  FiPhoneCall,
  FiCheck,
  FiX,
  FiArrowRight,
  FiUser,
  FiPhone,
  FiMapPin,
  FiSend,
} from "react-icons/fi";
import toast from "react-hot-toast";
import MobileLayout from "../components/Layout/MobileLayout";
import PageTransition from "../../../shared/components/PageTransition";

const SERVICES_DATA = [
  {
    id: "refill",
    title: "Fire Extinguisher Refill & Recharge",
    icon: FiRotateCw,
    badge: null,
    shortDesc: "Professional refill and pressure inspection for ABC, CO₂, foam and water-based extinguishers.",
    price: "Starting from ₹499",
    buttonText: "Book Refill",
    isFeatured: false,
    features: ["Inspection", "Refill", "Pressure Check"],
  },
  {
    id: "amc",
    title: "Annual Maintenance Contract",
    icon: FiShield,
    badge: "MOST POPULAR",
    shortDesc: "Keep your fire protection equipment inspected and maintained throughout the year.",
    price: "Get a Quote",
    buttonText: "Explore AMC",
    isFeatured: true,
    features: ["Scheduled Inspection", "Equipment Maintenance", "Service History"],
  },
  {
    id: "inspection",
    title: "Fire Safety Inspection",
    icon: FiSearch,
    badge: null,
    shortDesc: "Professional inspection of fire extinguishers and essential safety equipment.",
    price: "Starting from ₹1,999",
    buttonText: "Book Inspection",
    isFeatured: false,
    features: ["Equipment Check", "Safety Recommendations", "Inspection Report"],
  },
];

const ServicesPage = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    serviceType: "Fire Extinguisher Refill & Recharge",
    address: "",
    date: "",
    notes: "",
  });

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isModalOpen]);

  const handleOpenBookingModal = (serviceTitle = null) => {
    if (serviceTitle) {
      setFormData((prev) => ({ ...prev, serviceType: serviceTitle }));
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleSubmitBooking = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.phone || !formData.address) {
      toast.error("Please fill in your name, phone number, and address.");
      return;
    }

    toast.success(
      `Service Booking Submitted! Our fire safety expert will contact you at ${formData.phone} shortly.`,
      { duration: 5000 }
    );
    setIsModalOpen(false);
    setFormData({
      name: "",
      phone: "",
      serviceType: "Fire Extinguisher Refill & Recharge",
      address: "",
      date: "",
      notes: "",
    });
  };

  return (
    <>
      <PageTransition>
        <MobileLayout showBottomNav={true} showCartBar={false} showHeader={true}>
          <div className="min-h-[calc(100vh-60px)] bg-[#F8FAFC] text-slate-900 font-sans pb-16">
            <div className="max-w-5xl mx-auto px-4 py-4 sm:py-6 space-y-6">
              
              {/* 1. HERO BANNER */}
              <section className="bg-[#0F172A] text-white rounded-2xl md:rounded-3xl p-5 sm:p-7 md:p-8 relative overflow-hidden shadow-lg border border-slate-800">
                {/* Subtle Red Ambient Glow */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#E31E24]/15 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#E31E24]/10 rounded-full blur-2xl pointer-events-none" />

                <div className="max-w-xl space-y-3 relative z-10">
                  {/* Small Badge */}
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-500/20 border border-red-500/30 rounded-full text-red-400 text-[11px] font-bold uppercase tracking-wider">
                    <FiShield className="text-xs" />
                    <span>PROFESSIONAL FIRE SAFETY SERVICES</span>
                  </div>

                  {/* Heading */}
                  <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white leading-tight tracking-tight">
                    Protect Your Equipment. <br className="hidden sm:block" />
                    Stay Prepared.
                  </h1>

                  {/* Description */}
                  <p className="text-slate-300 text-xs sm:text-sm leading-relaxed max-w-lg">
                    Reliable fire extinguisher maintenance and inspection services for homes, offices and businesses.
                  </p>

                  {/* Buttons */}
                  <div className="pt-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenBookingModal()}
                      className="px-6 py-2.5 bg-[#E31E24] hover:bg-[#c6151b] active:scale-95 text-white font-bold rounded-xl text-xs sm:text-sm shadow-md shadow-[#E31E24]/25 transition-all inline-flex items-center gap-1.5"
                    >
                      <FiCalendar className="text-xs sm:text-sm" />
                      <span>Book a Service</span>
                    </button>
                  </div>
                </div>
              </section>

              {/* 2. SERVICES SECTION */}
              <section className="space-y-4 pt-1">
                <div className="text-center sm:text-left">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#E31E24]">
                    OUR SERVICES
                  </span>
                  <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900 mt-0.5">
                    Fire Safety Services
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                    Professional service when you need it.
                  </p>
                </div>

                {/* 3 Service Cards (Responsive 1 Col on Mobile, 3 Col on Desktop) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
                  {SERVICES_DATA.map((service) => {
                    const IconComponent = service.icon;
                    return (
                      <motion.div
                        key={service.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`bg-white rounded-2xl p-5 transition-all flex flex-col justify-between relative overflow-hidden ${
                          service.isFeatured
                            ? "border-2 border-[#E31E24] shadow-md shadow-[#E31E24]/10 ring-1 ring-[#E31E24]/10"
                            : "border border-slate-200/80 shadow-sm hover:shadow-md hover:border-slate-300"
                        }`}
                      >
                        {/* Top Details */}
                        <div>
                          {/* Header with Icon & Badge */}
                          <div className="flex items-center justify-between gap-2 mb-3">
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center text-base ${
                                service.isFeatured
                                  ? "bg-[#E31E24] text-white shadow-sm shadow-[#E31E24]/20"
                                  : "bg-red-50 text-[#E31E24]"
                              }`}
                            >
                              <IconComponent />
                            </div>

                            {service.badge && (
                              <span className="px-2.5 py-0.5 bg-[#E31E24] text-white text-[10px] font-extrabold rounded-full tracking-wider uppercase shadow-xs">
                                {service.badge}
                              </span>
                            )}
                          </div>

                          {/* Title */}
                          <h3 className="text-sm sm:text-base font-bold leading-snug mb-1.5 text-slate-900">
                            {service.title}
                          </h3>

                          {/* Short Description */}
                          <p className="text-xs leading-relaxed mb-3.5 text-slate-600">
                            {service.shortDesc}
                          </p>

                          {/* Features */}
                          <div className="space-y-1.5 mb-4 border-t pt-3 border-dashed border-slate-200">
                            {service.features.map((feature, idx) => (
                              <div key={idx} className="flex items-center gap-1.5 text-xs">
                                <FiCheck className="text-xs shrink-0 text-[#E31E24] font-bold" />
                                <span className="text-slate-700 font-medium">
                                  {feature}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Bottom Price & Button */}
                        <div className="pt-2 border-t border-slate-100">
                          <div className="mb-2.5">
                            <span className="text-sm font-extrabold block text-slate-900">
                              {service.price}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleOpenBookingModal(service.title)}
                            className={`w-full py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 active:scale-98 ${
                              service.isFeatured
                                ? "bg-[#E31E24] hover:bg-[#c6151b] text-white shadow-md shadow-[#E31E24]/20"
                                : "bg-slate-900 hover:bg-slate-800 text-white"
                            }`}
                          >
                            <span>{service.buttonText}</span>
                            <FiArrowRight className="text-xs" />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </section>

            </div>
          </div>
        </MobileLayout>
      </PageTransition>

      {/* 3. BOOKING MODAL (Rendered in React Portal to guarantee exact viewport centering) */}
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {isModalOpen && (
            <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 sm:p-6">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={handleCloseModal}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              />

              {/* Centered Modal Card */}
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 10 }}
                transition={{ type: "spring", damping: 25, stiffness: 350 }}
                className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl border border-slate-100 relative z-10 max-h-[90vh] overflow-y-auto"
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3.5">
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-slate-900">
                      Book Fire Safety Service
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Certified technician will visit your location
                    </p>
                  </div>
                  <button
                    onClick={handleCloseModal}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
                  >
                    <FiX size={18} />
                  </button>
                </div>

                <form onSubmit={handleSubmitBooking} className="space-y-3">
                  {/* Service Type */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1 uppercase tracking-wider">
                      Service Required
                    </label>
                    <select
                      value={formData.serviceType}
                      onChange={(e) =>
                        setFormData({ ...formData, serviceType: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:border-[#E31E24] focus:ring-2 focus:ring-[#E31E24]/10 focus:outline-none bg-slate-50 text-slate-900"
                    >
                      <option value="Fire Extinguisher Refill & Recharge">
                        Fire Extinguisher Refill & Recharge
                      </option>
                      <option value="Annual Maintenance Contract">
                        Annual Maintenance Contract (AMC)
                      </option>
                      <option value="Fire Safety Inspection">
                        Fire Safety Inspection
                      </option>
                    </select>
                  </div>

                  {/* Full Name */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1 uppercase tracking-wider">
                      Full Name *
                    </label>
                    <div className="relative">
                      <FiUser className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
                      <input
                        type="text"
                        required
                        placeholder="Your full name"
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#E31E24] focus:ring-2 focus:ring-[#E31E24]/10 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Phone Number */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1 uppercase tracking-wider">
                      Contact Phone *
                    </label>
                    <div className="relative">
                      <FiPhone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
                      <input
                        type="tel"
                        required
                        placeholder="+91 98765 43210"
                        value={formData.phone}
                        onChange={(e) =>
                          setFormData({ ...formData, phone: e.target.value })
                        }
                        className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#E31E24] focus:ring-2 focus:ring-[#E31E24]/10 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Location Address */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1 uppercase tracking-wider">
                      Service Address / Facility Location *
                    </label>
                    <div className="relative">
                      <FiMapPin className="absolute left-3 top-2.5 text-slate-400 text-xs" />
                      <textarea
                        required
                        rows={2}
                        placeholder="Office/Home address, city, pincode"
                        value={formData.address}
                        onChange={(e) =>
                          setFormData({ ...formData, address: e.target.value })
                        }
                        className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#E31E24] focus:ring-2 focus:ring-[#E31E24]/10 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Preferred Date */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1 uppercase tracking-wider">
                      Preferred Date (Optional)
                    </label>
                    <div className="relative">
                      <FiCalendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
                      <input
                        type="date"
                        value={formData.date}
                        onChange={(e) =>
                          setFormData({ ...formData, date: e.target.value })
                        }
                        className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#E31E24] focus:ring-2 focus:ring-[#E31E24]/10 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Additional Notes */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1 uppercase tracking-wider">
                      Equipment Notes (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 4 ABC extinguishers (6kg), 1 CO₂ (4.5kg)"
                      value={formData.notes}
                      onChange={(e) =>
                        setFormData({ ...formData, notes: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#E31E24] focus:ring-2 focus:ring-[#E31E24]/10 focus:outline-none"
                    />
                  </div>

                  {/* Actions */}
                  <div className="pt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className="flex-1 py-2 border border-slate-200 text-slate-700 font-semibold rounded-xl text-xs hover:bg-slate-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-2 bg-[#E31E24] hover:bg-[#c6151b] active:scale-98 text-white font-bold rounded-xl text-xs shadow-md shadow-[#E31E24]/20 transition-all flex items-center justify-center gap-1.5"
                    >
                      <FiSend />
                      <span>Confirm Booking</span>
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};

export default ServicesPage;
