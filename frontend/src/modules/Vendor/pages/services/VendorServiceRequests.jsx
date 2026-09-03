import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiTool,
  FiPlus,
  FiClock,
  FiCheckCircle,
  FiXCircle,
  FiAlertCircle,
  FiEye,
  FiLayers,
  FiDollarSign,
  FiX,
} from "react-icons/fi";
import { getVendorServiceRequests } from "../../services/vendorService";
import Pagination from "../../../Admin/components/Pagination";

const VendorServiceRequests = () => {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedRequest, setSelectedRequest] = useState(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      const params = {};
      if (statusFilter !== "all") params.status = statusFilter;

      const res = await getVendorServiceRequests(params);
      const payload = res?.data ?? res ?? {};
      setRequests(payload.requests || (Array.isArray(payload) ? payload : []));
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [statusFilter]);

  // Paginated list
  const totalPages = Math.ceil(requests.length / itemsPerPage) || 1;
  const paginatedRequests = requests.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getStatusBadge = (status) => {
    switch (status) {
      case "approved":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <FiCheckCircle className="text-xs" />
            <span>APPROVED</span>
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
            <FiXCircle className="text-xs" />
            <span>REJECTED</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <FiClock className="text-xs" />
            <span>PENDING REVIEW</span>
          </span>
        );
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 p-4 sm:p-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-3">
            <FiTool className="text-primary-600" />
            My Service Requests
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Track status of new platform services requested for Admin review.
          </p>
        </div>

        <button
          onClick={() => navigate("/vendor/services/request-new")}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary-600 to-primary-700 text-white text-sm font-bold rounded-xl hover:from-primary-500 hover:to-primary-600 transition-all shadow-md"
        >
          <FiPlus />
          <span>Request New Service</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-3 overflow-x-auto scrollbar-none">
        {[
          { key: "all", label: "All Requests" },
          { key: "pending", label: "Pending" },
          { key: "approved", label: "Approved" },
          { key: "rejected", label: "Rejected" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setStatusFilter(tab.key);
              setCurrentPage(1);
            }}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap ${
              statusFilter === tab.key
                ? "bg-gray-900 text-white shadow-sm"
                : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Requests Table / List */}
      {isLoading ? (
        <div className="text-center py-16">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-primary-500 border-t-transparent mb-3"></div>
          <p className="text-gray-500 text-sm">Loading your service requests...</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-16 px-4 bg-white rounded-2xl border border-gray-200 shadow-sm">
          <FiTool className="mx-auto text-5xl text-gray-300 mb-3" />
          <h3 className="text-lg font-bold text-gray-800">You haven't submitted any service requests yet</h3>
          <p className="text-sm text-gray-600 mt-1 max-w-md mx-auto">
            Need a service master that doesn't exist on the platform? Click "Request New Service" to submit a request for Admin review.
          </p>
          <button
            onClick={() => navigate("/vendor/services/request-new")}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-xs font-bold rounded-xl hover:bg-primary-700 transition-colors shadow-sm"
          >
            <FiPlus />
            <span>Submit First Request</span>
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Service Name</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">Pricing Type</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Submitted Date</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {paginatedRequests.map((req) => (
                  <tr key={req._id || req.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        {req.image ? (
                          <img
                            src={req.image}
                            alt={req.serviceName}
                            className="w-10 h-10 object-cover rounded-xl border border-gray-200 flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-primary-50 text-primary-600 rounded-xl flex items-center justify-center font-bold text-sm border border-primary-100 flex-shrink-0">
                            {(req.serviceName || "S").charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-bold text-gray-900 text-sm line-clamp-1">{req.serviceName}</p>
                          {req.shortDescription && (
                            <p className="text-xs text-gray-500 line-clamp-1">{req.shortDescription}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 bg-gray-100 px-2.5 py-1 rounded-lg">
                        <FiLayers className="text-gray-400" />
                        {req.categoryId?.name || "Service Category"}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-xs font-medium text-gray-600">
                      {req.pricingType || "FIXED"}
                    </td>

                    <td className="py-3.5 px-4">{getStatusBadge(req.status)}</td>

                    <td className="py-3.5 px-4 text-xs text-gray-500">
                      {new Date(req.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => setSelectedRequest(req)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition-colors"
                      >
                        <FiEye />
                        <span>Details</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {requests.length > itemsPerPage && (
            <div className="p-4 border-t border-gray-200">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={requests.length}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </div>
      )}

      {/* Details Modal */}
      <AnimatePresence>
        {selectedRequest && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl p-6 space-y-5"
            >
              <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-bold text-gray-900">{selectedRequest.serviceName}</h3>
                  {getStatusBadge(selectedRequest.status)}
                </div>
                <button
                  onClick={() => setSelectedRequest(null)}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
                >
                  <FiX className="text-xl" />
                </button>
              </div>

              {/* Rejection Reason Alert if rejected */}
              {selectedRequest.status === "rejected" && selectedRequest.rejectionReason && (
                <div className="p-4 bg-red-50 rounded-xl border border-red-200 text-red-700 text-sm space-y-1">
                  <p className="font-bold flex items-center gap-2">
                    <FiAlertCircle /> Rejection Reason from Admin:
                  </p>
                  <p className="text-xs text-red-600 pl-6">{selectedRequest.rejectionReason}</p>
                </div>
              )}

              {/* Request Parameters Grid */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-gray-500">Service Category:</span>
                  <p className="font-bold text-gray-800">{selectedRequest.categoryId?.name || "N/A"}</p>
                </div>
                <div>
                  <span className="text-gray-500">Pricing Type:</span>
                  <p className="font-bold text-gray-800">{selectedRequest.pricingType}</p>
                </div>
                <div>
                  <span className="text-gray-500">Suggested Price:</span>
                  <p className="font-bold text-gray-800">
                    {selectedRequest.suggestedPrice ? `₹${selectedRequest.suggestedPrice}` : "N/A"}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Booking Type:</span>
                  <p className="font-bold text-gray-800">{selectedRequest.bookingType}</p>
                </div>
                <div>
                  <span className="text-gray-500">Estimated Duration:</span>
                  <p className="font-bold text-gray-800">{selectedRequest.estimatedDuration || "N/A"}</p>
                </div>
                <div>
                  <span className="text-gray-500">Submitted On:</span>
                  <p className="font-bold text-gray-800">
                    {new Date(selectedRequest.createdAt).toLocaleString("en-IN")}
                  </p>
                </div>
              </div>

              {selectedRequest.description && (
                <div>
                  <span className="text-xs text-gray-500 font-semibold block mb-1">Description:</span>
                  <p className="text-xs text-gray-700 bg-gray-50 p-3 rounded-xl border border-gray-200">
                    {selectedRequest.description}
                  </p>
                </div>
              )}

              {/* Suggested Service Fields */}
              {selectedRequest.serviceFields && selectedRequest.serviceFields.length > 0 && (
                <div>
                  <span className="text-xs text-gray-500 font-semibold block mb-1">
                    Suggested Custom Form Fields ({selectedRequest.serviceFields.length}):
                  </span>
                  <div className="space-y-2">
                    {selectedRequest.serviceFields.map((f, i) => (
                      <div key={i} className="p-2.5 bg-gray-50 rounded-lg border border-gray-200 text-xs flex items-center justify-between">
                        <div>
                          <span className="font-bold text-gray-800">{f.label}</span>
                          <span className="ml-2 text-[10px] text-gray-500">({f.type})</span>
                        </div>
                        {f.required && (
                          <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold">Required</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedRequest.additionalNotes && (
                <div>
                  <span className="text-xs text-gray-500 font-semibold block mb-1">Additional Notes:</span>
                  <p className="text-xs text-gray-700 bg-gray-50 p-3 rounded-xl border border-gray-200">
                    {selectedRequest.additionalNotes}
                  </p>
                </div>
              )}

              <div className="flex justify-end pt-3 border-t border-gray-200">
                <button
                  onClick={() => setSelectedRequest(null)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-xl transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default VendorServiceRequests;
