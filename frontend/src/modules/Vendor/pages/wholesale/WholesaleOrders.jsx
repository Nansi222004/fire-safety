import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FiBriefcase, FiChevronRight } from "react-icons/fi";
import { getWholesaleOrders } from "../../services/vendorService";
import { formatPrice } from "../../../../shared/utils/helpers";

const STATUS_TONES = {
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
  shipped: "bg-blue-50 text-blue-700 border-blue-200",
  ready_for_pickup: "bg-indigo-50 text-indigo-700 border-indigo-200",
};

const WholesaleOrders = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getWholesaleOrders({ limit: 100 })
      .then((data) => setOrders(data?.orders ?? []))
      .catch(() => setOrders([]))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-1">Wholesale Orders</h1>
        <p className="text-sm sm:text-base text-gray-600">B2B orders placed by approved wholesale buyers.</p>
      </div>

      <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
        {isLoading ? (
          <p className="text-sm text-gray-500 py-8 text-center">Loading…</p>
        ) : orders.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <FiBriefcase className="mx-auto text-3xl text-gray-300" />
            <p className="text-sm text-gray-500">No wholesale orders yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {orders.map((order) => {
              const vendorGroup = order.vendorItems?.[0] || {};
              const units = (order.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
              const status = order.status || vendorGroup.status || "pending";
              return (
                <button
                  key={order._id}
                  type="button"
                  onClick={() => navigate(`/vendor/wholesale/orders/${order.orderId ?? order._id}`)}
                  className="w-full flex items-center gap-4 py-4 text-left hover:bg-gray-50 rounded-lg px-2 -mx-2 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-800">#{order.orderId}</span>
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold border bg-sky-50 text-sky-700 border-sky-200">
                        B2B / WHOLESALE
                      </span>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold border capitalize ${STATUS_TONES[status] || "bg-amber-50 text-amber-700 border-amber-200"}`}>
                        {String(status).replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 truncate">
                      {(order.items || []).map((i) => `${i.name} × ${i.quantity}`).join(", ")}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {order.createdAt ? new Date(order.createdAt).toLocaleString("en-IN") : ""} · {units} units
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-800">{formatPrice(vendorGroup.subtotal ?? order.subtotal)}</p>
                    <p className="text-[11px] text-gray-500">subtotal</p>
                  </div>
                  <FiChevronRight className="text-gray-400 flex-shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default WholesaleOrders;
