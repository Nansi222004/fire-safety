import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiTool,
  FiClock,
  FiCheckCircle,
  FiXCircle,
  FiMapPin,
  FiCalendar,
  FiUser,
  FiX,
  FiEye,
  FiArrowRight,
} from "react-icons/fi";
import toast from "react-hot-toast";
import MobileLayout from "../components/Layout/MobileLayout";
import PageTransition from "../../../shared/components/PageTransition";
import {
  getCustomerServiceBookings,
  cancelServiceBooking,
} from "../services/customerServiceApi";

const MyServiceBookingsPage = () => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);

  const fetchBookings = async () => {
    setIsLoading(true);
    try {
      const res = await getCustomerServiceBookings();
      const payload = res?.data?.bookings || res?.bookings || [];
      setBookings(payload);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const handleCancel = async (id) => {
    if (!window.confirm("Are you sure you want to cancel this service booking?")) return;
    setCancellingId(id);
    try {
      await cancelServiceBooking(id, "Cancelled by customer");
      toast.success("Service booking cancelled.");
      fetchBookings();
      setSelectedBooking(null);
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to cancel booking");
    } finally {
      setCancellingId(null);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <FiCheckCircle />
            <span>COMPLETED</span>
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
            <FiXCircle />
            <span>CANCELLED</span>
          </span>
        );
      case "confirmed":
      case "in_progress":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <FiClock />
            <span>CONFIRMED</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <FiClock />
            <span>PENDING</span>
          </span>
        );
    }
  };

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={false} showHeader={true}>
        <div className="min-h-[calc(100vh-60px)] bg-[#F8FAFC] text-slate-900 font-sans pb-20">
          <div className="max-w-4xl mx-auto px-4 py-4 sm:py-6 space-y-6">
            
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
                  <FiTool className="text-[#E31E24]" />
                  My Service Bookings
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Track scheduled visits, vendor details, and status of your fire safety bookings.
                </p>
              </div>

              <button
                onClick={() => navigate("/services")}
                className="px-3 py-2 bg-[#E31E24] text-white text-xs font-bold rounded-xl hover:bg-[#c6151b] transition-all shadow-xs"
              >
                + Book New Service
              </button>
            </div>

            {/* Bookings List */}
            {isLoading ? (
              <div className="text-center py-16">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#E31E24] border-t-transparent mb-3"></div>
                <p className="text-slate-500 text-xs">Loading your service bookings...</p>
              </div>
            ) : bookings.length === 0 ? (
              <div className="text-center py-16 px-4 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <FiTool className="mx-auto text-4xl text-slate-300" />
                <h3 className="text-base font-bold text-slate-800">No service bookings yet</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Need fire extinguisher refilling, AMC, or safety inspection? Browse available services now.
                </p>
                <button
                  onClick={() => navigate("/services")}
                  className="mt-2 px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl"
                >
                  Browse Services
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {bookings.map((booking) => (
                  <motion.div
                    key={booking._id || booking.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-900 text-sm">#{booking.bookingId}</span>
                        {getStatusBadge(booking.status)}
                      </div>

                      <h3 className="text-sm font-bold text-slate-900">{booking.serviceName}</h3>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 pt-1">
                        <span className="flex items-center gap-1">
                          <FiCalendar className="text-slate-400" />
                          {new Date(booking.bookingDate).toLocaleDateString("en-IN")}
                        </span>
                        <span className="flex items-center gap-1">
                          <FiClock className="text-slate-400" />
                          {booking.timeSlot}
                        </span>
                        <span className="flex items-center gap-1 font-semibold text-slate-700">
                          <FiUser className="text-slate-400" />
                          {booking.vendorId?.storeName || booking.vendorId?.name || "Vendor"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
                      <div className="text-left sm:text-right">
                        <span className="text-[10px] text-slate-500 font-semibold block">Total Price:</span>
                        <span className="text-sm font-extrabold text-[#E31E24]">₹{booking.pricing?.total || 0}</span>
                      </div>

                      <button
                        onClick={() => setSelectedBooking(booking)}
                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors flex items-center gap-1"
                      >
                        <FiEye />
                        <span>View Details</span>
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Booking Details Modal */}
            <AnimatePresence>
              {selectedBooking && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto"
                >
                  <motion.div
                    initial={{ scale: 0.95, y: 10 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.95, y: 10 }}
                    className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5"
                  >
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Booking Detail</span>
                        <h3 className="text-lg font-extrabold text-slate-900">#{selectedBooking.bookingId}</h3>
                      </div>
                      <button
                        onClick={() => setSelectedBooking(null)}
                        className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                      >
                        <FiX className="text-xl" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                      <div>
                        <span className="text-slate-500">Service Status:</span>
                        <div className="mt-1">{getStatusBadge(selectedBooking.status)}</div>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-500">Payment Status:</span>
                        <p className="font-bold uppercase text-slate-800">{selectedBooking.paymentStatus}</p>
                      </div>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div>
                        <span className="text-slate-500 font-semibold block">Service:</span>
                        <p className="font-extrabold text-slate-900 text-sm">{selectedBooking.serviceName}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                        <div>
                          <span className="text-slate-500">Service Date:</span>
                          <p className="font-bold text-slate-800">
                            {new Date(selectedBooking.bookingDate).toLocaleDateString("en-IN")}
                          </p>
                        </div>
                        <div>
                          <span className="text-slate-500">Time Slot:</span>
                          <p className="font-bold text-slate-800">{selectedBooking.timeSlot}</p>
                        </div>
                        <div>
                          <span className="text-slate-500">Quantity:</span>
                          <p className="font-bold text-slate-800">{selectedBooking.quantity || 1} units</p>
                        </div>
                        <div>
                          <span className="text-slate-500">Pincode:</span>
                          <p className="font-bold text-slate-800">{selectedBooking.pincode}</p>
                        </div>
                      </div>

                      {selectedBooking.vendorId && (
                        <div className="p-3 bg-red-50/50 rounded-xl border border-red-100">
                          <span className="text-slate-500 font-semibold text-[11px] block">Assigned Vendor Store:</span>
                          <p className="font-bold text-slate-900">{selectedBooking.vendorId?.storeName || selectedBooking.vendorId?.name}</p>
                          <p className="text-[11px] text-slate-600">{selectedBooking.vendorId?.phone}</p>
                        </div>
                      )}

                      {selectedBooking.serviceAddress && (
                        <div>
                          <span className="text-slate-500 font-semibold block">Service Location Address:</span>
                          <p className="text-slate-800 bg-slate-50 p-3 rounded-xl border border-slate-200">
                            {selectedBooking.serviceAddress.fullName} ({selectedBooking.serviceAddress.phone}) <br />
                            {selectedBooking.serviceAddress.address}, {selectedBooking.serviceAddress.city}, {selectedBooking.serviceAddress.zipCode}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                      {selectedBooking.status === "pending" || selectedBooking.status === "confirmed" ? (
                        <button
                          onClick={() => handleCancel(selectedBooking._id)}
                          disabled={cancellingId === selectedBooking._id}
                          className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-xl transition-colors border border-red-200 disabled:opacity-50"
                        >
                          {cancellingId === selectedBooking._id ? "Cancelling..." : "Cancel Booking"}
                        </button>
                      ) : (
                        <div />
                      )}

                      <button
                        onClick={() => setSelectedBooking(null)}
                        className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl"
                      >
                        Close
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default MyServiceBookingsPage;
