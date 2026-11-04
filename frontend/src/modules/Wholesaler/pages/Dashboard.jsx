import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FiPackage,
  FiShoppingBag,
  FiClock,
  FiTrendingUp,
  FiCreditCard,
  FiAlertTriangle,
  FiPlus,
  FiShoppingCart,
  FiChevronRight,
} from "react-icons/fi";
import { getWholesalerDashboard } from "../services/wholesalerService";
import { formatPrice } from "../../../shared/utils/helpers";
import { ORDER_STATUS_TONES, formatStatus } from "./Orders";

const StatCard = ({ icon: Icon, label, value, hint, tone = "text-[#E31E24] bg-[#FEF2F2]", to }) => {
  const body = (
    <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 shadow-sm h-full hover:border-slate-300 active:bg-slate-50 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wide truncate">{label}</p>
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${tone}`}>
          <Icon />
        </span>
      </div>
      <p className="text-lg sm:text-2xl font-extrabold text-slate-900 mt-2 truncate">{value}</p>
      {hint && <p className="text-[11px] sm:text-xs text-slate-500 mt-1 truncate">{hint}</p>}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
};

const WholesalerDashboard = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getWholesalerDashboard()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return <p className="text-sm text-slate-500 py-16 text-center">Loading dashboard…</p>;
  }
  if (!data) {
    return <p className="text-sm text-slate-500 py-16 text-center">Could not load the dashboard. Please refresh.</p>;
  }

  const { business, products, orders, wallet, recentOrders } = data;
  const stockAlerts = (products.lowStock || 0) + (products.outOfStock || 0);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-3xl font-bold text-slate-900 truncate">Welcome, {business.businessName || business.name}</h1>
          <p className="text-sm text-slate-500 mt-1">GSTIN {business.gstNumber || "—"}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/wholesaler/products/add-product")}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 bg-[#E31E24] hover:bg-[#C8191E] text-white rounded-xl sm:rounded-lg text-sm font-semibold"
        >
          <FiPlus /> Add Wholesale Product
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard icon={FiShoppingBag} label="B2B Orders" value={orders.total} hint={`${orders.delivered} delivered`} to="/wholesaler/orders" />
        <StatCard icon={FiClock} label="Open Orders" value={orders.open} hint={`${orders.pending} awaiting action`} tone="text-amber-700 bg-amber-50" to="/wholesaler/orders" />
        <StatCard icon={FiTrendingUp} label="Delivered Sales" value={formatPrice(orders.revenue)} tone="text-emerald-700 bg-emerald-50" to="/wholesaler/earnings" />
        <StatCard icon={FiCreditCard} label="Wallet" value={formatPrice(wallet.walletBalance)} hint={`${formatPrice(wallet.onHoldBalance)} on hold`} tone="text-indigo-700 bg-indigo-50" to="/wholesaler/wallet-history" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-slate-100">
            <h2 className="font-bold text-slate-800">Recent B2B Orders</h2>
            <Link to="/wholesaler/orders" className="text-xs font-semibold text-[#E31E24] hover:underline">View all</Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="text-sm text-slate-500 px-5 py-10 text-center">No wholesale orders yet. Orders from business buyers appear here.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentOrders.map((order) => (
                <button
                  key={order._id}
                  type="button"
                  onClick={() => navigate(`/wholesaler/orders/${order.orderId}`)}
                  className="w-full flex items-center gap-3 px-4 sm:px-5 py-3 text-left hover:bg-slate-50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-800 text-sm">#{order.orderId}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${ORDER_STATUS_TONES[order.status] || ORDER_STATUS_TONES.pending}`}>
                        {formatStatus(order.status)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {order.buyerName || "Business buyer"} · {order.itemCount} units · {new Date(order.createdAt).toLocaleDateString("en-IN")}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-slate-800">{formatPrice(order.subtotal)}</p>
                  <FiChevronRight className="text-slate-400" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5">
            <h2 className="font-bold text-slate-800 mb-3">Catalog</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Products</dt><dd className="font-semibold">{products.total}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Active</dt><dd className="font-semibold">{products.active}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Low stock</dt><dd className="font-semibold text-amber-700">{products.lowStock}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Out of stock</dt><dd className="font-semibold text-red-600">{products.outOfStock}</dd></div>
            </dl>
            {stockAlerts > 0 && (
              <Link to="/wholesaler/pricing" className="mt-3 flex items-center gap-2 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <FiAlertTriangle /> Update stock for {stockAlerts} product{stockAlerts > 1 ? "s" : ""}
              </Link>
            )}
            <Link to="/wholesaler/products" className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#E31E24] hover:underline">
              <FiPackage /> Manage products
            </Link>
          </div>

          <div className="bg-gradient-to-br from-[#E31E24] to-[#9F1418] rounded-xl p-4 sm:p-5 text-white shadow-sm">
            <FiShoppingCart className="text-xl" />
            <h2 className="font-bold mt-2">Buy wholesale too</h2>
            <p className="text-xs text-red-100 mt-1 leading-relaxed">
              Sign in to the SafeFire app with your wholesaler email and password to buy from other wholesalers at B2B prices.
            </p>
            <Link to="/wholesale" className="inline-block mt-3 text-xs font-bold bg-white text-[#C8191E] rounded-lg px-3 py-1.5 hover:bg-[#FEF2F2]">
              Open wholesale catalog
            </Link>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default WholesalerDashboard;
