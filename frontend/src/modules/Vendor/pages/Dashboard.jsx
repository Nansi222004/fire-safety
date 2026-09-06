import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  FiPackage,
  FiShoppingBag,
  FiDollarSign,
  FiTrendingUp,
  FiArrowRight,
  FiTool,
  FiCheckCircle,
  FiSlash,
  FiCalendar,
  FiClock,
  FiUser,
} from "react-icons/fi";
import { useVendorAuthStore } from "../store/vendorAuthStore";
import { useVendorProductStore } from "../store/vendorProductStore";
import {
  getVendorOrders,
  getVendorEarnings,
  getVendorDocuments,
  getVendorServices,
  getVendorServiceBookings,
} from "../services/vendorService";
import { formatPrice } from "../../../shared/utils/helpers";
import toast from "react-hot-toast";
import api from "../../../shared/utils/api";
import { getVendorCapabilities } from "../utils/vendorCapabilities";

const VendorDashboard = () => {
  const navigate = useNavigate();
  const { vendor, updateProfile } = useVendorAuthStore();
  const { products, total: totalProductsCount, fetchProducts } = useVendorProductStore();

  const [stats, setStats] = useState({
    totalProducts: 0,
    inStockProducts: 0,
    totalOrders: 0,
    pendingOrders: 0,
    totalEarnings: 0,
    pendingEarnings: 0,
  });

  const [serviceStats, setServiceStats] = useState({
    totalBookings: 0,
    pendingBookings: 0,
  });

  const [recentOrders, setRecentOrders] = useState([]);
  const [recentBookings, setRecentBookings] = useState([]);
  const [myServicesList, setMyServicesList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasUploadedDocs, setHasUploadedDocs] = useState(true);
  const [myServicesCount, setMyServicesCount] = useState(0);

  const vendorId = vendor?.id || vendor?._id;
  const { sellsProducts, providesServices, isServiceOnly, isProductOnly, isHybrid, badgeText } = getVendorCapabilities(vendor);
  const isServicesOnly = isServiceOnly;
  const caps = { sellsProducts, providesServices };

  useEffect(() => {
    if (!vendorId) return;

    if (caps.sellsProducts && products.length === 0) {
      fetchProducts();
    }

    const loadDashboardData = async () => {
      setIsLoading(true);
      try {
        const promises = [
          getVendorDocuments().catch(() => null),
        ];

        if (caps.sellsProducts) {
          promises.push(
            getVendorOrders({ page: 1, limit: 5 }).catch(() => null),
            getVendorEarnings().catch(() => null),
            getVendorOrders({ page: 1, limit: 1, status: "pending" }).catch(() => null),
            getVendorOrders({ page: 1, limit: 1, status: "processing" }).catch(() => null)
          );
        }

        if (caps.providesServices) {
          promises.push(
            getVendorServices().catch(() => null),
            getVendorServiceBookings({ page: 1, limit: 5 }).catch(() => null),
            getVendorServiceBookings({ page: 1, limit: 1, status: "pending" }).catch(() => null)
          );
        }

        // Also fetch earnings for service vendors if not already fetched
        if (!caps.sellsProducts) {
          promises.push(getVendorEarnings().catch(() => null));
        }

        const results = await Promise.all(promises);

        const docsRes = results[0];
        const docsData = docsRes?.data ?? docsRes;
        setHasUploadedDocs(Array.isArray(docsData) && docsData.length > 0);

        let curIdx = 1;
        if (caps.sellsProducts) {
          const ordersData = results[curIdx]?.data ?? results[curIdx];
          const earningsData = results[curIdx + 1]?.data ?? results[curIdx + 1];
          const pendingData = results[curIdx + 2]?.data ?? results[curIdx + 2];
          const processingData = results[curIdx + 3]?.data ?? results[curIdx + 3];
          curIdx += 4;

          const orders = ordersData?.orders ?? [];
          const summary = earningsData?.summary ?? {};
          const pending = Number(pendingData?.total || 0) + Number(processingData?.total || 0);

          setStats((prev) => ({
            ...prev,
            totalOrders: ordersData?.total ?? orders.length,
            pendingOrders: pending,
            totalEarnings: summary.totalEarnings ?? 0,
            pendingEarnings: summary.pendingEarnings ?? 0,
          }));
          setRecentOrders(orders);
        }

        if (caps.providesServices) {
          const servRes = results[curIdx];
          const bookingsRes = results[curIdx + 1];
          const pendingBookingsRes = results[curIdx + 2];
          curIdx += 3;

          const servData = servRes?.data?.data ?? servRes?.data ?? servRes ?? [];
          const serviceList = servData?.services ?? (Array.isArray(servData) ? servData : []);
          setMyServicesCount(serviceList.length);
          setMyServicesList(serviceList);

          const bookingsPayload = bookingsRes?.data?.data ?? bookingsRes?.data ?? bookingsRes ?? {};
          const bookingsList = Array.isArray(bookingsPayload.bookings)
            ? bookingsPayload.bookings
            : Array.isArray(bookingsPayload)
            ? bookingsPayload
            : [];
          setRecentBookings(bookingsList);

          const totalBookingsCount = bookingsPayload.pagination?.total ?? bookingsList.length;

          const pendingPayload = pendingBookingsRes?.data?.data ?? pendingBookingsRes?.data ?? pendingBookingsRes ?? {};
          const pendingCount = pendingPayload.pagination?.total ?? (
            Array.isArray(pendingPayload.bookings) ? pendingPayload.bookings.length : 0
          );

          setServiceStats({
            totalBookings: totalBookingsCount,
            pendingBookings: pendingCount,
          });
        }

        if (!caps.sellsProducts) {
          const earningsRes = results[curIdx];
          const earningsData = earningsRes?.data ?? earningsRes;
          const summary = earningsData?.summary ?? {};
          setStats((prev) => ({
            ...prev,
            totalEarnings: summary.totalEarnings ?? 0,
            pendingEarnings: summary.pendingEarnings ?? 0,
          }));
        }
      } catch (err) {
        console.error("Failed loading dashboard data:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadDashboardData();
  }, [vendorId, fetchProducts, products.length, caps.sellsProducts, caps.providesServices]);

  useEffect(() => {
    if (caps.sellsProducts) {
      const inStock = products.filter((p) => p.stock === "in_stock").length;
      setStats((prev) => ({
        ...prev,
        totalProducts: Number(totalProductsCount || 0),
        inStockProducts: inStock,
      }));
    }
  }, [products, totalProductsCount, caps.sellsProducts]);

  const handleEnableCapability = async (capabilityKey) => {
    try {
      const updatedCaps = {
        ...caps,
        [capabilityKey]: true,
      };
      const res = await api.put('/vendor/auth/profile', { vendorCapabilities: updatedCaps });
      const updatedVendor = res.data?.data || res.data;
      if (typeof updateProfile === 'function') {
        updateProfile(updatedVendor);
      }
      toast.success("Capability enabled! Refreshing marketplace dashboard.");
      window.location.reload();
    } catch (err) {
      toast.error(err.message || "Failed to enable capability.");
    }
  };

  const statCards = useMemo(() => {
    const list = [];
    if (caps.sellsProducts) {
      list.push(
        {
          icon: FiPackage,
          label: "Total Products",
          value: stats.totalProducts,
          color: "bg-amber-600",
          link: "/vendor/products",
        },
        {
          icon: FiShoppingBag,
          label: "Total Orders",
          value: stats.totalOrders,
          color: "bg-emerald-600",
          link: "/vendor/orders",
        },
        {
          icon: FiTrendingUp,
          label: "Pending Orders",
          value: stats.pendingOrders,
          color: "bg-orange-500",
          link: "/vendor/orders",
        },
        {
          icon: FiDollarSign,
          label: "Total Earnings",
          value: formatPrice(stats.totalEarnings || 0),
          color: "bg-red-600",
          link: "/vendor/earnings",
        }
      );
    }
    if (caps.providesServices) {
      list.push(
        {
          icon: FiTool,
          label: "Active Services",
          value: myServicesCount,
          color: "bg-orange-600",
          link: "/vendor/services/my-services",
        },
        {
          icon: FiCalendar,
          label: "Service Bookings",
          value: serviceStats.totalBookings,
          color: "bg-blue-600",
          link: "/vendor/services/service-bookings",
        },
        {
          icon: FiClock,
          label: "Pending Bookings",
          value: serviceStats.pendingBookings,
          color: "bg-amber-600",
          link: "/vendor/services/service-bookings",
        }
      );
      if (!caps.sellsProducts) {
        list.push({
          icon: FiDollarSign,
          label: "Store Earnings",
          value: formatPrice(stats.totalEarnings || 0),
          color: "bg-emerald-600",
          link: "/vendor/earnings",
        });
      }
    }
    return list;
  }, [caps.sellsProducts, caps.providesServices, stats, myServicesCount, serviceStats]);

  const topProducts = useMemo(() => products.slice(0, 5), [products]);

  // Capability Card Elements
  const productsCard = (
    <div
      key="products-cap"
      className={`rounded-3xl p-6 border transition-all ${
        caps.sellsProducts
          ? 'bg-white border-slate-200 shadow-sm'
          : 'bg-slate-50 border-slate-200/60 opacity-80'
      }`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-bold ${
            caps.sellsProducts ? 'bg-red-50 text-[#E31E24] border border-red-100' : 'bg-slate-200 text-slate-500'
          }`}>
            🛒
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-base">FIRE SAFETY PRODUCTS</h3>
            <p className="text-xs text-slate-500">Sell fire safety equipment through SafeFire marketplace</p>
          </div>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${
          caps.sellsProducts
            ? 'bg-emerald-100 text-emerald-800'
            : 'bg-slate-200 text-slate-600'
        }`}>
          {caps.sellsProducts ? <><FiCheckCircle /> ACTIVE</> : <><FiSlash /> NOT ENABLED</>}
        </span>
      </div>

      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {caps.sellsProducts ? `${stats.totalProducts} catalog products listed` : 'Product marketplace disabled'}
        </span>
        {caps.sellsProducts ? (
          <button
            onClick={() => navigate("/vendor/products")}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            Manage Products <FiArrowRight />
          </button>
        ) : (
          <button
            onClick={() => handleEnableCapability('sellsProducts')}
            className="px-4 py-2 bg-[#E31E24] hover:bg-[#c6151b] text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            Enable Products <FiArrowRight />
          </button>
        )}
      </div>
    </div>
  );

  const servicesCard = (
    <div
      key="services-cap"
      className={`rounded-3xl p-6 border transition-all ${
        caps.providesServices
          ? 'bg-white border-slate-200 shadow-sm'
          : 'bg-slate-50 border-slate-200/60 opacity-80'
      }`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-bold ${
            caps.providesServices ? 'bg-orange-50 text-[#FF6A00] border border-orange-100' : 'bg-slate-200 text-slate-500'
          }`}>
            🛠️
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-base">FIRE SAFETY SERVICES</h3>
            <p className="text-xs text-slate-500">Provide professional safety & maintenance services</p>
          </div>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${
          caps.providesServices
            ? 'bg-emerald-100 text-emerald-800'
            : 'bg-slate-200 text-slate-600'
        }`}>
          {caps.providesServices ? <><FiCheckCircle /> ACTIVE</> : <><FiSlash /> NOT ENABLED</>}
        </span>
      </div>

      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {caps.providesServices ? `${myServicesCount} active services configured` : 'Service marketplace disabled'}
        </span>
        {caps.providesServices ? (
          myServicesCount > 0 ? (
            <button
              onClick={() => navigate("/vendor/services/my-services")}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              Manage Services <FiArrowRight />
            </button>
          ) : (
            <button
              onClick={() => navigate("/vendor/services/available")}
              className="px-4 py-2 bg-[#FF6A00] hover:bg-[#e05e00] text-white rounded-xl text-xs font-bold shadow-md transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              Set Up Services <FiArrowRight />
            </button>
          )
        ) : (
          <button
            onClick={() => handleEnableCapability('providesServices')}
            className="px-4 py-2 bg-[#FF6A00] hover:bg-[#e05e00] text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            Enable Services <FiArrowRight />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">

      {/* Verification Warning (Only shown if vendor is truly unverified/not approved) */}
      {!hasUploadedDocs && vendor?.status !== 'approved' && !vendor?.isVerified && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-amber-900 text-sm sm:text-base">Complete Your Verification</h3>
            <p className="text-xs sm:text-sm text-amber-700">
              Complete your verification by uploading your business documents. Your account review can begin once documents are submitted.
            </p>
          </div>
          <button
            onClick={() => navigate("/vendor/documents")}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md transition-colors whitespace-nowrap cursor-pointer"
          >
            Upload Documents
          </button>
        </div>
      )}

      {/* Welcome Banner */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 md:p-8 shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-[#FF6A00]/20 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#FF6A00] bg-orange-950/60 border border-orange-500/20 px-3 py-1 rounded-full inline-block">
              SafeFire Vendor Dashboard
            </span>
            <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full inline-block ${
              isServiceOnly
                ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-500/20'
                : isHybrid
                ? 'text-purple-400 bg-purple-950/60 border border-purple-500/20'
                : 'text-amber-400 bg-amber-950/60 border border-amber-500/20'
            }`}>
              {badgeText}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight mb-2">
            Welcome back, {vendor?.storeName || vendor?.name}!
          </h1>
          <p className="text-sm text-slate-300 max-w-2xl">
            Manage your fire safety marketplace offerings, track orders, service bookings, and store earnings all in one unified control center.
          </p>
        </div>
      </div>

      {/* YOUR MARKETPLACE CAPABILITY CARDS */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-900 tracking-tight">YOUR MARKETPLACE</h2>
          <span className="text-xs text-slate-500 font-medium">SafeFire Dual Marketplace System</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isServicesOnly ? [servicesCard, productsCard] : [productsCard, servicesCard]}
        </div>
      </div>

      {/* Stats Cards */}
      {statCards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
              onClick={() => stat.link && navigate(stat.link)}
              className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md cursor-pointer transition-all">
              <div className="flex items-center justify-between mb-2">
                <div className={`${stat.color} p-3 rounded-2xl`}>
                  <stat.icon className="text-white text-xl" />
                </div>
                <FiArrowRight className="text-slate-400 text-lg" />
              </div>
              <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">
                {stat.label}
              </h3>
              <p className="text-slate-900 text-2xl font-black tracking-tight">
                {isLoading ? "—" : stat.value}
              </p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200/80">
        <h2 className="text-lg font-black text-slate-900 tracking-tight mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {caps.providesServices && (
            <>
              <button
                onClick={() => navigate("/vendor/services/service-bookings")}
                className="flex items-center gap-3 p-4 bg-blue-50/60 hover:bg-blue-50 rounded-2xl border border-blue-100 transition-colors text-left cursor-pointer">
                <div className="bg-blue-600 p-2.5 rounded-xl text-white">
                  <FiCalendar className="text-xl" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Service Bookings</h3>
                  <p className="text-xs text-slate-500">Track & manage customer bookings</p>
                </div>
              </button>

              <button
                onClick={() => navigate("/vendor/services/my-services")}
                className="flex items-center gap-3 p-4 bg-orange-50/60 hover:bg-orange-50 rounded-2xl border border-orange-100 transition-colors text-left cursor-pointer">
                <div className="bg-[#FF6A00] p-2.5 rounded-xl text-white">
                  <FiTool className="text-xl" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Configure Services</h3>
                  <p className="text-xs text-slate-500">Update offerings & service prices</p>
                </div>
              </button>
            </>
          )}

          {caps.sellsProducts && (
            <>
              <button
                onClick={() => navigate("/vendor/products/add-product")}
                className="flex items-center gap-3 p-4 bg-red-50/60 hover:bg-red-50 rounded-2xl border border-red-100 transition-colors text-left cursor-pointer">
                <div className="bg-[#E31E24] p-2.5 rounded-xl text-white">
                  <FiPackage className="text-xl" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Add New Product</h3>
                  <p className="text-xs text-slate-500">Create a new product listing</p>
                </div>
              </button>

              <button
                onClick={() => navigate("/vendor/orders")}
                className="flex items-center gap-3 p-4 bg-emerald-50/60 hover:bg-emerald-50 rounded-2xl border border-emerald-100 transition-colors text-left cursor-pointer">
                <div className="bg-emerald-600 p-2.5 rounded-xl text-white">
                  <FiShoppingBag className="text-xl" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">View Product Orders</h3>
                  <p className="text-xs text-slate-500">Manage orders & fulfillment</p>
                </div>
              </button>
            </>
          )}

          <button
            onClick={() => navigate("/vendor/earnings")}
            className="flex items-center gap-3 p-4 bg-slate-50 hover:bg-slate-100 rounded-2xl border border-slate-200 transition-colors text-left cursor-pointer">
            <div className="bg-slate-800 p-2.5 rounded-xl text-white">
              <FiDollarSign className="text-xl" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Earnings Overview</h3>
              <p className="text-xs text-slate-500">Check payouts & financial stats</p>
            </div>
          </button>
        </div>
      </div>

      {/* Service Vendor Section: Recent Bookings & Configured Services */}
      {caps.providesServices && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Service Bookings */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-black text-slate-900 tracking-tight">Recent Service Bookings</h2>
                <p className="text-xs text-slate-500">Appointments and scheduled customer visits</p>
              </div>
              <button
                onClick={() => navigate("/vendor/services/service-bookings")}
                className="text-xs text-[#FF6A00] hover:underline font-bold flex items-center gap-1 cursor-pointer">
                View All <FiArrowRight />
              </button>
            </div>

            {isLoading ? (
              <p className="text-slate-400 text-center py-8 text-xs">Loading service bookings...</p>
            ) : recentBookings.length > 0 ? (
              <div className="space-y-3">
                {recentBookings.map((booking) => {
                  const status = String(booking.status || '').toLowerCase();
                  const serviceTitle =
                    booking.serviceTitle ||
                    booking.service?.title ||
                    booking.service?.name ||
                    "Fire Safety Service";
                  const customerName =
                    booking.contactDetails?.name ||
                    booking.user?.name ||
                    "Customer";
                  const bookingAmount =
                    booking.pricing?.totalPrice ||
                    booking.totalPrice ||
                    booking.pricing?.basePrice ||
                    0;

                  return (
                    <div
                      key={booking._id}
                      onClick={() => navigate("/vendor/services/service-bookings")}
                      className="p-3.5 bg-slate-50 hover:bg-slate-100 rounded-2xl cursor-pointer transition-colors border border-slate-100">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="min-w-0">
                          <span className="font-mono font-bold text-slate-900 text-sm">
                            #{booking.bookingId}
                          </span>
                          <h4 className="font-bold text-slate-800 text-xs truncate mt-0.5">
                            {serviceTitle}
                          </h4>
                        </div>
                        <span
                          className={`text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap ${
                            status === "completed"
                              ? "bg-emerald-100 text-emerald-800"
                              : status === "confirmed"
                              ? "bg-blue-100 text-blue-800"
                              : status === "in_progress"
                              ? "bg-purple-100 text-purple-800"
                              : status === "cancelled"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-amber-100 text-amber-800 animate-pulse"
                          }`}>
                          {status}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pt-2 border-t border-slate-200/60 mt-2">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <FiUser className="text-slate-400" />
                            {customerName}
                          </span>
                          {(booking.scheduledDate || booking.preferredDate) && (
                            <span className="flex items-center gap-1">
                              <FiCalendar className="text-slate-400" />
                              {new Date(booking.scheduledDate || booking.preferredDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <span className="font-extrabold text-slate-900 text-sm">
                          {formatPrice(bookingAmount)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <FiCalendar className="text-3xl text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500 text-xs">No service bookings received yet</p>
              </div>
            )}
          </div>

          {/* Configured Services List */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-black text-slate-900 tracking-tight">Your Configured Services</h2>
                <p className="text-xs text-slate-500">Active services offered in your service area</p>
              </div>
              <button
                onClick={() => navigate("/vendor/services/my-services")}
                className="text-xs text-[#FF6A00] hover:underline font-bold flex items-center gap-1 cursor-pointer">
                Manage <FiArrowRight />
              </button>
            </div>

            {myServicesList.length > 0 ? (
              <div className="space-y-3">
                {myServicesList.slice(0, 5).map((srv) => {
                  const srvId = srv._id || srv.id;
                  const serviceObj = srv.service || srv;
                  const title = serviceObj.title || serviceObj.name || "Fire Safety Service";
                  const price = srv.customPrice || serviceObj.basePrice || 0;
                  return (
                    <div
                      key={srvId}
                      onClick={() => navigate("/vendor/services/my-services")}
                      className="flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100 rounded-2xl cursor-pointer transition-colors border border-slate-100">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 text-[#FF6A00] flex items-center justify-center font-bold flex-shrink-0">
                          <FiTool className="text-lg" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 text-sm truncate">
                            {title}
                          </p>
                          <p className="text-xs text-slate-500">
                            Starting from {formatPrice(price)}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex-shrink-0">
                        Active
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <FiTool className="text-3xl text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500 text-xs mb-3">No active services configured yet</p>
                <button
                  onClick={() => navigate("/vendor/services/available")}
                  className="px-4 py-2 bg-[#FF6A00] hover:bg-[#e05e00] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer">
                  Enable Available Services
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Product Vendor Section (Orders & Products) */}
      {caps.sellsProducts && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Orders */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black text-slate-900 tracking-tight">Recent Product Orders</h2>
              <button
                onClick={() => navigate("/vendor/orders")}
                className="text-xs text-[#E31E24] hover:underline font-bold cursor-pointer">
                View All
              </button>
            </div>
            {isLoading ? (
              <p className="text-slate-400 text-center py-8">Loading orders...</p>
            ) : recentOrders.length > 0 ? (
              <div className="space-y-3">
                {recentOrders.map((order) => {
                  const vendorItem = order.vendorItems?.find(
                    (vi) => vi.vendorId?.toString() === vendorId?.toString()
                  );
                  const displayStatus = vendorItem?.status ?? order.status;
                  const displayAmount = order.commissionDetails?.vendorEarnings !== undefined
                    ? order.commissionDetails.vendorEarnings
                    : vendorItem
                      ? (() => {
                          const effectiveSub = vendorItem.subtotal - (vendorItem.discount || 0);
                          const comm = order.commissionDetails?.commission !== undefined
                            ? order.commissionDetails.commission
                            : parseFloat((effectiveSub * 0.1).toFixed(2));
                          return parseFloat((effectiveSub - comm).toFixed(2));
                        })()
                      : 0;

                  return (
                    <div
                      key={order._id ?? order.orderId}
                      onClick={() =>
                        navigate(`/vendor/orders/${order.orderId ?? order._id}`)
                      }
                      className="flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100 rounded-2xl cursor-pointer transition-colors border border-slate-100">
                      <div>
                        <p className="font-bold text-slate-900 text-sm">
                          #{order.orderId ?? order._id}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-900 text-sm">
                          {formatPrice(displayAmount)}
                        </p>
                        <span
                          className={`text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full ${displayStatus === "delivered"
                              ? "bg-emerald-100 text-emerald-800"
                              : displayStatus === "pending"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-blue-100 text-blue-800"
                            }`}>
                          {displayStatus}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-slate-500 text-center py-8 text-xs">No product orders yet</p>
            )}
          </div>

          {/* Top Products */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black text-slate-900 tracking-tight">Your Store Products</h2>
              <button
                onClick={() => navigate("/vendor/products")}
                className="text-xs text-[#E31E24] hover:underline font-bold cursor-pointer">
                View All
              </button>
            </div>
            {topProducts.length > 0 ? (
              <div className="space-y-3">
                {topProducts.map((product) => (
                  <div
                    key={product._id ?? product.id}
                    onClick={() =>
                      navigate(`/vendor/products/${product._id ?? product.id}`)
                    }
                    className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100 rounded-2xl cursor-pointer transition-colors border border-slate-100">
                    <img
                      src={product.image || product.images?.[0]}
                      alt={product.name}
                      className="w-12 h-12 object-cover rounded-xl border border-slate-200"
                      onError={(e) => {
                        e.target.src = "https://via.placeholder.com/48x48?text=P";
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 text-sm truncate">
                        {product.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatPrice(product.price || 0)}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${product.stock === "in_stock"
                          ? "bg-emerald-100 text-emerald-800"
                          : product.stock === "low_stock"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-red-100 text-red-800"
                        }`}>
                      {product.stock === "in_stock"
                        ? "In Stock"
                        : product.stock === "low_stock"
                          ? "Low Stock"
                          : "Out of Stock"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-center py-8 text-xs">No products created yet</p>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default VendorDashboard;
