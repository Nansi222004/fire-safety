import { useState } from 'react';
import {
  FiX,
  FiUser,
  FiPhone,
  FiMapPin,
  FiCalendar,
  FiClock,
  FiCheckCircle,
  FiXCircle,
  FiPlay,
  FiAlertTriangle,
  FiFileText,
  FiCheck,
  FiDollarSign,
  FiTag,
  FiChevronRight,
  FiSave,
  FiShield,
  FiActivity
} from 'react-icons/fi';
import toast from 'react-hot-toast';

const VendorServiceBookingModal = ({ booking, onClose, onStatusUpdated, onNotesUpdated }) => {
  const [activeTab, setActiveTab] = useState('details');
  const [updating, setUpdating] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [vendorNotesInput, setVendorNotesInput] = useState(booking?.vendorNotes || '');
  const [savingNotes, setSavingNotes] = useState(false);

  if (!booking) return null;

  const currentStatus = String(booking.status || 'pending').toLowerCase();

  const handleStatusChange = async (targetStatus, reason = '') => {
    setUpdating(true);
    try {
      await onStatusUpdated(booking._id, targetStatus, reason);
      setShowCancelPrompt(false);
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to update status.');
    } finally {
      setUpdating(false);
    }
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await onNotesUpdated(booking._id, vendorNotesInput);
      toast.success('Operational notes saved successfully!');
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to save notes.');
    } finally {
      setSavingNotes(false);
    }
  };

  const getStatusBadge = (status) => {
    const s = String(status || '').toLowerCase();
    switch (s) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 text-amber-600 text-xs font-bold rounded-full border border-amber-500/20 backdrop-blur-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
            Pending Confirmation
          </span>
        );
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 text-blue-600 text-xs font-bold rounded-full border border-blue-500/20">
            <FiCheckCircle className="text-blue-500" />
            Confirmed
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-500/10 text-purple-600 text-xs font-bold rounded-full border border-purple-500/20">
            <FiPlay className="text-purple-500" />
            In Progress
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-600 text-xs font-bold rounded-full border border-emerald-500/20">
            <FiCheck className="text-emerald-500" />
            Completed
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-500/10 text-rose-600 text-xs font-bold rounded-full border border-rose-500/20">
            <FiXCircle className="text-rose-500" />
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-3 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-full">
            {status}
          </span>
        );
    }
  };

  const customFieldsMap = booking.customFields || {};
  const customFieldsEntries = Object.entries(
    customFieldsMap instanceof Map ? Object.fromEntries(customFieldsMap) : customFieldsMap
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200/80 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between border-b border-slate-700/80 relative">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-[11px] font-mono font-semibold text-slate-400 bg-white/5 px-2.5 py-0.5 rounded-md border border-white/10">
                #{booking.bookingId}
              </span>
              {getStatusBadge(booking.status)}
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight capitalize">
              {booking.serviceName}
            </h2>
          </div>
          
          <button
            onClick={onClose}
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
              onClick={() => setActiveTab('details')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeTab === 'details'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
              }`}
            >
              <FiFileText className={activeTab === 'details' ? 'text-rose-600' : 'text-slate-400'} />
              <span>Booking Details</span>
            </button>
            <button
              onClick={() => setActiveTab('timeline')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeTab === 'timeline'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
              }`}
            >
              <FiActivity className={activeTab === 'timeline' ? 'text-rose-600' : 'text-slate-400'} />
              <span>Timeline ({booking.statusHistory?.length || 1})</span>
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5 bg-slate-50/30">
          {activeTab === 'details' ? (
            <>
              {/* Customer & Location Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Customer Info Card */}
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
                      {booking.serviceAddress?.fullName || booking.userId?.name || 'Customer'}
                    </p>
                    <a
                      href={`tel:${booking.serviceAddress?.phone || booking.userId?.phone || ''}`}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline mt-1"
                    >
                      <FiPhone className="text-slate-400 text-xs" />
                      <span>{booking.serviceAddress?.phone || booking.userId?.phone || 'N/A'}</span>
                    </a>
                  </div>
                </div>

                {/* Service Location Card */}
                <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center text-xs">
                        <FiMapPin />
                      </div>
                      Service Location
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md">
                      Pincode: {booking.pincode}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-slate-700 leading-relaxed">
                    {booking.serviceAddress?.address}, {booking.serviceAddress?.city}, {booking.serviceAddress?.state} - <span className="font-bold text-slate-900">{booking.pincode}</span>
                  </p>
                </div>
              </div>

              {/* Service Schedule, Slot & Variant Badges */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 bg-gradient-to-br from-blue-50/80 to-blue-50/20 rounded-2xl border border-blue-100 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center text-base shadow-xs shrink-0">
                    <FiCalendar />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Scheduled Date</p>
                    <p className="text-xs font-extrabold text-slate-900 truncate">
                      {booking.bookingDate ? new Date(booking.bookingDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                    </p>
                  </div>
                </div>

                <div className="p-3.5 bg-gradient-to-br from-purple-50/80 to-purple-50/20 rounded-2xl border border-purple-100 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center text-base shadow-xs shrink-0">
                    <FiClock />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-purple-600 uppercase tracking-wider">Time Slot</p>
                    <p className="text-xs font-extrabold text-slate-900 truncate">{booking.timeSlot}</p>
                  </div>
                </div>

                <div className="p-3.5 bg-gradient-to-br from-emerald-50/80 to-emerald-50/20 rounded-2xl border border-emerald-100 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-base shadow-xs shrink-0">
                    <FiTag />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Variant & Qty</p>
                    <p className="text-xs font-extrabold text-slate-900 truncate">
                      {booking.variant?.label || 'Standard'} <span className="text-slate-500 font-semibold">(x{booking.quantity || 1})</span>
                    </p>
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

              {/* Payment & Financial Breakdown */}
              <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl p-5 shadow-lg border border-slate-700/70 space-y-3.5">
                <div className="flex items-center justify-between pb-2 border-b border-slate-700/80">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <FiDollarSign className="text-emerald-400" /> Payment & Billing Breakdown
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-white/10 text-slate-300 rounded uppercase">
                      {booking.paymentMethod || 'COD'}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                      String(booking.paymentStatus).toLowerCase() === 'paid'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}>
                      {booking.paymentStatus || 'Pending'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-400">Unit Rate (x{booking.quantity || 1})</span>
                    <span className="font-mono font-medium">₹{Number((booking.pricing?.unitPrice || 0) * (booking.quantity || 1)).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-400">Estimated Taxes & GST (18%)</span>
                    <span className="font-mono font-medium">₹{Number(booking.pricing?.tax || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="pt-2.5 border-t border-slate-700/80 flex justify-between items-center">
                    <span className="font-bold text-sm text-white">Total Amount Payable</span>
                    <span className="font-mono font-extrabold text-base text-emerald-400">
                      ₹{Number(booking.pricing?.total || 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Operational / Technician Notes */}
              <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <FiFileText className="text-slate-400" /> Operational & Dispatch Notes
                  </h3>
                  <span className="text-[10px] text-slate-400 font-medium">Visible to your technicians</span>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-2">
                  <textarea
                    rows={2}
                    value={vendorNotesInput}
                    onChange={(e) => setVendorNotesInput(e.target.value)}
                    placeholder="e.g. Technician Assigned: Ramesh Sharma (+91 98765 43210)"
                    className="flex-1 text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-slate-50/50 resize-none font-medium text-slate-800"
                  />
                  <button
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 self-stretch sm:self-end cursor-pointer disabled:opacity-50 shadow-2xs"
                  >
                    <FiSave className={savingNotes ? 'animate-spin' : ''} />
                    <span>{savingNotes ? 'Saving...' : 'Save Notes'}</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* Status History Timeline Tab */
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                Lifecycle & Audit State Transitions
              </h3>
              
              {(!booking.statusHistory || booking.statusHistory.length === 0) ? (
                <div className="p-6 bg-white rounded-2xl border border-slate-200 text-xs text-slate-500 text-center space-y-1">
                  <p className="font-semibold text-slate-700">No status transitions recorded yet</p>
                  <p className="text-[11px] text-slate-400">Created on {new Date(booking.createdAt).toLocaleString('en-IN')}</p>
                </div>
              ) : (
                <div className="relative border-l-2 border-slate-200 ml-3 pl-6 space-y-5">
                  {booking.statusHistory.map((item, idx) => (
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

        {/* Modal Action Footer */}
        <div className="p-4 sm:p-5 bg-white border-t border-slate-200 flex items-center justify-between flex-wrap gap-3">
          {showCancelPrompt ? (
            <div className="w-full flex flex-col sm:flex-row items-center gap-2">
              <input
                type="text"
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="Enter mandatory reason for cancellation..."
                className="w-full sm:flex-1 text-xs px-3.5 py-2.5 border border-rose-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 bg-rose-50/30"
              />
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  onClick={() => handleStatusChange('cancelled', cancellationReason)}
                  disabled={updating || !cancellationReason.trim()}
                  className="flex-1 sm:flex-none px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {updating ? 'Cancelling...' : 'Confirm Cancel'}
                </button>
                <button
                  onClick={() => setShowCancelPrompt(false)}
                  className="flex-1 sm:flex-none px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Back
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500">Current Status:</span>
                {getStatusBadge(currentStatus)}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {currentStatus === 'pending' && (
                  <>
                    <button
                      onClick={() => handleStatusChange('confirmed')}
                      disabled={updating}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                    >
                      <FiCheckCircle className="text-sm" />
                      <span>{updating ? 'Updating...' : 'Confirm Booking'}</span>
                    </button>
                    <button
                      onClick={() => setShowCancelPrompt(true)}
                      disabled={updating}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl border border-rose-200 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <FiXCircle className="text-sm" />
                      <span>Cancel</span>
                    </button>
                  </>
                )}

                {currentStatus === 'confirmed' && (
                  <>
                    <button
                      onClick={() => handleStatusChange('in_progress')}
                      disabled={updating}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                    >
                      <FiPlay className="text-sm" />
                      <span>{updating ? 'Updating...' : 'Start Service'}</span>
                    </button>
                    <button
                      onClick={() => setShowCancelPrompt(true)}
                      disabled={updating}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl border border-rose-200 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <FiXCircle className="text-sm" />
                      <span>Cancel</span>
                    </button>
                  </>
                )}

                {currentStatus === 'in_progress' && (
                  <>
                    <button
                      onClick={() => handleStatusChange('completed')}
                      disabled={updating}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                    >
                      <FiCheck className="text-sm" />
                      <span>{updating ? 'Updating...' : 'Complete Service'}</span>
                    </button>
                    <button
                      onClick={() => setShowCancelPrompt(true)}
                      disabled={updating}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl border border-rose-200 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <FiXCircle className="text-sm" />
                      <span>Cancel</span>
                    </button>
                  </>
                )}

                {(currentStatus === 'completed' || currentStatus === 'cancelled') && (
                  <span className="text-xs text-slate-400 font-semibold italic">
                    No further operational transitions available.
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default VendorServiceBookingModal;

