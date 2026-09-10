import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FiSearch, FiEye, FiCheck, FiX, FiRefreshCw } from "react-icons/fi";
import { motion } from "framer-motion";
import DataTable from "../../Admin/components/DataTable";
import ExportButton from "../../Admin/components/ExportButton";
import Badge from "../../../shared/components/Badge";
import AnimatedSelect from "../../Admin/components/AnimatedSelect";
import { formatPrice } from "../../../shared/utils/helpers";
import { useVendorAuthStore } from "../store/vendorAuthStore";
import {
  getAllVendorReturnRequests,
  updateVendorReturnRequestStatus,
} from "../services/vendorService";
import { getSocket, joinRoom, leaveRoom } from "../../../shared/utils/socket";
import toast from "react-hot-toast";
import { getStatusConfig } from "../../../shared/constants/returnExchangeConfig";

const ReturnRequests = () => {
  const navigate = useNavigate();
  const { vendor } = useVendorAuthStore();
  const [returnRequests, setReturnRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");

  const vendorId = vendor?.id;

  const fetchReturnRequests = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const res = await getAllVendorReturnRequests({ limit: 100 });
      const payload = res?.data ?? res;
      setReturnRequests(payload?.returnRequests ?? []);
    } catch {
      setReturnRequests([]);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!vendorId) {
      setReturnRequests([]);
      return;
    }
    fetchReturnRequests(true);
  }, [vendorId]);

  useEffect(() => {
    if (!vendorId) return;

    const token = localStorage.getItem('vendor-token') || localStorage.getItem('token');
    if (!token) return;

    const socket = getSocket(token);
    if (!socket) return;

    joinRoom(`vendor_${vendorId}`);

    const handleReturnUpdate = (updatedReturn) => {
      fetchReturnRequests(false);
    };

    socket.on('return_updated', handleReturnUpdate);

    return () => {
      socket.off('return_updated', handleReturnUpdate);
      leaveRoom(`vendor_${vendorId}`);
    };
  }, [vendorId]);

  // Filtered return requests
  const filteredRequests = useMemo(() => {
    let filtered = returnRequests;

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(
        (request) =>
          request.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
          request.orderId.toLowerCase().includes(searchQuery.toLowerCase()) ||
          request.customer.name
            .toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          request.customer.email
            .toLowerCase()
            .includes(searchQuery.toLowerCase())
      );
    }

    // Status filter
    if (selectedStatus !== "all") {
      filtered = filtered.filter(
        (request) => request.status === selectedStatus
      );
    }

    // Date filter
    if (dateFilter !== "all") {
      const now = new Date();
      const filterDate = new Date();

      switch (dateFilter) {
        case "today":
          filterDate.setHours(0, 0, 0, 0);
          filtered = filtered.filter(
            (request) => new Date(request.requestDate) >= filterDate
          );
          break;
        case "week":
          filterDate.setDate(now.getDate() - 7);
          filtered = filtered.filter(
            (request) => new Date(request.requestDate) >= filterDate
          );
          break;
        case "month":
          filterDate.setMonth(now.getMonth() - 1);
          filtered = filtered.filter(
            (request) => new Date(request.requestDate) >= filterDate
          );
          break;
        default:
          break;
      }
    }

    return filtered;
  }, [returnRequests, searchQuery, selectedStatus, dateFilter]);

  // Handle status update
  const handleStatusUpdate = async (
    requestId,
    newStatus,
    action = "",
    options = {}
  ) => {
    const statusData = { status: newStatus };
    if (newStatus === "approved" && action === "approve") {
      statusData.refundStatus = "pending";
    } else if (newStatus === "completed" && action === "process-refund") {
      statusData.refundStatus = "processed";
    }
    if (newStatus === "rejected" && options?.rejectionReason) {
      statusData.rejectionReason = options.rejectionReason;
    }

    try {
      const res = await updateVendorReturnRequestStatus(requestId, statusData);
      const updatedRequest = res?.data ?? res;
      setReturnRequests((prev) =>
        prev.map((request) =>
          request.id === requestId ? updatedRequest : request
        )
      );
    } catch {
      return;
    }

    const statusMessages = {
      approve: "Return request approved",
      reject: "Return request rejected",
      "process-refund": "Refund processed successfully",
    };

    toast.success(statusMessages[action] || "Status updated successfully");
  };

  // Get status badge variant
  const getStatusVariant = (status) => {
    const statusMap = {
      pending: "warning",
      approved: "success",
      rejected: "error",
      processing: "info",
      completed: "success",
    };
    return statusMap[status] || "warning";
  };

  // Table columns
  const columns = [
    {
      key: "id",
      label: "Request ID",
      sortable: true,
      render: (value, row) => (
        <div>
          <span className="font-semibold text-gray-800">{value}</span>
          <span className="block text-[10px] text-gray-500 uppercase tracking-wider mt-0.5 font-medium">
            {row.requestType === 'exchange' ? 'Exchange ID' : 'Return ID'}
          </span>
        </div>
      ),
    },
    {
      key: "requestType",
      label: "Type",
      sortable: true,
      render: (value) => {
        const isExchange = value === "exchange";
        return (
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${
            isExchange 
              ? 'bg-purple-50 text-purple-700 border-purple-200' 
              : 'bg-blue-50 text-blue-700 border-blue-200'
          }`}>
            {isExchange ? 'Exchange' : 'Return'}
          </span>
        );
      }
    },
    {
      key: "orderId",
      label: "Order ID",
      sortable: true,
      render: (value) => (
        <span
          className="text-blue-600 hover:text-blue-800 cursor-pointer font-medium"
          onClick={() => navigate(`/vendor/orders/${value}`)}>
          {value}
        </span>
      ),
    },
    {
      key: "customer",
      label: "Customer",
      sortable: true,
      render: (value) => (
        <div>
          <p className="font-medium text-gray-800">{value.name}</p>
          <p className="text-xs text-gray-500">{value.email}</p>
        </div>
      ),
    },
    {
      key: "requestDate",
      label: "Request Date",
      sortable: true,
      render: (value) => new Date(value).toLocaleDateString(),
    },
    {
      key: "items",
      label: "Items",
      sortable: false,
      render: (value, row) => {
        const count = Array.isArray(value) ? value.length : 0;
        const requestedSize = row.exchangeDetails?.requestedVariant?.size;
        return (
          <div>
            <span className="text-gray-800 font-medium">
              {count} item{count !== 1 ? "s" : ""}
            </span>
            {row.requestType === 'exchange' && requestedSize && (
              <span className="block text-[10px] text-purple-600 font-medium">New Size: {requestedSize}</span>
            )}
          </div>
        );
      },
    },
    {
      key: "reason",
      label: "Reason",
      sortable: true,
      render: (value) => <span className="text-sm text-gray-600 line-clamp-1 max-w-[150px]">{value}</span>,
    },
    {
      key: "refundAmount",
      label: "Financials",
      sortable: true,
      render: (value, row) => {
        if (row.requestType === 'exchange') {
          const diff = Number(row.exchangeDetails?.priceDelta || 0);
          if (diff === 0) {
            return <span className="text-gray-400 text-sm font-medium">Even Exchange</span>;
          } else if (diff > 0) {
            return (
              <div>
                <span className="font-bold text-amber-600">+{formatPrice(diff)}</span>
                <span className="block text-[9px] text-gray-400 font-medium">Customer owes</span>
              </div>
            );
          } else {
            return (
              <div>
                <span className="font-bold text-green-600">{formatPrice(Math.abs(diff))}</span>
                <span className="block text-[9px] text-gray-400 font-medium">Refund customer</span>
              </div>
            );
          }
        }
        return <span className="font-bold text-gray-800">{formatPrice(value)}</span>;
      },
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value, row) => {
        const config = getStatusConfig(value, row.requestType);
        return (
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${config.color}`}>
            {config.label}
          </span>
        );
      },
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/vendor/return-requests/${row.id}`)}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="View Details">
            <FiEye />
          </button>
          {row.status === "pending" && (
            <>
              <button
                onClick={() => {
                  if (
                    window.confirm(
                      `Are you sure you want to approve this ${row.requestType}?`
                    )
                  ) {
                    handleStatusUpdate(row.id, "approved", "approve");
                  }
                }}
                className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                title="Approve">
                <FiCheck />
              </button>
              <button
                onClick={() => {
                  if (
                    window.confirm(
                      `Are you sure you want to reject this ${row.requestType}?`
                    )
                  ) {
                    const reason = window.prompt(
                      "Optional rejection reason (visible in return details):",
                      ""
                    );
                    handleStatusUpdate(row.id, "rejected", "reject", {
                      rejectionReason: reason || "",
                    });
                  }
                }}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Reject">
                <FiX />
              </button>
            </>
          )}
          {row.status === "approved" && row.refundStatus === "pending" && row.requestType !== 'exchange' && (
            <button
              onClick={() => {
                if (window.confirm("Process refund for this return request?")) {
                  handleStatusUpdate(row.id, "completed", "process-refund");
                }
              }}
              className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
              title="Process Refund">
              <FiRefreshCw />
            </button>
          )}
        </div>
      ),
    },
  ];

  // Get status counts for stats
  const statusCounts = useMemo(() => {
    return {
      all: returnRequests.length,
      pending: returnRequests.filter((r) => r.status === "pending").length,
      approved: returnRequests.filter((r) => r.status === "approved").length,
      processing: returnRequests.filter((r) => r.status === "processing")
        .length,
      completed: returnRequests.filter((r) => r.status === "completed").length,
      rejected: returnRequests.filter((r) => r.status === "rejected").length,
    };
  }, [returnRequests]);

  if (!vendorId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Please log in to view return requests</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 sm:space-y-6 pb-6 px-1 sm:px-0">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4">
        <div className="lg:hidden">
          <h1 className="text-xl sm:text-3xl font-extrabold text-gray-900 tracking-tight mb-0.5 sm:mb-2">
            Returns & Exchanges
          </h1>
          <p className="text-xs sm:text-base text-gray-500">
            Manage and process customer return & exchange requests
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4">
        <div className="bg-white rounded-2xl sm:rounded-xl p-2.5 sm:p-4 shadow-xs sm:shadow-sm border border-gray-100 sm:border-gray-200 flex flex-col justify-between">
          <p className="text-[10px] sm:text-xs text-gray-500 font-bold uppercase tracking-wider mb-0.5 sm:mb-1">Total</p>
          <p className="text-base sm:text-2xl font-black text-gray-900 font-mono">
            {statusCounts.all}
          </p>
        </div>
        <div className="bg-white rounded-2xl sm:rounded-xl p-2.5 sm:p-4 shadow-xs sm:shadow-sm border border-gray-100 sm:border-gray-200 flex flex-col justify-between">
          <p className="text-[10px] sm:text-xs text-amber-700 font-bold uppercase tracking-wider mb-0.5 sm:mb-1">Pending</p>
          <p className="text-base sm:text-2xl font-black text-amber-600 font-mono">
            {statusCounts.pending}
          </p>
        </div>
        <div className="bg-white rounded-2xl sm:rounded-xl p-2.5 sm:p-4 shadow-xs sm:shadow-sm border border-gray-100 sm:border-gray-200 flex flex-col justify-between">
          <p className="text-[10px] sm:text-xs text-emerald-700 font-bold uppercase tracking-wider mb-0.5 sm:mb-1">Approved</p>
          <p className="text-base sm:text-2xl font-black text-emerald-600 font-mono">
            {statusCounts.approved}
          </p>
        </div>
        <div className="bg-white rounded-2xl sm:rounded-xl p-2.5 sm:p-4 shadow-xs sm:shadow-sm border border-gray-100 sm:border-gray-200 flex flex-col justify-between">
          <p className="text-[10px] sm:text-xs text-blue-700 font-bold uppercase tracking-wider mb-0.5 sm:mb-1">Processing</p>
          <p className="text-base sm:text-2xl font-black text-blue-600 font-mono">
            {statusCounts.processing}
          </p>
        </div>
        <div className="bg-white rounded-2xl sm:rounded-xl p-2.5 sm:p-4 shadow-xs sm:shadow-sm border border-gray-100 sm:border-gray-200 flex flex-col justify-between">
          <p className="text-[10px] sm:text-xs text-green-700 font-bold uppercase tracking-wider mb-0.5 sm:mb-1">Completed</p>
          <p className="text-base sm:text-2xl font-black text-green-600 font-mono">
            {statusCounts.completed}
          </p>
        </div>
        <div className="bg-white rounded-2xl sm:rounded-xl p-2.5 sm:p-4 shadow-xs sm:shadow-sm border border-gray-100 sm:border-gray-200 flex flex-col justify-between">
          <p className="text-[10px] sm:text-xs text-rose-700 font-bold uppercase tracking-wider mb-0.5 sm:mb-1">Rejected</p>
          <p className="text-base sm:text-2xl font-black text-rose-600 font-mono">
            {statusCounts.rejected}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl sm:rounded-xl p-3.5 sm:p-4 shadow-xs sm:shadow-sm border border-gray-100 sm:border-gray-200">
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 sm:gap-4">
          <div className="relative flex-1 w-full sm:min-w-[200px]">
            <FiSearch className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ID, order ID, name, or email..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs sm:text-sm"
            />
          </div>

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:gap-4 w-full sm:w-auto">
            <AnimatedSelect
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              options={[
                { value: "all", label: "All Status" },
                { value: "pending", label: "Pending" },
                { value: "approved", label: "Approved" },
                { value: "processing", label: "Processing" },
                { value: "completed", label: "Completed" },
                { value: "rejected", label: "Rejected" },
              ]}
              className="w-full sm:w-auto min-w-[130px] sm:min-w-[140px]"
            />

            <AnimatedSelect
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              options={[
                { value: "all", label: "All Time" },
                { value: "today", label: "Today" },
                { value: "week", label: "Last 7 Days" },
                { value: "month", label: "Last 30 Days" },
              ]}
              className="w-full sm:w-auto min-w-[130px] sm:min-w-[140px]"
            />
          </div>

          <div className="w-full sm:w-auto pt-1 sm:pt-0">
            <ExportButton
              data={filteredRequests}
              headers={[
                { label: "Return ID", accessor: (row) => row.id },
                { label: "Order ID", accessor: (row) => row.orderId },
                { label: "Customer", accessor: (row) => row.customer.name },
                { label: "Email", accessor: (row) => row.customer.email },
                {
                  label: "Request Date",
                  accessor: (row) =>
                    new Date(row.requestDate).toLocaleDateString(),
                },
                { label: "Items", accessor: (row) => row.items.length },
                { label: "Reason", accessor: (row) => row.reason },
                {
                  label: "Refund Amount",
                  accessor: (row) => formatPrice(row.refundAmount),
                },
                { label: "Status", accessor: (row) => row.status },
              ]}
              filename="vendor-return-requests"
            />
          </div>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="sm:hidden space-y-3">
        {isLoading ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-gray-100">
            <p className="text-gray-500 text-sm">Loading return requests...</p>
          </div>
        ) : filteredRequests.length > 0 ? (
          filteredRequests.map((request) => {
            const isExchange = request.requestType === "exchange";
            const config = getStatusConfig(request.status, request.requestType);
            const itemsCount = Array.isArray(request.items) ? request.items.length : 0;
            const requestedSize = request.exchangeDetails?.requestedVariant?.size;
            const diff = Number(request.exchangeDetails?.priceDelta || 0);

            return (
              <div
                key={request.id}
                onClick={() => navigate(`/vendor/return-requests/${request.id}`)}
                className="bg-white rounded-2xl p-3.5 shadow-xs border border-gray-100 hover:border-gray-200 transition-all space-y-3 active:scale-99 cursor-pointer">
                {/* Card Top Row: Type & Status */}
                <div className="flex items-center justify-between gap-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                    isExchange
                      ? "bg-purple-50 text-purple-700 border-purple-200"
                      : "bg-blue-50 text-blue-700 border-blue-200"
                  }`}>
                    {isExchange ? "Exchange" : "Return"}
                  </span>

                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${config.color}`}>
                    {config.label}
                  </span>
                </div>

                {/* ID & Order Number */}
                <div className="flex items-center justify-between gap-2 bg-gray-50/70 p-2.5 rounded-xl text-xs">
                  <div className="min-w-0">
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Request ID</span>
                    <span className="font-mono font-bold text-gray-800 text-xs truncate block max-w-[140px]" title={request.id}>
                      {request.id}
                    </span>
                  </div>
                  <div className="text-right min-w-0">
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Order ID</span>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/vendor/orders/${request.orderId}`);
                      }}
                      className="font-mono font-bold text-primary-600 hover:underline text-xs truncate block max-w-[140px]">
                      #{request.orderId}
                    </span>
                  </div>
                </div>

                {/* Customer & Reason */}
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between items-center text-gray-700">
                    <span className="text-gray-500 font-medium">Customer:</span>
                    <span className="font-bold text-gray-900">{request.customer?.name || "Customer"}</span>
                  </div>
                  {request.reason && (
                    <div className="flex justify-between items-start gap-2 text-gray-700 pt-0.5">
                      <span className="text-gray-500 font-medium flex-shrink-0">Reason:</span>
                      <span className="text-gray-700 text-right line-clamp-1">{request.reason}</span>
                    </div>
                  )}
                  {isExchange && requestedSize && (
                    <div className="flex justify-between items-center text-purple-700 pt-0.5">
                      <span className="font-medium">Requested Size:</span>
                      <span className="font-bold bg-purple-50 px-2 py-0.5 rounded text-[11px]">{requestedSize}</span>
                    </div>
                  )}
                </div>

                {/* Financials & Items Footer */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
                  <span className="text-gray-500 font-medium">
                    {itemsCount} item{itemsCount !== 1 ? "s" : ""} • {new Date(request.requestDate).toLocaleDateString()}
                  </span>
                  <div>
                    {isExchange ? (
                      diff === 0 ? (
                        <span className="font-bold text-gray-500">Even Exchange</span>
                      ) : diff > 0 ? (
                        <span className="font-bold text-amber-600">+{formatPrice(diff)}</span>
                      ) : (
                        <span className="font-bold text-emerald-600">{formatPrice(Math.abs(diff))}</span>
                      )
                    ) : (
                      <span className="font-black text-gray-900 font-mono">{formatPrice(request.refundAmount)}</span>
                    )}
                  </div>
                </div>

                {/* Quick Action Buttons on Pending */}
                {request.status === "pending" && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Are you sure you want to approve this ${request.requestType}?`)) {
                          handleStatusUpdate(request.id, "approved", "approve");
                        }
                      }}
                      className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1">
                      <FiCheck className="text-sm" />
                      <span>Approve</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const reason = window.prompt("Optional rejection reason:", "");
                        handleStatusUpdate(request.id, "rejected", "reject", { rejectionReason: reason || "" });
                      }}
                      className="flex-1 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1">
                      <FiX className="text-sm" />
                      <span>Reject</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="bg-white rounded-2xl p-8 text-center border border-gray-100">
            <p className="text-gray-500 text-sm">No return requests found</p>
          </div>
        )}
      </div>

      {/* Desktop Return Requests Table - 100% Unchanged */}
      <div className="hidden sm:block">
        {isLoading ? (
          <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-200 text-center">
            <p className="text-gray-500">Loading return requests...</p>
          </div>
        ) : filteredRequests.length > 0 ? (
          <DataTable
            data={filteredRequests}
            columns={columns}
            pagination={true}
            itemsPerPage={10}
            onRowClick={(row) => navigate(`/vendor/return-requests/${row.id}`)}
          />
        ) : (
          <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-200 text-center">
            <p className="text-gray-500">No return requests found</p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ReturnRequests;
