import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiTool,
  FiSearch,
  FiFilter,
  FiCheckCircle,
  FiXCircle,
  FiClock,
  FiEye,
  FiLayers,
  FiUser,
} from "react-icons/fi";
import { getAdminServiceRequests } from "../../services/adminService";
import { useCategoryStore } from "../../../../shared/store/categoryStore";
import Pagination from "../../components/Pagination";
import AdminServiceRequestModal from "../../components/AdminServiceRequestModal";
import AnimatedSelect from "../../components/AnimatedSelect";

const AdminServiceRequests = () => {
  const { categories, initialize } = useCategoryStore();
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRequest, setSelectedRequest] = useState(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    initialize();
  }, [initialize]);

  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      const params = {};
      if (statusFilter !== "all") params.status = statusFilter;
      if (selectedCategory !== "all") params.categoryId = selectedCategory;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await getAdminServiceRequests(params);
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
  }, [statusFilter, selectedCategory, searchQuery]);

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
            <span>PENDING</span>
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
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-3">
          <FiTool className="text-primary-600" />
          Vendor Service Requests
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Review, approve, or reject new platform service master requests submitted by vendors.
        </p>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <FiSearch className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 text-lg" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by requested service name..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm text-gray-800"
            />
          </div>

          {/* Category Filter */}
          <AnimatedSelect
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setCurrentPage(1);
            }}
            options={[
              { value: "all", label: "All Service Categories" },
              ...categories.map((c) => ({
                value: String(c._id || c.id),
                label: c.name,
              })),
            ]}
            className="w-full sm:w-56"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
          {[
            { key: "all", label: "All Requests" },
            { key: "pending", label: "Pending Review" },
            { key: "approved", label: "Approved" },
            { key: "rejected", label: "Rejected" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setStatusFilter(tab.key);
                setCurrentPage(1);
              }}
              className={`px-4 py-1.5 text-xs font-bold rounded-xl transition-all ${
                statusFilter === tab.key
                  ? "bg-gray-900 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Requests Table */}
      {isLoading ? (
        <div className="text-center py-16">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-primary-500 border-t-transparent mb-3"></div>
          <p className="text-gray-500 text-sm">Loading service requests...</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-16 px-4 bg-white rounded-2xl border border-gray-200 shadow-sm">
          <FiTool className="mx-auto text-5xl text-gray-300 mb-3" />
          <h3 className="text-lg font-bold text-gray-800">No service requests found</h3>
          <p className="text-sm text-gray-600 mt-1 max-w-md mx-auto">
            {searchQuery || selectedCategory !== "all" || statusFilter !== "all"
              ? "Try adjusting your search or filters."
              : "There are currently no pending or submitted service requests from vendors."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Requested Service</th>
                  <th className="py-3.5 px-4">Vendor Store</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Date</th>
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
                          <p className="text-[11px] text-gray-500">ID: #{req._id?.slice(-6)}</p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <FiUser className="text-gray-400" />
                        <div>
                          <p className="font-bold text-gray-800 text-xs">{req.vendorId?.storeName || req.vendorId?.name || "Vendor"}</p>
                          <p className="text-[10px] text-gray-500">{req.vendorId?.email}</p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 bg-gray-100 px-2.5 py-1 rounded-lg">
                        <FiLayers className="text-gray-400" />
                        {req.categoryId?.name || "Category"}
                      </span>
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
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 hover:bg-primary-100 text-primary-700 text-xs font-bold rounded-lg transition-colors"
                      >
                        <FiEye />
                        <span>Review</span>
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

      {/* Admin Review & Approval Modal */}
      <AnimatePresence>
        {selectedRequest && (
          <AdminServiceRequestModal
            request={selectedRequest}
            onClose={() => setSelectedRequest(null)}
            onSuccess={() => {
              setSelectedRequest(null);
              fetchRequests();
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default AdminServiceRequests;
