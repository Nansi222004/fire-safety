import { useState, useEffect } from 'react';
import {
  FiCalendar,
  FiSearch,
  FiFilter,
  FiClock,
  FiMapPin,
  FiUser,
  FiPhone,
  FiCheckCircle,
  FiAlertCircle,
  FiRefreshCw,
  FiChevronLeft,
  FiChevronRight,
  FiEye
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import {
  getVendorServiceBookings,
  getVendorServiceBookingById,
  updateVendorServiceBookingStatus,
  updateVendorServiceBookingNotes
} from '../../services/vendorService';
import VendorServiceBookingModal from '../../components/Services/VendorServiceBookingModal';

const VendorServiceBookings = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1, limit: 10 });
  const [selectedBooking, setSelectedBooking] = useState(null);

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const res = await getVendorServiceBookings({
        status: selectedStatus,
        search: searchQuery,
        date: selectedDate,
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
      toast.error(err?.response?.data?.message || 'Failed to fetch service bookings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, [selectedStatus, page, selectedDate]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchBookings();
  };

  const handleOpenBooking = async (id) => {
    try {
      const res = await getVendorServiceBookingById(id);
      const bookingData = res?.data?.data?.booking || res?.data?.booking || res?.booking || res?.data || res || null;
      setSelectedBooking(bookingData);
    } catch (err) {
      toast.error('Failed to load booking details.');
    }
  };

  const handleStatusUpdated = async (bookingId, targetStatus, cancellationReason = '') => {
    const res = await updateVendorServiceBookingStatus(bookingId, {
      status: targetStatus,
      cancellationReason,
    });

    toast.success(`Booking status updated to ${targetStatus.toUpperCase()}!`);
    fetchBookings();

    if (selectedBooking && selectedBooking._id === bookingId) {
      const updatedRes = await getVendorServiceBookingById(bookingId);
      const bookingData = updatedRes?.data?.data?.booking || updatedRes?.data?.booking || updatedRes?.booking || updatedRes?.data || updatedRes || null;
      setSelectedBooking(bookingData);
    }
  };

  const handleNotesUpdated = async (bookingId, notes) => {
    await updateVendorServiceBookingNotes(bookingId, notes);
    if (selectedBooking && selectedBooking._id === bookingId) {
      setSelectedBooking({ ...selectedBooking, vendorNotes: notes });
    }
  };

  const getStatusBadge = (status) => {
    const s = String(status || '').toLowerCase();
    switch (s) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 text-[11px] font-bold rounded-full border border-amber-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Pending
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

  const statusTabs = [
    { key: 'all', label: 'All Bookings' },
    { key: 'pending', label: 'Pending' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'completed', label: 'Completed' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Service Bookings</h1>
          <p className="text-sm font-medium text-gray-500 mt-0.5">
            Manage incoming customer service appointments, scheduled slots, and operational status transitions
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

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-gray-200">
        {statusTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setSelectedStatus(tab.key);
              setPage(1);
            }}
            className={`px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
              selectedStatus === tab.key
                ? 'bg-gray-900 text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search & Date Filter Bar */}
      <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative sm:col-span-2">
          <FiSearch className="absolute left-3.5 top-3 text-gray-400 text-sm" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Booking ID, Customer Name, Phone, Pincode..."
            className="w-full text-xs pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 shadow-2xs"
          />
        </div>

        <div className="flex gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setPage(1);
            }}
            className="w-full text-xs px-3 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 shadow-2xs text-gray-700"
          />
          {selectedDate && (
            <button
              type="button"
              onClick={() => {
                setSelectedDate('');
                setPage(1);
              }}
              className="text-xs px-3 py-2.5 bg-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-300"
            >
              Clear
            </button>
          )}
        </div>
      </form>

      {/* Bookings Table / List */}
      {loading ? (
        <div className="py-16 text-center">
          <div className="w-8 h-8 border-3 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs font-semibold text-gray-500">Loading service bookings...</p>
        </div>
      ) : bookings.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-2xl border border-gray-200/80 p-8 shadow-2xs">
          <FiAlertCircle className="text-4xl text-gray-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-gray-800">No Service Bookings Found</h3>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
            {selectedStatus !== 'all'
              ? `There are currently no bookings with status "${selectedStatus.toUpperCase()}".`
              : 'You do not have any incoming service bookings matching your current filters.'}
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
                  <th className="py-3 px-4">Service & Variant</th>
                  <th className="py-3 px-4">Scheduled Date & Slot</th>
                  <th className="py-3 px-4">Pincode</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
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
                        <span>Manage</span>
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
                Page {pagination.page} of {pagination.pages} ({pagination.total} total bookings)
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

      {/* Booking Management Modal */}
      {selectedBooking && (
        <VendorServiceBookingModal
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
          onStatusUpdated={handleStatusUpdated}
          onNotesUpdated={handleNotesUpdated}
        />
      )}
    </div>
  );
};

export default VendorServiceBookings;
