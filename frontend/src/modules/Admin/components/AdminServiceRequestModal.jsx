import { useState } from "react";
import { motion } from "framer-motion";
import {
  FiX,
  FiCheckCircle,
  FiXCircle,
  FiAlertCircle,
  FiLayers,
  FiUser,
} from "react-icons/fi";
import { approveServiceRequest, rejectServiceRequest } from "../services/adminService";
import toast from "react-hot-toast";

const AdminServiceRequestModal = ({ request, onClose, onSuccess }) => {
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!request) return null;

  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      await approveServiceRequest(request._id || request.id);
      toast.success(`Service request approved and "${request.serviceName}" master created!`);
      onSuccess();
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to approve service request");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async (e) => {
    e.preventDefault();
    if (!rejectionReason.trim()) {
      toast.error("Please enter a rejection reason");
      return;
    }

    setIsSubmitting(true);
    try {
      await rejectServiceRequest(request._id || request.id, rejectionReason.trim());
      toast.success("Service request rejected.");
      onSuccess();
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to reject service request");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto"
    >
      <motion.div
        initial={{ scale: 0.95, y: 15 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 15 }}
        className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-200 pb-4">
          <div>
            <span className="text-xs font-semibold text-primary-600 uppercase tracking-wider">
              Vendor Service Request #{request._id?.slice(-6)}
            </span>
            <h2 className="text-xl font-bold text-gray-900 mt-0.5">{request.serviceName}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-xl transition-colors"
          >
            <FiX className="text-xl" />
          </button>
        </div>

        {/* Vendor Store Summary Banner */}
        <div className="p-4 bg-primary-50 rounded-2xl border border-primary-100 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-600 text-white rounded-xl flex items-center justify-center font-bold text-base shadow-sm">
              <FiUser />
            </div>
            <div>
              <p className="text-xs text-primary-700 font-medium">Requesting Vendor Store:</p>
              <p className="text-sm font-bold text-primary-900">
                {request.vendorId?.storeName || request.vendorId?.name || "Vendor Store"}
              </p>
              <p className="text-[11px] text-primary-600">{request.vendorId?.email}</p>
            </div>
          </div>

          <div className="text-right text-xs">
            <span className="text-gray-500">Submitted On:</span>
            <p className="font-bold text-gray-800">
              {new Date(request.createdAt).toLocaleString("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </div>
        </div>

        {/* Rejection Reason Input View */}
        {showRejectInput ? (
          <form onSubmit={handleReject} className="p-5 bg-red-50 rounded-2xl border border-red-200 space-y-4">
            <h3 className="text-base font-bold text-red-900 flex items-center gap-2">
              <FiXCircle />
              Provide Rejection Reason
            </h3>
            <p className="text-xs text-red-700">
              This reason will be displayed to the vendor so they understand why the request was rejected and what to correct.
            </p>
            <textarea
              rows={3}
              required
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Please fix the spelling in the service name and select Fixed Rate pricing before re-submitting."
              className="w-full p-3 bg-white border border-red-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowRejectInput(false)}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-xs font-semibold rounded-xl hover:bg-gray-50"
              >
                Back to Review
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50"
              >
                {isSubmitting ? "Rejecting..." : "Confirm Rejection"}
              </button>
            </div>
          </form>
        ) : (
          <>
            {/* Request Data Read-Only Review */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
                Vendor Submitted Specification (Read-Only)
              </h3>

              {/* Data Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-200">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1">Service Name</label>
                  <p className="text-sm font-bold text-gray-900">{request.serviceName}</p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1">Service Category</label>
                  <p className="text-sm font-bold text-gray-900">{request.categoryId?.name || "Fire Safety"}</p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1">Pricing Type</label>
                  <p className="text-xs font-bold text-gray-800">{request.pricingType}</p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1">Suggested Rate (₹)</label>
                  <p className="text-xs font-bold text-gray-800">₹{request.suggestedPrice || 0}</p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1">Booking Type</label>
                  <p className="text-xs font-bold text-gray-800">{request.bookingType}</p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1">Estimated Duration</label>
                  <p className="text-xs font-bold text-gray-800">{request.estimatedDuration || "N/A"}</p>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Detailed Description</label>
                <p className="text-xs text-gray-700 bg-gray-50 p-3 rounded-xl border border-gray-200">
                  {request.description || "No description provided."}
                </p>
              </div>

              {/* Vendor Suggested Dynamic Form Fields */}
              {request.serviceFields && request.serviceFields.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Suggested Dynamic Service Fields ({request.serviceFields.length})
                  </label>
                  <div className="space-y-2">
                    {request.serviceFields.map((f, i) => (
                      <div key={i} className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs flex items-center justify-between">
                        <div>
                          <span className="font-bold text-gray-900">{f.label}</span>
                          <span className="ml-2 text-[11px] text-gray-500">Key: `{f.key}` ({f.type})</span>
                        </div>
                        {f.required && (
                          <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold">Required</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {request.additionalNotes && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Vendor Additional Notes</label>
                  <p className="text-xs text-gray-700 bg-amber-50 p-3 rounded-xl border border-amber-200">
                    {request.additionalNotes}
                  </p>
                </div>
              )}
            </div>

            {/* Approval / Rejection Footer Actions */}
            {request.status === "pending" ? (
              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowRejectInput(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-xl transition-colors border border-red-200"
                >
                  <FiXCircle />
                  <span>Reject Request</span>
                </button>

                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white text-xs font-bold rounded-xl hover:from-emerald-500 hover:to-emerald-600 transition-all shadow-md disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span>Approving & Creating Service...</span>
                  ) : (
                    <>
                      <FiCheckCircle />
                      <span>Approve & Create Service Master</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="flex justify-end pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-xl"
                >
                  Close
                </button>
              </div>
            )}
          </>
        )}
      </motion.div>
    </motion.div>
  );
};

export default AdminServiceRequestModal;
