import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiArrowLeft,
  FiTool,
  FiCalendar,
  FiClock,
  FiMapPin,
  FiPhone,
  FiMail,
  FiUser,
  FiCheckCircle,
  FiXCircle,
  FiAlertCircle,
  FiCreditCard,
  FiShield,
  FiRefreshCw,
  FiStar,
  FiX,
  FiCheck,
  FiDollarSign,
  FiLayers,
} from "react-icons/fi";
import toast from "react-hot-toast";
import MobileLayout from "../components/Layout/MobileLayout";
import PageTransition from "../../../shared/components/PageTransition";
import {
  getServiceBookingById,
  cancelServiceBooking,
  addServiceReview,
} from "../services/customerServiceApi";

const ServiceBookingDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [booking, setBooking] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Cancellation Modal State
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  // Review Modal State
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const fetchBooking = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await getServiceBookingById(id);
      const data = res?.booking || res?.data?.booking || (res?._id ? res : null);
      if (!data) {
        throw new Error("Booking not found or has been moved.");
      }
      setBooking(data);
    } catch (err) {
      console.error("Failed to load service booking:", err);
      setError(err?.message || "Unable to load service booking details.");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchBooking();
  }, [fetchBooking]);

  const handleCancelBooking = async (e) => {
    e.preventDefault();
    if (!cancelReason.trim()) {
      toast.error("Please provide a cancellation reason.");
      return;
    }

    setIsCancelling(true);
    try {
      await cancelServiceBooking(booking._id || booking.bookingId, cancelReason.trim());
      toast.success("Service booking cancelled successfully.");
      setShowCancelModal(false);
      fetchBooking();
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to cancel service booking");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    setIsSubmittingReview(true);
    try {
      await addServiceReview(booking._id || booking.bookingId, { rating, reviewText: reviewText.trim() });
      toast.success("Thank you! Service review submitted successfully. ⭐");
      setShowReviewModal(false);
      fetchBooking();
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to submit review");
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "completed":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <FiCheckCircle className="text-emerald-600" />
            <span>COMPLETED</span>
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-red-50 text-red-700 border border-red-200">
            <FiXCircle className="text-red-600" />
            <span>CANCELLED</span>
          </span>
        );
      case "in_progress":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-amber-50 text-amber-700 border border-amber-200">
            <FiTool className="text-amber-600" />
            <span>IN PROGRESS</span>
          </span>
        );
      case "assigned":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <FiUser className="text-indigo-600" />
            <span>TECHNICIAN ASSIGNED</span>
          </span>
        );
      case "confirmed":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-blue-50 text-blue-700 border border-blue-200">
            <FiCheck className="text-blue-600 stroke-[3]" />
            <span>CONFIRMED</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-slate-100 text-slate-700 border border-slate-300">
            <FiClock className="text-slate-500" />
            <span>PENDING</span>
          </span>
        );
    }
  };

  const getPaymentStatusBadge = (status) => {
    switch (status) {
      case "paid":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
            <FiCheckCircle />
            <span>Paid</span>
          </span>
        );
      case "refunded":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-purple-50 text-purple-700 border border-purple-200 uppercase">
            <FiShield />
            <span>Refunded to Wallet</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200 uppercase">
            <FiClock />
            <span>Pay on Service (Pending)</span>
          </span>
        );
    }
  };

  // Timeline workflow step order
  const workflowSteps = [
    { key: "pending", label: "Booking Received" },
    { key: "confirmed", label: "Confirmed" },
    { key: "in_progress", label: "Technician Dispatched" },
    { key: "completed", label: "Service Completed" },
  ];

  const getStepIndex = (status) => {
    if (status === "cancelled") return -1;
    if (status === "completed") return 3;
    if (status === "in_progress" || status === "assigned") return 2;
    if (status === "confirmed") return 1;
    return 0;
  };

  const canCancel = booking && booking.status !== "completed" && booking.status !== "cancelled";

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={false} showHeader={true}>
        <div className="min-h-[calc(100vh-60px)] bg-[#F8FAFC] text-slate-900 font-sans pb-24">
          <div className="max-w-3xl mx-auto px-4 py-4 sm:py-6 space-y-5">
            {/* Top Navigation Bar */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => navigate("/my-service-bookings")}
                className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 hover:text-[#E31E24] transition-colors py-1 px-2 rounded-lg hover:bg-slate-100"
              >
                <FiArrowLeft className="text-sm" />
                <span>Back to My Service Bookings</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchBooking}
                  className="p-2 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-2xs"
                  title="Refresh booking"
                >
                  <FiRefreshCw className={`text-xs ${isLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            {/* Loading State */}
            {isLoading && (
              <div className="bg-white rounded-3xl p-12 border border-slate-200 shadow-sm text-center space-y-3">
                <div className="inline-block animate-spin rounded-full h-9 w-9 border-4 border-[#E31E24] border-t-transparent"></div>
                <p className="text-xs font-semibold text-slate-500">Loading service booking #{id}...</p>
              </div>
            )}

            {/* Error State */}
            {!isLoading && error && (
              <div className="bg-white rounded-3xl p-8 border border-red-200 shadow-sm text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto text-2xl">
                  <FiAlertCircle />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-slate-900">Unable to Load Booking</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">{error}</p>
                </div>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={fetchBooking}
                    className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition-colors"
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate("/my-service-bookings")}
                    className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors"
                  >
                    View All Bookings
                  </button>
                </div>
              </div>
            )}

            {/* Main Content */}
            {!isLoading && booking && (
              <div className="space-y-5 animate-fadeIn">
                {/* 1. Header Card */}
                <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-extrabold text-slate-500">
                          BOOKING REFERENCE
                        </span>
                        <span className="text-base font-black text-slate-900">#{booking.bookingId}</span>
                      </div>
                      <h1 className="text-lg sm:text-xl font-black text-slate-900 mt-1">
                        {booking.serviceName}
                      </h1>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {getStatusBadge(booking.status)}
                      {getPaymentStatusBadge(booking.paymentStatus)}
                    </div>
                  </div>

                  {/* Status Timeline Progress Bar */}
                  {booking.status !== "cancelled" ? (
                    <div className="py-2">
                      <div className="flex items-center justify-between relative">
                        <div className="absolute left-4 right-4 top-3 -translate-y-1/2 h-0.5 bg-slate-200 -z-0" />
                        <div
                          className="absolute left-4 top-3 -translate-y-1/2 h-0.5 bg-emerald-500 transition-all duration-300 -z-0"
                          style={{
                            width: `${(Math.max(0, getStepIndex(booking.status)) / (workflowSteps.length - 1)) * 100}%`,
                          }}
                        />

                        {workflowSteps.map((s, idx) => {
                          const currentIdx = getStepIndex(booking.status);
                          const isDone = idx <= currentIdx;
                          const isCurrent = idx === currentIdx;
                          return (
                            <div key={s.key} className="flex flex-col items-center gap-1 z-10 text-center">
                              <div
                                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                                  isDone
                                    ? "bg-emerald-500 text-white shadow-xs"
                                    : "bg-slate-200 text-slate-500"
                                } ${isCurrent ? "ring-4 ring-emerald-100 scale-110" : ""}`}
                              >
                                {isDone ? <FiCheck className="text-xs stroke-[3]" /> : idx + 1}
                              </div>
                              <span
                                className={`text-[10px] font-bold hidden sm:block ${
                                  isDone ? "text-slate-900" : "text-slate-400"
                                }`}
                              >
                                {s.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3">
                      <FiXCircle className="text-red-600 text-lg flex-shrink-0 mt-0.5" />
                      <div className="space-y-0.5 text-xs">
                        <h4 className="font-bold text-red-900">Service Booking Cancelled</h4>
                        <p className="text-red-700 text-[11px]">
                          {booking.cancellationReason || "This booking was cancelled."}
                        </p>
                        {booking.paymentStatus === "refunded" && (
                          <p className="text-emerald-700 font-bold text-[11px] pt-1">
                            ✓ Payment of ₹{booking.pricing?.total || 0} has been refunded to your SafeFire Wallet.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Key Information Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Schedule Card */}
                  <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#E31E24]">
                      <FiCalendar />
                      <span>Appointment Schedule</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Service Date</span>
                        <p className="text-xs font-bold text-slate-900">
                          {booking.bookingDate
                            ? new Date(booking.bookingDate).toLocaleDateString("en-IN", {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })
                            : "Scheduled"}
                        </p>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Time Slot</span>
                        <p className="text-xs font-bold text-slate-900 flex items-center gap-1">
                          <FiClock className="text-slate-400 text-xs" />
                          <span>{booking.timeSlot || "Standard Hours"}</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Assigned Provider Card */}
                  <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#E31E24]">
                      <FiTool />
                      <span>Certified Provider</span>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-extrabold text-slate-900">
                          {booking.vendorId?.storeName || booking.vendorId?.name || "Certified Partner"}
                        </h4>
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-extrabold rounded-md border border-emerald-200">
                          Verified
                        </span>
                      </div>

                      {booking.vendorId?.phone && (
                        <p className="text-xs text-slate-600 flex items-center gap-1.5">
                          <FiPhone className="text-slate-400" />
                          <span>Vendor Helpline: {booking.vendorId.phone}</span>
                        </p>
                      )}

                      {booking.vendorId?.address?.city && (
                        <p className="text-xs text-slate-500 flex items-center gap-1.5">
                          <FiMapPin className="text-slate-400" />
                          <span>
                            {booking.vendorId.address.city}, {booking.vendorId.address.state || "India"}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. Site Address Card */}
                <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#E31E24]">
                    <FiMapPin />
                    <span>Site Service Address</span>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-1.5 text-xs">
                    <p className="font-extrabold text-slate-900 text-sm">
                      {booking.serviceAddress?.fullName || "Site Contact"}
                    </p>
                    <p className="text-slate-700 leading-relaxed">
                      {booking.serviceAddress?.address}
                    </p>
                    <p className="text-slate-600 font-medium">
                      {booking.serviceAddress?.city}, {booking.serviceAddress?.state} -{" "}
                      <span className="font-mono font-bold text-slate-900">
                        {booking.serviceAddress?.zipCode || booking.pincode}
                      </span>
                    </p>
                    {booking.serviceAddress?.phone && (
                      <p className="text-slate-700 font-bold flex items-center gap-1.5 pt-1">
                        <FiPhone className="text-slate-400" />
                        <span>Phone: {booking.serviceAddress.phone}</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* 4. Service Specifications (Custom Fields) */}
                {booking.customFields && Object.keys(booking.customFields).length > 0 && (
                  <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#E31E24]">
                      <FiLayers />
                      <span>Service Specifications</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {Object.entries(booking.customFields).map(([key, val]) => (
                        <div
                          key={key}
                          className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center"
                        >
                          <span className="text-slate-500 capitalize">{key.replace(/_/g, " ")}:</span>
                          <span className="font-bold text-slate-900">{String(val)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 5. Financial & Payment Breakdown Card */}
                <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#E31E24]">
                      <FiDollarSign />
                      <span>Payment & Pricing Breakdown</span>
                    </div>
                    {getPaymentStatusBadge(booking.paymentStatus)}
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Rate per unit:</span>
                      <span className="font-bold text-slate-800">₹{booking.pricing?.unitPrice || 0}</span>
                    </div>

                    <div className="flex justify-between text-slate-600">
                      <span>Quantity:</span>
                      <span className="font-bold text-slate-800">{booking.quantity || 1} unit(s)</span>
                    </div>

                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal:</span>
                      <span className="font-bold text-slate-800">₹{booking.pricing?.subtotal || booking.pricing?.total || 0}</span>
                    </div>

                    {booking.pricing?.tax > 0 && (
                      <div className="flex justify-between text-slate-600">
                        <span>GST / Applicable Tax:</span>
                        <span className="font-bold text-slate-800">₹{booking.pricing.tax}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-slate-900 font-black text-sm pt-2 border-t border-slate-200">
                      <span>Total Amount:</span>
                      <span className="text-[#E31E24] text-base">₹{booking.pricing?.total || 0}</span>
                    </div>

                    <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
                      <span>Payment Method:</span>
                      <span className="font-extrabold uppercase text-slate-800">
                        {booking.paymentMethod === "cod" ? "Cash / Pay on Service" : booking.paymentMethod}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 6. Status History / Audit Trail (if present) */}
                {Array.isArray(booking.statusHistory) && booking.statusHistory.length > 0 && (
                  <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Booking Status History
                    </h3>
                    <div className="space-y-2 text-xs">
                      {booking.statusHistory.map((item, i) => (
                        <div
                          key={item._id || i}
                          className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100"
                        >
                          <div className="w-2 h-2 rounded-full bg-[#E31E24] mt-1.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="font-bold text-slate-900 uppercase">
                                {item.newStatus || item.status}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {item.changedAt ? new Date(item.changedAt).toLocaleString("en-IN") : ""}
                              </span>
                            </div>
                            {item.note && <p className="text-[11px] text-slate-600">{item.note}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 7. Action Controls Bar */}
                <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => navigate("/my-service-bookings")}
                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors"
                  >
                    Back to My Service Bookings
                  </button>

                  <div className="flex items-center gap-2">
                    {/* Review Button for completed bookings */}
                    {booking.status === "completed" && (
                      booking.isReviewed ? (
                        <span className="px-4 py-2.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-xl border border-emerald-200 flex items-center gap-1.5">
                          <FiStar className="fill-amber-400 text-amber-400" />
                          <span>Review Submitted</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowReviewModal(true)}
                          className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                        >
                          <FiStar className="fill-white" />
                          <span>Write a Review</span>
                        </button>
                      )
                    )}

                    {/* Cancel Booking Action */}
                    {canCancel && (
                      <button
                        type="button"
                        onClick={() => setShowCancelModal(true)}
                        className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-xl transition-colors border border-red-200 flex items-center gap-1.5"
                      >
                        <FiXCircle />
                        <span>Cancel Booking</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* CANCELLATION CONFIRMATION MODAL */}
            <AnimatePresence>
              {showCancelModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2 text-red-600 font-bold text-sm">
                        <FiXCircle className="text-lg" />
                        <span>Cancel Service Booking</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowCancelModal(false)}
                        className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                      >
                        <FiX className="text-lg" />
                      </button>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed">
                      Are you sure you want to cancel booking <strong className="text-slate-900">#{booking?.bookingId}</strong>?
                      {booking?.paymentStatus === "paid" && (
                        <span className="block text-emerald-700 font-semibold mt-1">
                          If paid, ₹{booking?.pricing?.total} will be refunded directly to your SafeFire Wallet.
                        </span>
                      )}
                    </p>

                    <form onSubmit={handleCancelBooking} className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-800 mb-1">
                          Reason for Cancellation <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          rows={3}
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          placeholder="e.g. Schedule changed, booked another service..."
                          required
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-red-500"
                        />
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setShowCancelModal(false)}
                          className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200"
                        >
                          Keep Booking
                        </button>
                        <button
                          type="submit"
                          disabled={isCancelling}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {isCancelling ? "Cancelling..." : "Confirm Cancellation"}
                        </button>
                      </div>
                    </form>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* REVIEW SUBMISSION MODAL */}
            <AnimatePresence>
              {showReviewModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2 text-amber-600 font-bold text-sm">
                        <FiStar className="fill-amber-500" />
                        <span>Review Service Experience</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowReviewModal(false)}
                        className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                      >
                        <FiX className="text-lg" />
                      </button>
                    </div>

                    <form onSubmit={handleSubmitReview} className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-800 mb-1.5">Rating (1 to 5 Stars)</label>
                        <div className="flex gap-2">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setRating(star)}
                              className="p-2 rounded-xl text-xl transition-transform hover:scale-110"
                            >
                              <FiStar
                                className={
                                  star <= rating
                                    ? "fill-amber-400 text-amber-400"
                                    : "text-slate-300"
                                }
                              />
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-800 mb-1">Feedback Comments</label>
                        <textarea
                          rows={3}
                          value={reviewText}
                          onChange={(e) => setReviewText(e.target.value)}
                          placeholder="How was the service technician's work, punctuality, and professionalism?"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setShowReviewModal(false)}
                          className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isSubmittingReview}
                          className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50"
                        >
                          {isSubmittingReview ? "Submitting..." : "Submit Review"}
                        </button>
                      </div>
                    </form>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default ServiceBookingDetailPage;
