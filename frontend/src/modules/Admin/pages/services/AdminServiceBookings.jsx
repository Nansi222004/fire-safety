import { useState, useEffect } from 'react';
import {
  FiSearch,
  FiFilter,
  FiCalendar,
  FiClock,
  FiUser,
  FiPhone,
  FiMapPin,
  FiRefreshCw,
  FiEye,
  FiChevronLeft,
  FiChevronRight,
  FiAlertCircle,
  FiX,
  FiDollarSign,
  FiFileText,
  FiTag,
  FiCheckCircle,
  FiCheck,
  FiPlay
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import {
  getAdminServiceBookings,
  getAdminServiceBookingById,
  getAllVendors
} from '../../services/adminService';

const AdminServiceBookings = () => {
  const [bookings, setBookings] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVendor, setSelectedVendor] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1, limit: 10 });
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [activeModalTab, setActiveModalTab] = useState('details');

  const fetchVendorsList = async () => {
    try {
      const res = await getAllVendors({ status: 'approved', limit: 200 });
      const payload = res?.data?.data || res?.data || res || {};
      const list = payload?.vendors || (Array.isArray(payload) ? payload : []);
      setVendors(list);
    } catch {
      // ignore non-critical vendor fetch failure
    }
  };

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const res = await getAdminServiceBookings({
        vendorId: selectedVendor,
        status: selectedStatus,
        search: searchQuery,
        dateFrom,
        dateTo,
        page,
        limit: 10,
      });

      const payload = res?.data?.data || res?.data || res || {};
      const bookingsList = Array.isArray(payload.bookings)
        ? payload.bookings
        : Array.isArray(payload)
        ? payload
        : [];
      setBookings(bookingsList);
      setPagination(payload.pagination || { total: bookingsList.length, pages: 1, limit: 10 });
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to fetch global service bookings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendorsList();
  }, []);

  useEffect(() => {
    fetchBookings();
  }, [selectedVendor, selectedStatus, page, dateFrom, dateTo]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchBookings();
  };

  const handleOpenBooking = async (id) => {
    try {
      const res = await getAdminServiceBookingById(id);
      const bookingData = res?.data?.data?.booking || res?.data?.booking || res?.booking || res?.data || res || null;
      setSelectedBooking(bookingData);
      setActiveModalTab('details');
    } catch (err) {
      toast.error('Failed to load booking details.');
    }
  };

  const getStatusBadge = (status) => {
    const s = String(status || '').toLowerCase();
    switch (s) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 text-[11px] font-bold rounded-full border border-amber-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Pending Review
          </span>
        );
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-[11px] font-bold rounded-full border border-blue-200/80">
            <FiCheckCircle className="text-blue-500" />
            Confirmed
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 text-purple-700 text-[11px] font-bold rounded-full border border-purple-200/80">
            <FiClock className="text-purple-500" />
            In Progress
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[11px] font-bold rounded-full border border-emerald-200/80">
            <FiCheckCircle className="text-emerald-500" />
            Completed
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-700 text-[11px] font-bold rounded-full border border-rose-200/80">
            <FiAlertCircle className="text-rose-500" />
            Cancelled
          </span>
        );
      default:
        return <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-[11px] font-bold rounded-full">{status}</span>;
    }
  };

  const customFieldsMap = selectedBooking?.customFields || {};
  const customFieldsEntries = Object.entries(
    customFieldsMap instanceof Map ? Object.fromEntries(customFieldsMap) : customFieldsMap
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Global Service Bookings</h1>
          <p className="text-sm font-medium text-gray-500 mt-0.5">
            Platform-wide audit, tracking, and operational history of customer service appointments
          </p>
        </div>
        <button
          onClick={() => fetchBookings()}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-300 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-50 transition-colors shadow-2xs self-start md:self-auto"
        >
          <FiRefreshCw className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Admin Server-side Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-2xs space-y-3">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Vendor Filter */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Filter Vendor</label>
            <select
              value={selectedVendor}
              onChange={(e) => {
                setSelectedVendor(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 font-semibold"
            >
              <option value="all">All Vendors</option>
              {vendors.map((v) => (
                <option key={v._id} value={v._id}>
                  {v.storeName || v.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Filter Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 font-semibold"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Date From */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Date From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          {/* Date To */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Date To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        </form>

        {/* Global Search Input */}
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3.5 top-3 text-gray-400 text-sm" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Booking ID, Customer Name, Vendor, Phone, Pincode..."
              className="w-full text-xs pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 bg-gray-900 text-white text-xs font-bold rounded-xl hover:bg-black transition-colors"
          >
            Search
          </button>
        </form>
      </div>

      {/* Bookings Table */}
      {loading ? (
        <div className="py-16 text-center">
          <div className="w-8 h-8 border-3 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs font-semibold text-gray-500">Loading global service bookings...</p>
        </div>
      ) : bookings.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-2xl border border-gray-200/80 p-8 shadow-2xs">
          <FiAlertCircle className="text-4xl text-gray-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-gray-800">No Service Bookings Found</h3>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
            No platform service bookings match your selected vendor, status, or date filters.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 font-bold uppercase tracking-wider border-b border-gray-200/80 text-[10px]">
                  <th className="py-3 px-4">Booking ID</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Servicing Vendor</th>
                  <th className="py-3 px-4">Service & Variant</th>
                  <th className="py-3 px-4">Scheduled Date</th>
                  <th className="py-3 px-4">Pincode</th>
                  <th className="py-3 px-4">Total</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Audit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bookings.map((booking) => (
                  <tr key={booking._id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-gray-900">
                      #{booking.bookingId}
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-bold text-gray-900">{booking.serviceAddress?.fullName || booking.userId?.name || 'Customer'}</p>
                      <p className="text-[11px] text-gray-500">{booking.serviceAddress?.phone || booking.userId?.phone || 'N/A'}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-bold text-gray-900">{booking.vendorId?.storeName || booking.vendorId?.name || 'Certified Vendor'}</p>
                      <p className="text-[11px] text-gray-500">{booking.vendorId?.email || ''}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-bold text-gray-900">{booking.serviceName}</p>
                      <p className="text-[11px] text-gray-500">{booking.variant?.label || 'Standard'} (x{booking.quantity || 1})</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-bold text-gray-900">
                        {booking.bookingDate ? new Date(booking.bookingDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) : 'N/A'}
                      </p>
                      <p className="text-[11px] text-gray-500">{booking.timeSlot}</p>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-gray-700">
                      {booking.pincode}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-gray-900">
                      ₹{booking.pricing?.total || 0}
                    </td>
                    <td className="py-3.5 px-4">
                      {getStatusBadge(booking.status)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleOpenBooking(booking._id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-900 text-white text-xs font-bold rounded-xl hover:bg-black transition-colors shadow-2xs"
                      >
                        <FiEye />
                        <span>Audit</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="p-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-500 font-medium">
                Page {pagination.page} of {pagination.pages} ({pagination.total} total global bookings)
              </span>
              <div className="flex gap-2">
                <button
                  disabled={pagination.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-50 disabled:opacity-40"
                >
                  <FiChevronLeft className="inline" /> Prev
                </button>
                <button
                  disabled={pagination.page >= pagination.pages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-50 disabled:opacity-40"
                >
                  Next <FiChevronRight className="inline" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Admin Read-Only Audit Modal */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200/80 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between border-b border-slate-700/80 relative">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-[11px] font-mono font-semibold text-slate-400 bg-white/5 px-2.5 py-0.5 rounded-md border border-white/10">
                    Audit Booking #{selectedBooking.bookingId}
                  </span>
                  {getStatusBadge(selectedBooking.status)}
                </div>
                <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight capitalize">
                  {selectedBooking.serviceName}
                </h2>
              </div>
              <button
                onClick={() => setSelectedBooking(null)}
                className="p-2 text-slate-400 hover:text-white rounded-full bg-white/5 hover:bg-white/15 border border-white/10 transition-all cursor-pointer"
                title="Close modal"
              >
                <FiX className="text-lg" />
              </button>
            </div>

            {/* Modal Tabs Bar */}
            <div className="px-6 py-2.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
              <div className="inline-flex p-1 bg-slate-200/70 rounded-xl space-x-1">
                <button
                  onClick={() => setActiveModalTab('details')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeModalTab === 'details'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
                  }`}
                >
                  <FiFileText className={activeModalTab === 'details' ? 'text-rose-600' : 'text-slate-400'} />
                  <span>Overview & Financials</span>
                </button>
                <button
                  onClick={() => setActiveModalTab('timeline')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeModalTab === 'timeline'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
                  }`}
                >
                  <FiClock className={activeModalTab === 'timeline' ? 'text-rose-600' : 'text-slate-400'} />
                  <span>Audit Timeline ({selectedBooking.statusHistory?.length || 1})</span>
                </button>
              </div>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-5 bg-slate-50/30">
              {activeModalTab === 'details' ? (
                <>
                  {/* Customer & Vendor Details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Customer Info */}
                    <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs">
                            <FiUser />
                          </div>
                          Customer Details
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-extrabold text-slate-900">
                          {selectedBooking.serviceAddress?.fullName || selectedBooking.userId?.name || 'Customer'}
                        </p>
                        <a
                          href={`tel:${selectedBooking.serviceAddress?.phone || selectedBooking.userId?.phone || ''}`}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline mt-1"
                        >
                          <FiPhone className="text-slate-400 text-xs" />
                          <span>{selectedBooking.serviceAddress?.phone || selectedBooking.userId?.phone || 'N/A'}</span>
                        </a>
                      </div>
                    </div>

                    {/* Assigned Vendor */}
                    <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center text-xs">
                            <FiTag />
                          </div>
                          Assigned Servicing Vendor
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-extrabold text-slate-900">
                          {selectedBooking.vendorId?.storeName || selectedBooking.vendorId?.name || 'Certified Vendor'}
                        </p>
                        <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 mt-1">
                          <FiPhone className="text-slate-400 text-xs" />
                          <span>{selectedBooking.vendorId?.phone || selectedBooking.vendorId?.email || 'N/A'}</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Location & Schedule */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Service Address */}
                    <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center text-xs">
                            <FiMapPin />
                          </div>
                          Service Address
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md">
                          Pincode: {selectedBooking.pincode}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-slate-700 leading-relaxed">
                        {selectedBooking.serviceAddress?.address}, {selectedBooking.serviceAddress?.city}, {selectedBooking.serviceAddress?.state} - <span className="font-bold text-slate-900">{selectedBooking.pincode}</span>
                      </p>
                    </div>

                    {/* Scheduled Slot */}
                    <div className="p-4 bg-gradient-to-br from-blue-50/80 to-blue-50/20 rounded-2xl border border-blue-100 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center text-base shadow-xs shrink-0">
                        <FiCalendar />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Scheduled Date & Time</p>
                        <p className="text-xs font-extrabold text-slate-900 truncate">
                          {selectedBooking.bookingDate ? new Date(selectedBooking.bookingDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                        </p>
                        <p className="text-[11px] font-semibold text-slate-600 truncate">{selectedBooking.timeSlot}</p>
                      </div>
                    </div>
                  </div>

                  {/* Dynamic Specifications */}
                  {customFieldsEntries.length > 0 && (
                    <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs space-y-2.5">
                      <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                        <FiFileText className="text-amber-500" /> Customer Provided Specifications
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {customFieldsEntries.map(([key, val]) => (
                          <div key={key} className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">
                              {key.replace(/_/g, ' ')}
                            </span>
                            <span className="text-xs font-bold text-slate-900">{String(val)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Financial Breakdown */}
                  <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl p-5 shadow-lg border border-slate-700/70 space-y-3.5">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-700/80">
                      <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <FiDollarSign className="text-emerald-400" /> Financial Audit & Tax Breakdown
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-white/10 text-slate-300 rounded uppercase">
                          {selectedBooking.paymentMethod || 'COD'}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                          String(selectedBooking.paymentStatus).toLowerCase() === 'paid'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        }`}>
                          {selectedBooking.paymentStatus || 'Pending'}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between text-slate-300">
                        <span className="text-slate-400">Unit Rate (x{selectedBooking.quantity || 1})</span>
                        <span className="font-mono font-medium">₹{Number((selectedBooking.pricing?.unitPrice || 0) * (selectedBooking.quantity || 1)).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span className="text-slate-400">Estimated Taxes & GST (18%)</span>
                        <span className="font-mono font-medium">₹{Number(selectedBooking.pricing?.tax || 0).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="pt-2.5 border-t border-slate-700/80 flex justify-between items-center">
                        <span className="font-bold text-sm text-white">Total Booking Amount</span>
                        <span className="font-mono font-extrabold text-base text-emerald-400">
                          ₹{Number(selectedBooking.pricing?.total || 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Vendor Operational Notes */}
                  {selectedBooking.vendorNotes && (
                    <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs space-y-1.5">
                      <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <FiFileText className="text-slate-400" /> Vendor Operational Notes
                      </h3>
                      <p className="text-xs font-medium text-slate-800 italic bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                        "{selectedBooking.vendorNotes}"
                      </p>
                    </div>
                  )}
                </>
              ) : (
                /* Audit Timeline */
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                    Complete Audit Status History
                  </h3>
                  {(!selectedBooking.statusHistory || selectedBooking.statusHistory.length === 0) ? (
                    <div className="p-6 bg-white rounded-2xl border border-slate-200 text-xs text-slate-500 text-center space-y-1">
                      <p className="font-semibold text-slate-700">No status changes recorded yet</p>
                      <p className="text-[11px] text-slate-400">Booking created on {new Date(selectedBooking.createdAt).toLocaleString('en-IN')}</p>
                    </div>
                  ) : (
                    <div className="relative border-l-2 border-slate-200 ml-3 pl-6 space-y-5">
                      {selectedBooking.statusHistory.map((item, idx) => (
                        <div key={idx} className="relative">
                          <div className="absolute -left-[31px] top-1 w-3.5 h-3.5 bg-rose-600 rounded-full border-2 border-white shadow-xs" />
                          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-extrabold text-slate-900 uppercase">
                                {item.newStatus}
                              </span>
                              <span className="text-[10px] text-slate-400 font-medium">
                                {new Date(item.changedAt).toLocaleString('en-IN')}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600">{item.note || 'Status transition executed'}</p>
                            <span className="text-[10px] font-semibold text-slate-400 block pt-1 border-t border-slate-100">
                              Actor Role: <strong className="text-slate-700 uppercase">{item.changedByRole || 'System'}</strong>
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Read-Only Footer */}
            <div className="p-4 sm:p-5 bg-white border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedBooking(null)}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs"
              >
                Close Audit View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminServiceBookings;
