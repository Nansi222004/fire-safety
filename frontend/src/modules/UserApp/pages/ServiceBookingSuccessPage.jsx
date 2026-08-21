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
} from "react-icons/fi";
import MobileLayout from "../components/Layout/MobileLayout";
import PageTransition from "../../../shared/components/PageTransition";
import { getServiceBookingById } from "../services/customerServiceApi";

const ServiceBookingSuccessPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [booking, setBooking] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchBooking = async () => {
      setIsLoading(true);
      try {
        const res = await getServiceBookingById(id);
        const data = res?.data?.booking || res?.booking || null;
        setBooking(data);
      } catch (err) {
        console.error("Failed to load booking:", err);
      } finally {
        setIsLoading(false);
      }
    };
    if (id) fetchBooking();
  }, [id]);

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={false} showHeader={true}>
        <div className="min-h-[calc(100vh-60px)] bg-[#F8FAFC] text-slate-900 font-sans pb-20">
          <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
            
            {/* Animated Success Card */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-3xl p-6 border border-slate-200 shadow-lg text-center space-y-4"
            >
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-3xl shadow-sm">
                <FiCheckCircle />
              </div>

              <div>
                <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 uppercase">
                  BOOKING CONFIRMED
                </span>
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-2">
                  Service Booking Received!
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  A certified technician has been assigned and will arrive as scheduled.
                </p>
              </div>

              {isLoading ? (
                <div className="py-6 text-center text-xs text-slate-400">Loading details...</div>
              ) : booking ? (
                <div className="bg-slate-50 rounded-2xl p-4 text-left border border-slate-200 space-y-3 text-xs">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                    <span className="text-slate-500 font-semibold">Booking Reference:</span>
                    <span className="font-extrabold text-slate-900">#{booking.bookingId}</span>
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

                  <div className="pt-2 border-t border-slate-200 flex justify-between text-xs font-bold text-slate-900">
                    <span>Total Amount Payable:</span>
                    <span className="text-[#E31E24] text-sm">₹{booking.pricing?.total || 0}</span>
                  </div>
                </div>
              ) : null}

              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => navigate("/customer/my-bookings")}
                  className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <FiList />
                  <span>My Service Bookings</span>
                </button>
                <button
                  onClick={() => navigate("/services")}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <span>Explore More Services</span>
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
