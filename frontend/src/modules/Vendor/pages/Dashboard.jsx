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
} from "react-icons/fi";
import { useVendorAuthStore } from "../store/vendorAuthStore";
import { useVendorProductStore } from "../store/vendorProductStore";
import { getVendorOrders, getVendorEarnings, getVendorDocuments, getVendorServices } from "../services/vendorService";
import { formatPrice } from "../../../shared/utils/helpers";
import toast from "react-hot-toast";
import api from "../../../shared/utils/api";

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

  const [recentOrders, setRecentOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasUploadedDocs, setHasUploadedDocs] = useState(true);
  const [myServicesCount, setMyServicesCount] = useState(0);

  const vendorId = vendor?.id || vendor?._id;
  const caps = vendor?.vendorCapabilities || { sellsProducts: true, providesServices: false };

  useEffect(() => {
    if (!vendorId) return;

    if (caps.sellsProducts && products.length === 0) {
      fetchProducts();
    }

    const loadDashboardData = async () => {
      setIsLoading(true);
      try {
        const promises = [
          getVendorDocuments(),
        ];

        if (caps.sellsProducts) {
          promises.push(
            getVendorOrders({ page: 1, limit: 5 }),
            getVendorEarnings(),
            getVendorOrders({ page: 1, limit: 1, status: "pending" }),
            getVendorOrders({ page: 1, limit: 1, status: "processing" })
          );
        }

        if (caps.providesServices) {
          promises.push(getVendorServices());
        }

        const results = await Promise.all(promises);

        const docsRes = results[0];
        const docsData = docsRes?.data ?? docsRes;
        setHasUploadedDocs(Array.isArray(docsData) && docsData.length > 0);

        if (caps.sellsProducts) {
          const ordersData = results[1]?.data ?? results[1];
          const earningsData = results[2]?.data ?? results[2];
          const pendingData = results[3]?.data ?? results[3];
          const processingData = results[4]?.data ?? results[4];

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
          const servicesIdx = caps.sellsProducts ? 5 : 1;
          const servRes = results[servicesIdx];
          const servData = servRes?.data ?? servRes;
          const serviceList = servData?.services ?? servData ?? [];
          setMyServicesCount(Array.isArray(serviceList) ? serviceList.length : 0);
        }
      } catch {
        // errors handled cleanly
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
          color: "bg-red-600",
          link: "/vendor/services/my-services",
        }
      );
    }
    return list;
  }, [caps.sellsProducts, caps.providesServices, stats, myServicesCount]);

  const topProducts = useMemo(() => products.slice(0, 5), [products]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">

      {/* Verification Warning */}
      {!hasUploadedDocs && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-amber-900 text-sm sm:text-base">Complete Your Verification</h3>
            <p className="text-xs sm:text-sm text-amber-700">Complete your verification by uploading your business documents. Your account review can begin once documents are submitted.</p>
          </div>
          <button
            onClick={() => navigate("/vendor/documents")}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md transition-colors whitespace-nowrap"
          >
            Upload Documents
          </button>
        </div>
      )}

      {/* Welcome Banner */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 md:p-8 shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-[#E31E24]/20 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <span className="text-xs font-bold uppercase tracking-wider text-[#FF6A00] bg-orange-950/60 border border-orange-500/20 px-3 py-1 rounded-full inline-block mb-3">
            SafeFire Vendor Dashboard
          </span>
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
          {/* Products Capability Card */}
          <div className={`rounded-3xl p-6 border transition-all ${
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
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
                >
                  Manage Products <FiArrowRight />
                </button>
              ) : (
                <button
                  onClick={() => handleEnableCapability('sellsProducts')}
                  className="px-4 py-2 bg-[#E31E24] hover:bg-[#c6151b] text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
                >
                  Enable Products <FiArrowRight />
                </button>
              )}
            </div>
          </div>

          {/* Services Capability Card */}
          <div className={`rounded-3xl p-6 border transition-all ${
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
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
                  >
                    Manage Services <FiArrowRight />
                  </button>
                ) : (
                  <button
                    onClick={() => navigate("/vendor/services/available")}
                    className="px-4 py-2 bg-[#E31E24] hover:bg-[#c6151b] text-white rounded-xl text-xs font-bold shadow-md transition-colors flex items-center gap-1.5"
                  >
                    Set Up Services <FiArrowRight />
                  </button>
                )
              ) : (
                <button
                  onClick={() => handleEnableCapability('providesServices')}
                  className="px-4 py-2 bg-[#E31E24] hover:bg-[#c6151b] text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
                >
                  Enable Services <FiArrowRight />
                </button>
              )}
            </div>
          </div>
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
              transition={{ delay: index * 0.1 }}
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
          {caps.sellsProducts && (
            <>
              <button
                onClick={() => navigate("/vendor/products/add-product")}
                className="flex items-center gap-3 p-4 bg-red-50/60 hover:bg-red-50 rounded-2xl border border-red-100 transition-colors text-left">
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
                className="flex items-center gap-3 p-4 bg-emerald-50/60 hover:bg-emerald-50 rounded-2xl border border-emerald-100 transition-colors text-left">
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

          {caps.providesServices && (
            <>
              <button
                onClick={() => navigate("/vendor/services/available")}
                className="flex items-center gap-3 p-4 bg-orange-50/60 hover:bg-orange-50 rounded-2xl border border-orange-100 transition-colors text-left">
                <div className="bg-[#FF6A00] p-2.5 rounded-xl text-white">
                  <FiTool className="text-xl" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Configure Services</h3>
                  <p className="text-xs text-slate-500">Enable services & set prices</p>
                </div>
              </button>

              <button
                onClick={() => navigate("/vendor/services/service-bookings")}
                className="flex items-center gap-3 p-4 bg-amber-50/60 hover:bg-amber-50 rounded-2xl border border-amber-100 transition-colors text-left">
                <div className="bg-amber-600 p-2.5 rounded-xl text-white">
                  <FiShoppingBag className="text-xl" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Service Bookings</h3>
                  <p className="text-xs text-slate-500">View customer service bookings</p>
                </div>
              </button>
            </>
          )}

          <button
            onClick={() => navigate("/vendor/earnings")}
            className="flex items-center gap-3 p-4 bg-slate-50 hover:bg-slate-100 rounded-2xl border border-slate-200 transition-colors text-left">
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

      {/* Product Vendor Section */}
      {caps.sellsProducts && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Orders */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black text-slate-900 tracking-tight">Recent Product Orders</h2>
              <button
                onClick={() => navigate("/vendor/orders")}
                className="text-xs text-[#E31E24] hover:underline font-bold">
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
                className="text-xs text-[#E31E24] hover:underline font-bold">
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
