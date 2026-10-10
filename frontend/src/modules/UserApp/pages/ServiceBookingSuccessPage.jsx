import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FiCheckCircle,
  FiCalendar,
  FiClock,
  FiMapPin,
  FiUser,
  FiTool,
  FiArrowRight,
  FiList,
  FiXCircle,
  FiCheck,
} from "react-icons/fi";
import MobileLayout from "../components/Layout/MobileLayout";
import PageTransition from "../../../shared/components/PageTransition";
import { getServiceBookingById } from "../services/customerServiceApi";
import { getSocket } from "../../../shared/utils/socket";

const getStatusConfig = (status) => {
  switch (status) {
    case "completed":
      return {
        badge: "Service Completed",
        badgeClass: "text-emerald-700 bg-emerald-50 border-emerald-200",
        title: "Service Completed!",
        description: "Your fire safety service has been completed successfully.",
        icon: <FiCheckCircle className="text-3xl text-emerald-600" />,
        iconBg: "bg-emerald-100",
      };
    case "in_progress":
      return {
        badge: "Service In Progress",
        badgeClass: "text-amber-700 bg-amber-50 border-amber-200",
        title: "Service In Progress!",
        description: "The service technician is currently carrying out the service at your location.",
        icon: <FiTool className="text-3xl text-amber-600" />,
        iconBg: "bg-amber-100",
      };
    case "assigned":
      return {
        badge: "Technician Assigned",
        badgeClass: "text-indigo-700 bg-indigo-50 border-indigo-200",
        title: "Technician Assigned!",
        description: "A technician has been assigned and will arrive during your scheduled time slot.",
        icon: <FiUser className="text-3xl text-indigo-600" />,
        iconBg: "bg-indigo-100",
      };
    case "confirmed":
      return {
        badge: "Booking Confirmed",
        badgeClass: "text-blue-700 bg-blue-50 border-blue-200",
        title: "Booking Confirmed!",
        description: "Your booking is confirmed. The vendor will arrive during your scheduled time slot.",
        icon: <FiCheck className="text-3xl text-blue-600" />,
        iconBg: "bg-blue-100",
      };
    case "cancelled":
      return {
        badge: "Booking Cancelled",
        badgeClass: "text-red-700 bg-red-50 border-red-200",
        title: "Booking Cancelled",
        description: "This service booking has been cancelled.",
        icon: <FiXCircle className="text-3xl text-red-600" />,
        iconBg: "bg-red-100",
      };
    default:
      return {
        badge: "Booking Pending",
        badgeClass: "text-amber-700 bg-amber-50 border-amber-200",
        title: "Service Booking Received!",
        description: "Your booking is received and awaiting vendor confirmation.",
        icon: <FiCheckCircle className="text-3xl text-emerald-600" />,
        iconBg: "bg-emerald-100",
      };
  }
};

const ServiceBookingSuccessPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [booking, setBooking] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchBooking = async () => {
      try {
        const res = await getServiceBookingById(id);
        const data = res?.data?.booking || res?.booking || (res?._id ? res : null);
        if (isMounted && data) {
          setBooking(data);
        }
      } catch (err) {
        console.error("Failed to load booking:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    if (id) {
      fetchBooking();

      // Listen for real-time status updates via socket
      const socket = getSocket();
      const handleStatusUpdate = (payload) => {
        const updatedId = payload?.bookingId;
        const updatedNumber = payload?.bookingNumber;
        if (
          String(updatedId) === String(id) ||
          String(updatedNumber) === String(id) ||
          (booking && (String(booking._id) === String(updatedId) || String(booking.bookingId) === String(updatedNumber)))
        ) {
          fetchBooking();
        }
      };

      if (socket) {
        socket.on("serviceBookingStatusUpdated", handleStatusUpdate);
      }

      // 4-second polling fallback to ensure state always stays in sync
      const pollTimer = setInterval(fetchBooking, 4000);

      return () => {
        isMounted = false;
        if (socket) {
          socket.off("serviceBookingStatusUpdated", handleStatusUpdate);
        }
        clearInterval(pollTimer);
      };
    }
  }, [id, booking?._id, booking?.bookingId]);

  const statusConfig = getStatusConfig(booking?.status || "pending");

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={false} showHeader={true}>
        <div className="min-h-[calc(100vh-60px)] bg-[#F8FAFC] text-slate-900 font-sans pb-20">
          <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
            
            {/* Animated Status Card */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-3xl p-6 border border-slate-200 shadow-lg text-center space-y-4"
            >
              <div className={`w-16 h-16 ${statusConfig.iconBg} rounded-full flex items-center justify-center mx-auto shadow-sm`}>
                {statusConfig.icon}
              </div>

              <div>
                {!isLoading && booking ? (
                  <span className={`text-[11px] font-bold px-3 py-1 rounded-full border uppercase ${statusConfig.badgeClass}`}>
                    {statusConfig.badge}
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-full border border-amber-200 uppercase">
                    Booking Received
                  </span>
                )}
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-2">
                  {!isLoading && booking ? statusConfig.title : "Service Booking Received!"}
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  {!isLoading && booking ? statusConfig.description : "Your booking is received and awaiting vendor confirmation."}
                </p>
              </div>

              {isLoading ? (
                <div className="py-6 text-center text-xs text-slate-400">Loading details...</div>
              ) : booking ? (
                <div className="bg-slate-50 rounded-2xl p-4 text-left border border-slate-200 space-y-3 text-xs">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                    <span className="text-slate-500 font-semibold">Booking Reference:</span>
                    <button
                      type="button"
                      onClick={() => navigate(`/my-service-bookings/${booking._id || booking.bookingId}`)}
                      className="font-extrabold text-[#E31E24] hover:underline cursor-pointer"
                      title="View Booking Details"
                    >
                      #{booking.bookingId} →
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                    <FiTool className="text-[#E31E24]" />
                    <span>{booking.serviceName}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-500">Service Date:</span>
                      <p className="font-bold text-slate-800">
                        {new Date(booking.bookingDate).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>

                    <div>
                      <span className="text-slate-500">Time Slot:</span>
                      <p className="font-bold text-slate-800">{booking.timeSlot}</p>
                    </div>
                  </div>

                  {booking.vendorId && (
                    <div className="pt-2 border-t border-slate-200 text-[11px]">
                      <span className="text-slate-500">Assigned Vendor:</span>
                      <p className="font-bold text-slate-800">{booking.vendorId?.storeName || booking.vendorId?.name}</p>
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-xs font-bold text-slate-900">
                    <span className="text-slate-500">
                      {booking.status === "completed" || booking.paymentStatus === "paid"
                        ? "Total Amount Paid:"
                        : "Total Amount Payable:"}
                    </span>
                    <div className="flex items-center gap-2">
                      {booking.paymentStatus === "paid" && (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 uppercase">
                          Paid
                        </span>
                      )}
                      <span className="text-[#E31E24] text-sm">₹{booking.pricing?.total || 0}</span>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => navigate("/my-service-bookings")}
                  className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors shadow-2xs"
                >
                  <FiList />
                  <span>My Service Bookings</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/my-service-bookings/${booking?._id || booking?.bookingId || id}`)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <span>Track Full Timeline</span>
                  <FiArrowRight />
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default ServiceBookingSuccessPage;
