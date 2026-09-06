import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiTool,
  FiClock,
  FiCheckCircle,
  FiXCircle,
  FiCalendar,
  FiUser,
  FiEye,
  FiStar,
  FiPackage,
  FiRefreshCw,
  FiAlertCircle,
  FiArrowRight,
} from "react-icons/fi";
import toast from "react-hot-toast";
import MobileLayout from "../components/Layout/MobileLayout";
import PageTransition from "../../../shared/components/PageTransition";
import {
  getCustomerServiceBookings,
  cancelServiceBooking,
  addServiceReview,
} from "../services/customerServiceApi";

const MyServiceBookingsPage = () => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Service Review Modal State
  const [reviewBooking, setReviewBooking] = useState(null);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const fetchBookings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getCustomerServiceBookings();
      // Handle unwrapped vs raw Axios responses safely
      const payload = res?.bookings || res?.data?.bookings || (Array.isArray(res) ? res : []);
      setBookings(payload);
    } catch (err) {
      console.error("Error fetching service bookings:", err);
      setError(err?.message || "Unable to load your service bookings.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const handleOpenReview = (booking) => {
    setReviewBooking(booking);
    setRating(5);
    setReviewText("");
  };

  const handleSubmitReview = async (e) => {
    e?.preventDefault();
    if (!reviewBooking) return;
    setIsSubmittingReview(true);
    try {
      await addServiceReview(reviewBooking._id || reviewBooking.bookingId, {
        rating,
        reviewText: reviewText.trim(),
      });
      toast.success("Thank you! Service review submitted successfully. ⭐");
      setReviewBooking(null);
      fetchBookings();
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
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
            <FiCheckCircle />
            <span>COMPLETED</span>
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-red-50 text-red-700 border border-red-200 uppercase">
            <FiXCircle />
            <span>CANCELLED</span>
          </span>
        );
      case "in_progress":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200 uppercase">
            <FiTool />
            <span>IN PROGRESS</span>
          </span>
        );
      case "assigned":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase">
            <FiUser />
            <span>ASSIGNED</span>
          </span>
        );
      case "confirmed":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 uppercase">
            <FiClock />
            <span>CONFIRMED</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-300 uppercase">
            <FiClock />
            <span>PENDING</span>
          </span>
        );
    }
  };

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={false} showHeader={true}>
        <div className="min-h-[calc(100vh-60px)] bg-[#F8FAFC] text-slate-900 font-sans pb-24">
          <div className="max-w-4xl mx-auto px-4 py-4 sm:py-6 space-y-5">
            {/* Top Seamless Switcher: Product Orders vs Service Bookings */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
              <Link
                to="/orders"
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-colors inline-flex items-center gap-2"
              >
                <FiPackage className="text-sm" />
                <span>Product Orders</span>
              </Link>
              <div className="px-4 py-2 text-xs font-extrabold bg-white border border-slate-200 text-[#E31E24] rounded-xl shadow-2xs inline-flex items-center gap-2">
                <FiTool className="text-sm" />
                <span>Service Bookings</span>
              </div>
            </div>

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2">
                  <FiTool className="text-[#E31E24]" />
                  My Service Bookings
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Track scheduled visits, technician details, and service status.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchBookings}
                  className="p-2 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-2xs"
                  title="Refresh bookings"
                >
                  <FiRefreshCw className={`text-xs ${isLoading ? "animate-spin" : ""}`} />
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/services")}
                  className="px-3.5 py-2 bg-[#E31E24] text-white text-xs font-bold rounded-xl hover:bg-[#c6151b] transition-all shadow-xs flex items-center gap-1.5"
                >
                  <span>+ Book Service</span>
                </button>
              </div>
            </div>

            {/* Loading State */}
            {isLoading && (
              <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 shadow-2xs">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#E31E24] border-t-transparent mb-3"></div>
                <p className="text-slate-500 text-xs font-semibold">Loading your service bookings...</p>
              </div>
            )}

            {/* Error State */}
            {!isLoading && error && (
              <div className="text-center py-12 px-4 bg-white rounded-3xl border border-red-200 shadow-sm space-y-3">
                <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto text-2xl">
                  <FiAlertCircle />
                </div>
                <h3 className="text-base font-bold text-slate-800">Unable to load your service bookings</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">{error}</p>
                <button
                  type="button"
                  onClick={fetchBookings}
                  className="mt-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-2"
                >
                  <FiRefreshCw />
                  <span>Retry</span>
                </button>
              </div>
            )}

            {/* Empty State */}
            {!isLoading && !error && bookings.length === 0 && (
              <div className="text-center py-16 px-4 bg-white rounded-3xl border border-slate-200 shadow-sm space-y-3">
                <div className="w-16 h-16 rounded-full bg-red-50 text-[#E31E24] flex items-center justify-center mx-auto text-3xl">
                  <FiTool />
                </div>
                <h3 className="text-base font-bold text-slate-800">No service bookings yet.</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Book a fire-safety service and your bookings will appear here.
                </p>
                <button
                  type="button"
                  onClick={() => navigate("/services")}
                  className="mt-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-2"
                >
                  <span>Explore Services</span>
                  <FiArrowRight />
                </button>
              </div>
            )}

            {/* Bookings List */}
            {!isLoading && !error && bookings.length > 0 && (
              <div className="space-y-3.5">
                {bookings.map((booking) => (
                  <motion.div
                    key={booking._id || booking.id || booking.bookingId}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-200/90 shadow-xs hover:shadow-md transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-slate-900 text-sm font-mono tracking-tight">
                          #{booking.bookingId}
                        </span>
                        {getStatusBadge(booking.status)}
                        <span
                          className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                            booking.paymentStatus === "paid"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-slate-100 text-slate-600 border-slate-200"
                          }`}
                        >
                          {booking.paymentStatus === "paid" ? "Paid" : "Pay on Service"}
                        </span>
                      </div>

                      <h3 className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
                        {booking.serviceName}
                      </h3>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 pt-0.5">
                        <span className="flex items-center gap-1 font-medium">
                          <FiCalendar className="text-slate-400" />
                          <span>
                            {booking.bookingDate
                              ? new Date(booking.bookingDate).toLocaleDateString("en-IN", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })
                              : "Date Scheduled"}
                          </span>
                        </span>
                        <span className="flex items-center gap-1 font-medium">
                          <FiClock className="text-slate-400" />
                          <span>{booking.timeSlot || "Standard"}</span>
                        </span>
                        <span className="flex items-center gap-1 font-semibold text-slate-700 truncate max-w-[200px]">
                          <FiUser className="text-slate-400" />
                          <span>{booking.vendorId?.storeName || booking.vendorId?.name || "Certified Partner"}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100 flex-shrink-0">
                      <div className="text-left sm:text-right mr-1">
                        <span className="text-[10px] text-slate-400 font-bold block uppercase">Total Amount:</span>
                        <span className="text-base font-black text-[#E31E24]">
                          ₹{booking.pricing?.total || 0}
                        </span>
                      </div>

                      {booking.status === "completed" && (
                        booking.isReviewed ? (
                          <span className="px-2.5 py-1.5 bg-emerald-50 text-emerald-700 text-[11px] font-bold rounded-xl border border-emerald-200 flex items-center gap-1">
                            <FiStar className="fill-amber-400 text-amber-400" />
                            <span>Reviewed</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenReview(booking)}
                            className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold rounded-xl transition-colors border border-amber-200 flex items-center gap-1"
                          >
                            <FiStar className="fill-amber-400 text-amber-400" />
                            <span>Review</span>
                          </button>
                        )
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/my-service-bookings/${booking._id || booking.bookingId}`)
                        }
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-2xs flex items-center gap-1.5"
                      >
                        <FiEye />
                        <span>View Details</span>
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* REVIEW MODAL */}
            <AnimatePresence>
              {reviewBooking && (
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
                        <span>Review Completed Service</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setReviewBooking(null)}
                        className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                      >
                        ✕
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
                          onClick={() => setReviewBooking(null)}
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

export default MyServiceBookingsPage;
