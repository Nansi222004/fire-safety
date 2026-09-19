import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiCheckCircle, FiTruck, FiHome, FiEye } from 'react-icons/fi';
import { motion } from 'framer-motion';
import MobileLayout from "../components/Layout/MobileLayout";
import { useOrderStore } from '../../../shared/store/orderStore';
import { formatPrice } from '../../../shared/utils/helpers';
import { formatVariantLabel } from '../../../shared/utils/variant';
import PageTransition from '../../../shared/components/PageTransition';
import LazyImage from '../../../shared/components/LazyImage';

const MobileOrderConfirmation = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { getOrder, fetchOrderById, fetchPublicTrackingOrder } = useOrderStore();
  const [isResolving, setIsResolving] = useState(true);
  const order = getOrder(orderId);
  const orderItems = Array.isArray(order?.items) ? order.items : [];
  const displayOrderId = order?.orderId || order?.id || orderId;

  useEffect(() => {
    if (location.state?.orderPlaced) {
      const t = setTimeout(() => {
        toast.success("Order placed successfully!", { id: "order-placed-success", duration: 4000 });
      }, 300);
      return () => clearTimeout(t);
    }
  }, [location.state]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!order && orderId) {
        try {
          const res = await fetchOrderById(orderId);
          if (!res && fetchPublicTrackingOrder) {
            await fetchPublicTrackingOrder(orderId);
          }
        } catch (e) {
          console.error("Failed to fetch order details:", e);
        }
      }
      if (mounted) setIsResolving(false);
    })();
    return () => {
      mounted = false;
    };
  }, [order, orderId, fetchOrderById, fetchPublicTrackingOrder]);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleTrackOrder = () => {
    if (displayOrderId) {
      navigate(`/track-order/${displayOrderId}`);
    } else {
      navigate('/orders');
    }
  };

  const handleBackToHome = () => {
    navigate('/home');
  };

  return (
    <PageTransition>
      <MobileLayout showBottomNav={false} showCartBar={false}>
        <div className="w-full min-h-screen flex items-center justify-center px-4 py-8 bg-gray-50">
          <div className="w-full max-w-md lg:max-w-lg">
            {/* Success Animation & Thank You Message */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="flex flex-col items-center justify-center mb-6 text-center"
            >
              <div className="w-20 h-20 sm:w-24 sm:h-24 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-full flex items-center justify-center mb-4 shadow-sm">
                <FiCheckCircle className="text-emerald-500 text-5xl" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-gray-900 mb-2">Order Placed Successfully!</h1>
              <p className="text-slate-600 text-center text-sm font-medium max-w-sm">
                Thank you for ordering! Your order has been received and is being processed.
              </p>
            </motion.div>

            {/* Order Details */}
            <div className="bg-white rounded-3xl p-6 mb-4 border border-slate-200/80 shadow-xl">
              <div className="text-center mb-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Order Number</p>
                <p className="text-xl font-black text-gray-900 tracking-tight">{displayOrderId || 'N/A'}</p>
                {order?.trackingNumber && (
                  <>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-3 mb-1">Tracking Number</p>
                    <p className="text-base font-bold text-primary-600">{order.trackingNumber}</p>
                  </>
                )}
              </div>

              {order ? (
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500 font-medium">Order Date</span>
                    <span className="font-bold text-gray-900">{formatDate(order.date || order.createdAt)}</span>
                  </div>
                  {order.total !== undefined && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 font-medium">Total Amount</span>
                      <span className="font-extrabold text-primary-700 text-lg">{formatPrice(order.total)}</span>
                    </div>
                  )}
                  {order.paymentMethod && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 font-medium">Payment Method</span>
                      <span className="font-bold text-gray-900 capitalize">{order.paymentMethod}</span>
                    </div>
                  )}
                </div>
              ) : isResolving ? (
                <div className="border-t border-slate-100 pt-4 text-center">
                  <p className="text-xs text-slate-400">Loading order summary...</p>
                </div>
              ) : null}
            </div>

            {/* Order Items Summary */}
            {orderItems.length > 0 && (
              <div className="bg-white rounded-3xl p-6 mb-4 border border-slate-200/80 shadow-xl">
                <h2 className="text-base font-extrabold text-gray-900 mb-4">Order Items</h2>
                <div className="space-y-3">
                  {orderItems.slice(0, 3).map((item, idx) => (
                    <div key={item.id || idx} className="flex items-center gap-3">
                      <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-50 border border-slate-100 p-1 flex-shrink-0">
                        <LazyImage
                          src={item.image}
                          alt={item.name}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-gray-900 text-sm mb-1 truncate">{item.name}</h3>
                        <p className="text-xs text-slate-500 font-medium">
                          {formatPrice(item.price)} × {item.quantity}
                        </p>
                        {formatVariantLabel(item?.variant) && (
                          <p className="text-[11px] text-slate-400 font-medium truncate">
                            {formatVariantLabel(item?.variant)}
                          </p>
                        )}
                      </div>
                      <p className="font-extrabold text-gray-900 text-sm">
                        {formatPrice(item.price * item.quantity)}
                      </p>
                    </div>
                  ))}
                  {orderItems.length > 3 && (
                    <p className="text-xs font-bold text-slate-500 text-center pt-2">
                      +{orderItems.length - 3} more item{orderItems.length - 3 !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Actions: Track Your Order and Back to Home */}
            <div className="space-y-3 pt-1">
              <button
                type="button"
                onClick={handleTrackOrder}
                className="w-full py-3.5 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white rounded-2xl font-bold text-center shadow-lg shadow-primary-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <FiTruck className="text-xl" />
                Track Your Order
              </button>

              <button
                type="button"
                onClick={handleBackToHome}
                className="w-full py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl font-bold transition-colors flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
              >
                <FiHome className="text-lg" />
                Back to Home
              </button>

              {displayOrderId && (
                <div className="text-center pt-1">
                  <Link
                    to={`/orders/${displayOrderId}`}
                    className="text-xs font-semibold text-slate-500 hover:text-primary-600 transition-colors inline-flex items-center gap-1.5"
                  >
                    <FiEye className="text-sm" />
                    View Order Details
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default MobileOrderConfirmation;
