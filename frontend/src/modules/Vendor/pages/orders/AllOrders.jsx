import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiSearch,
  FiEye,
  FiShoppingBag,
  FiChevronRight,
  FiChevronLeft,
  FiPackage,
  FiCalendar,
  FiX,
} from 'react-icons/fi';
import { motion } from 'framer-motion';
import DataTable from "../../../Admin/components/DataTable";
import ExportButton from "../../../Admin/components/ExportButton";
import Badge from "../../../../shared/components/Badge";
import AnimatedSelect from "../../../Admin/components/AnimatedSelect";
import { formatPrice } from '../../../../shared/utils/helpers';
import EmptyState from '../../../../shared/components/EmptyState';
import { useVendorAuthStore } from '../../store/vendorAuthStore';
import { getAllVendorOrders, updateVendorOrderStatus } from '../../services/vendorService';
import { getSocket, joinRoom, leaveRoom } from '../../../../shared/utils/socket';
import toast from 'react-hot-toast';

const AllOrders = () => {
  const navigate = useNavigate();
  const { vendor } = useVendorAuthStore();
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [mobilePage, setMobilePage] = useState(1);

  const vendorId = vendor?.id;

  const fetchOrders = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const data = await getAllVendorOrders({ limit: 100 });
      setOrders(data?.orders ?? []);
    } catch {
      // errors handled by api.js toast
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!vendorId) return;
    fetchOrders(true);
  }, [vendorId]);

  useEffect(() => {
    if (!vendorId) return;

    const token = localStorage.getItem('vendor-token') || localStorage.getItem('token');
    if (!token) return;

    const socket = getSocket(token);
    if (!socket) return;

    joinRoom(`vendor_${vendorId}`);

    const handleOrderUpdate = () => {
      fetchOrders(false);
    };

    socket.on('order_updated', handleOrderUpdate);

    return () => {
      socket.off('order_updated', handleOrderUpdate);
      leaveRoom(`vendor_${vendorId}`);
    };
  }, [vendorId]);

  // Reset mobile page on filter change
  useEffect(() => {
    setMobilePage(1);
  }, [searchQuery, selectedStatus]);

  const filteredOrders = useMemo(() => {
    let filtered = orders;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((order) =>
        order.orderId?.toLowerCase().includes(q) ||
        order._id?.toLowerCase().includes(q)
      );
    }

    if (selectedStatus !== 'all') {
      filtered = filtered.filter((order) => {
        const vendorItem = order.vendorItems?.find(
          (vi) => vi.vendorId?.toString() === vendorId?.toString()
        );
        const status = (vendorItem?.status ?? order.status ?? '').toLowerCase();
        return status === selectedStatus.toLowerCase();
      });
    }

    return filtered;
  }, [orders, searchQuery, selectedStatus, vendorId]);

  // Get per-vendor earnings (Net Payout)
  const getVendorEarningsAmount = (order) => {
    const vendorItem = order.vendorItems?.find(
      (vi) => vi.vendorId?.toString() === vendorId?.toString()
    );
    if (order.commissionDetails?.vendorEarnings !== undefined) {
      return order.commissionDetails.vendorEarnings;
    }
    if (!vendorItem) return 0;
    const effectiveSub = vendorItem.subtotal - (vendorItem.discount || 0);
    const comm = order.commissionDetails?.commission !== undefined
      ? order.commissionDetails.commission
      : parseFloat((effectiveSub * 0.1).toFixed(2));
    return parseFloat((effectiveSub - comm).toFixed(2));
  };

  const getOrderStatus = (order) => {
    const vendorItem = order.vendorItems?.find(
      (vi) => vi.vendorId?.toString() === vendorId?.toString()
    );
    const vendorShipment = order.shipments?.find(
      (s) => s.vendorId?.toString() === vendorId?.toString()
    );
    return vendorShipment?.status ?? vendorItem?.status ?? order.status ?? 'pending';
  };

  const statusOptions = [
    { value: 'all', label: 'All Orders' },
    { value: 'pending', label: 'Pending' },
    { value: 'processing', label: 'Processing' },
    { value: 'ready_for_pickup', label: 'Ready for Pickup' },
    { value: 'shipped', label: 'Shipped' },
    { value: 'delivered', label: 'Delivered' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  const columns = [
    {
      key: 'orderId',
      label: 'Order ID',
      sortable: true,
      render: (value, row) => (
        <span className="font-semibold text-gray-800">
          {value ?? row._id}
        </span>
      ),
    },
    {
      key: 'createdAt',
      label: 'Date',
      sortable: true,
      render: (value) => (
        <span className="text-sm text-gray-600">
          {value ? new Date(value).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      key: 'items',
      label: 'Items',
      sortable: false,
      render: (_, row) => {
        const vendorItem = row.vendorItems?.find(
          (vi) => vi.vendorId?.toString() === vendorId?.toString()
        );
        const count = vendorItem?.items?.length ?? row.vendorItems?.length ?? 0;
        return (
          <span className="text-sm text-gray-700">{count} item(s)</span>
        );
      },
    },
    {
      key: 'totalAmount',
      label: 'Amount',
      sortable: true,
      render: (_, row) => (
        <span className="font-semibold text-gray-800">
          {formatPrice(getVendorEarningsAmount(row))}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (_, row) => {
        const status = getOrderStatus(row);
        return (
          <Badge
            variant={
              status === 'delivered'
                ? 'success'
                : status === 'pending'
                  ? 'warning'
                  : status === 'cancelled' || status === 'canceled'
                    ? 'error'
                    : 'info'
            }>
            {status?.toUpperCase() || 'N/A'}
          </Badge>
        );
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (_, row) => (
        <button
          onClick={() => navigate(`/vendor/orders/${row.orderId ?? row._id}`)}
          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
          <FiEye />
        </button>
      ),
    },
  ];

  // Mobile pagination logic
  const mobileItemsPerPage = 10;
  const mobileTotalPages = Math.ceil(filteredOrders.length / mobileItemsPerPage);
  const paginatedMobileOrders = useMemo(() => {
    const start = (mobilePage - 1) * mobileItemsPerPage;
    return filteredOrders.slice(start, start + mobileItemsPerPage);
  }, [filteredOrders, mobilePage]);

  if (!vendorId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Please log in to view orders</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 sm:space-y-6">
      
      {/* Mobile Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4 px-1">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900 mb-0.5 sm:mb-2">
            All Orders
          </h1>
          <p className="text-xs sm:text-base text-gray-500">
            View and manage all your orders
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-6 shadow-sm border border-slate-200/80">
        {/* Search & Filters */}
        <div className="mb-4 sm:mb-6 pb-4 sm:pb-6 border-b border-gray-100 sm:border-gray-200 space-y-3">
          {/* Search bar */}
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 sm:gap-4">
            <div className="relative flex-1 w-full sm:min-w-[200px]">
              <FiSearch className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm sm:text-base" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Order ID..."
                className="w-full pl-10 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs sm:text-sm placeholder:text-gray-400"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                >
                  <FiX className="text-sm" />
                </button>
              )}
            </div>

            {/* Desktop Status Dropdown */}
            <div className="hidden sm:block">
              <AnimatedSelect
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                options={statusOptions}
                className="w-auto min-w-[150px]"
              />
            </div>

            {/* Export button */}
            <div className="hidden sm:block">
              <ExportButton
                data={filteredOrders}
                headers={[
                  { label: 'Order ID', accessor: (row) => row.orderId ?? row._id },
                  { label: 'Date', accessor: (row) => row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '—' },
                  { label: 'Amount', accessor: (row) => formatPrice(getVendorEarningsAmount(row)) },
                  { label: 'Status', accessor: (row) => getOrderStatus(row) },
                ]}
                filename="vendor-orders"
              />
            </div>
          </div>

          {/* Mobile Status Filter Pills */}
          <div className="sm:hidden flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
            {statusOptions.map((opt) => {
              const active = selectedStatus === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setSelectedStatus(opt.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                    active
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden sm:block">
          {isLoading ? (
            <p className="text-center py-12 text-gray-400">Loading orders...</p>
          ) : filteredOrders.length > 0 ? (
            <DataTable
              data={filteredOrders}
              columns={columns}
              pagination={true}
              itemsPerPage={10}
              onRowClick={(row) => navigate(`/vendor/orders/${row.orderId ?? row._id}`)}
            />
          ) : (
            <EmptyState
              icon={FiShoppingBag}
              title="No orders found"
              description={searchQuery || selectedStatus !== 'all'
                ? 'Try adjusting your filters'
                : 'Orders containing your products will appear here'}
              className="my-6"
            />
          )}
        </div>

        {/* Mobile Custom Card Feed */}
        <div className="sm:hidden space-y-2.5">
          {isLoading ? (
            <div className="text-center py-10 text-xs text-gray-400">
              Loading orders...
            </div>
          ) : paginatedMobileOrders.length > 0 ? (
            <>
              {paginatedMobileOrders.map((order) => {
                const status = getOrderStatus(order);
                const vendorItem = order.vendorItems?.find(
                  (vi) => vi.vendorId?.toString() === vendorId?.toString()
                );
                const itemCount = vendorItem?.items?.length ?? vendorItem?.quantity ?? rowItemCount(order);
                const earnings = getVendorEarningsAmount(order);
                const orderDate = order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'Recent';

                return (
                  <div
                    key={order._id ?? order.orderId}
                    onClick={() => navigate(`/vendor/orders/${order.orderId ?? order._id}`)}
                    className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-xs active:scale-98 transition-all cursor-pointer space-y-2.5"
                  >
                    {/* Top Row: Order ID & Status Badge */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-slate-900 text-xs truncate">
                        #{order.orderId ?? order._id?.slice(-8)?.toUpperCase()}
                      </span>
                      <span
                        className={`text-[9px] uppercase font-bold px-2.5 py-0.5 rounded-full flex-shrink-0 ${
                          status === "delivered"
                            ? "bg-emerald-100 text-emerald-800"
                            : status === "pending"
                            ? "bg-amber-100 text-amber-800"
                            : status === "shipped"
                            ? "bg-blue-100 text-blue-800"
                            : status === "cancelled" || status === "canceled"
                            ? "bg-red-100 text-red-800"
                            : "bg-indigo-100 text-indigo-800"
                        }`}
                      >
                        {status}
                      </span>
                    </div>

                    {/* Middle Row: Meta details */}
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                      <div className="flex items-center gap-3 text-slate-500 text-[11px]">
                        <span className="flex items-center gap-1">
                          <FiCalendar className="text-slate-400" /> {orderDate}
                        </span>
                        <span className="flex items-center gap-1">
                          <FiPackage className="text-slate-400" /> {itemCount} item(s)
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block leading-none">Net Payout</span>
                        <span className="font-black text-slate-900 text-sm">
                          {formatPrice(earnings)}
                        </span>
                      </div>
                    </div>

                    {/* Bottom Action Hint */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-50 text-[11px] text-blue-600 font-semibold">
                      <span>View Order Details</span>
                      <FiChevronRight className="text-slate-400 text-sm" />
                    </div>
                  </div>
                );
              })}

              {/* Mobile Pagination Controls */}
              {mobileTotalPages > 1 && (
                <div className="flex items-center justify-between pt-3 text-xs text-slate-600">
                  <button
                    disabled={mobilePage <= 1}
                    onClick={() => setMobilePage((p) => Math.max(1, p - 1))}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed bg-white font-medium shadow-xs active:scale-95"
                  >
                    <FiChevronLeft /> Prev
                  </button>
                  <span className="font-semibold text-slate-700">
                    Page {mobilePage} of {mobileTotalPages}
                  </span>
                  <button
                    disabled={mobilePage >= mobileTotalPages}
                    onClick={() => setMobilePage((p) => Math.min(mobileTotalPages, p + 1))}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed bg-white font-medium shadow-xs active:scale-95"
                  >
                    Next <FiChevronRight />
                  </button>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              icon={FiShoppingBag}
              title="No orders found"
              description={searchQuery || selectedStatus !== 'all'
                ? 'Try adjusting your search or status filters'
                : 'Orders containing your products will appear here'}
              className="my-6"
            />
          )}
        </div>
      </div>
    </motion.div>
  );
};

// Helper for count fallback
const rowItemCount = (row) => {
  return row.vendorItems?.reduce((sum, vi) => sum + (vi.items?.length || vi.quantity || 1), 0) || 1;
};

export default AllOrders;

