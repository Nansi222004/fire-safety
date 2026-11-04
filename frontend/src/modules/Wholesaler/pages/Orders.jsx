import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FiBriefcase, FiChevronRight } from "react-icons/fi";
import { getWholesalerOrders } from "../services/wholesalerService";
import { formatPrice } from "../../../shared/utils/helpers";

export const ORDER_STATUS_TONES = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  processing: "bg-[#FEF2F2] text-[#E31E24] border-red-200",
  ready_for_pickup: "bg-indigo-50 text-indigo-700 border-indigo-200",
  shipped: "bg-blue-50 text-blue-700 border-blue-200",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

export const formatStatus = (status) => String(status || "pending").replace(/_/g, " ");

const STATUS_FILTERS = ["all", "pending", "processing", "ready_for_pickup", "shipped", "delivered", "cancelled"];

const WholesalerOrders = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState("all");
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    getWholesalerOrders({ limit: 100, ...(status !== "all" ? { status } : {}) })
      .then((data) => setOrders(data?.orders ?? []))
      .catch(() => setOrders([]))
      .finally(() => setIsLoading(false));
  }, [status]);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div>
        <h1 className="hidden lg:block text-3xl font-bold text-slate-900 mb-1">B2B Orders</h1>
        <p className="text-sm text-slate-500">Orders placed by verified business buyers. Wholesale orders are delivered by manual delivery.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="Filter by status">
        {STATUS_FILTERS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={status === key}
            onClick={() => setStatus(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap capitalize ${
              status === key ? "bg-[#E31E24] text-white border-[#E31E24]" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
            }`}
          >
            {formatStatus(key)}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl p-3 sm:p-5 shadow-sm border border-slate-200">
        {isLoading ? (
          <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>
        ) : orders.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <FiBriefcase className="mx-auto text-3xl text-slate-300" />
            <p className="text-sm text-slate-500">No orders found.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {orders.map((order) => {
              const group = order.vendorItems?.[0] || {};
              const items = group.items?.length ? group.items : order.items || [];
              const units = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
              const orderStatus = group.status || order.status || "pending";
              return (
                <button
                  key={order._id}
                  type="button"
                  onClick={() => navigate(`/wholesaler/orders/${order.orderId ?? order._id}`)}
                  className="w-full flex items-center gap-3 sm:gap-4 py-4 text-left hover:bg-slate-50 rounded-lg px-2 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-800">#{order.orderId}</span>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold border capitalize ${ORDER_STATUS_TONES[orderStatus] || ORDER_STATUS_TONES.pending}`}>
                        {formatStatus(orderStatus)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 truncate">
                      {items.map((i) => `${i.name} × ${i.quantity}`).join(", ")}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {order.shippingAddress?.name ? `${order.shippingAddress.name} · ` : ""}
                      {order.createdAt ? new Date(order.createdAt).toLocaleString("en-IN") : ""} · {units} units
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-800">{formatPrice(group.subtotal ?? order.subtotal)}</p>
                    <p className="text-[11px] text-slate-500">subtotal</p>
                  </div>
                  <FiChevronRight className="text-slate-400 flex-shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default WholesalerOrders;
