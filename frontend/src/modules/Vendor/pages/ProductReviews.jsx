import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { FiStar, FiSearch, FiEye, FiMessageSquare, FiX, FiCheck } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import DataTable from "../../Admin/components/DataTable";
import ExportButton from "../../Admin/components/ExportButton";
import Badge from "../../../shared/components/Badge";
import AnimatedSelect from "../../Admin/components/AnimatedSelect";
import { useVendorAuthStore } from "../store/vendorAuthStore";
import { useVendorProductStore } from "../store/vendorProductStore";
import {
  getAllVendorReviews,
  updateVendorReviewStatus,
  addVendorReviewResponse,
} from "../services/vendorService";
import toast from "react-hot-toast";

const ProductReviews = () => {
  const { vendor } = useVendorAuthStore();
  const { products, fetchProducts } = useVendorProductStore();
  const [reviews, setReviews] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRating, setSelectedRating] = useState("all");
  const [selectedProduct, setSelectedProduct] = useState("all");
  const [selectedReview, setSelectedReview] = useState(null);
  const [responseText, setResponseText] = useState("");

  const vendorId = vendor?.id;

  useEffect(() => {
    if (!vendorId) {
      setReviews([]);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      try {
        await fetchProducts({ fetchAll: true, limit: 200 });
        const res = await getAllVendorReviews({ limit: 100 });
        const payload = res?.data ?? res;
        setReviews(payload?.reviews ?? []);
      } catch {
        setReviews([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [vendorId, fetchProducts]);

  const vendorProducts = products || [];

  const filteredReviews = useMemo(() => {
    let filtered = reviews;

    if (searchQuery) {
      filtered = filtered.filter(
        (review) =>
          review.productName
            ?.toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          review.customerName
            ?.toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          review.comment?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (selectedRating !== "all") {
      filtered = filtered.filter(
        (review) => review.rating === parseInt(selectedRating)
      );
    }

    if (selectedProduct !== "all") {
      filtered = filtered.filter(
        (review) => String(review.productId) === String(selectedProduct)
      );
    }

    return filtered;
  }, [reviews, searchQuery, selectedRating, selectedProduct]);

  const handleResponse = async (reviewId) => {
    const text = responseText.trim();
    if (!text) return;
    try {
      const res = await addVendorReviewResponse(reviewId, text);
      const updated = res?.data ?? res;
      setReviews((prev) =>
        prev.map((review) => (review.id === reviewId ? updated : review))
      );
      setSelectedReview((prev) =>
        prev && prev.id === reviewId ? updated : prev
      );
    } catch {
      return;
    }
    setSelectedReview(null);
    setResponseText("");
    toast.success("Response added successfully");
  };

  const handleModerate = async (reviewId, action) => {
    const nextStatus = action === "hide" ? "hidden" : "approved";
    try {
      const res = await updateVendorReviewStatus(reviewId, nextStatus);
      const updated = res?.data ?? res;
      setReviews((prev) =>
        prev.map((review) => (review.id === reviewId ? updated : review))
      );
      setSelectedReview((prev) =>
        prev && prev.id === reviewId ? updated : prev
      );
    } catch {
      return;
    }
    toast.success(action === "hide" ? "Review hidden" : "Review approved");
  };

  const renderStars = (rating) => {
    return (
      <div className="flex items-center gap-0.5 sm:gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <FiStar
            key={star}
            className={`text-xs sm:text-sm ${
              star <= rating ? "text-amber-400 fill-amber-400" : "text-gray-300"
            }`}
          />
        ))}
      </div>
    );
  };

  const columns = [
    {
      key: "productName",
      label: "Product",
      sortable: true,
      render: (value, row) => (
        <div>
          <p className="font-medium text-gray-800">
            {value || "Unknown Product"}
          </p>
          <p className="text-xs text-gray-500">ID: {row.productId}</p>
        </div>
      ),
    },
    {
      key: "customerName",
      label: "Customer",
      sortable: true,
      render: (value, row) => (
        <div>
          <p className="font-semibold text-gray-800">{value}</p>
          {row.customerEmail && (
            <p className="text-xs text-gray-500">{row.customerEmail}</p>
          )}
        </div>
      ),
    },
    {
      key: "rating",
      label: "Rating",
      sortable: true,
      render: (value) => renderStars(value),
    },
    {
      key: "comment",
      label: "Review",
      sortable: false,
      render: (value) => (
        <p className="max-w-xs truncate text-sm text-gray-600">
          {value || "No comment"}
        </p>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value) => (
        <Badge
          variant={
            value === "approved"
              ? "success"
              : value === "hidden"
                ? "warning"
                : "pending"
          }>
          {value || "pending"}
        </Badge>
      ),
    },
    {
      key: "createdAt",
      label: "Date",
      sortable: true,
      render: (value) => new Date(value || new Date()).toLocaleDateString(),
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedReview(row)}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="View & Respond">
            <FiEye />
          </button>
          {row.status !== "hidden" && (
            <button
              onClick={() => handleModerate(row.id, "hide")}
              className="p-2 text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
              title="Hide Review">
              <FiX />
            </button>
          )}
          {row.status !== "approved" && (
            <button
              onClick={() => handleModerate(row.id, "approve")}
              className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
              title="Approve Review">
              <FiStar />
            </button>
          )}
        </div>
      ),
    },
  ];

  const ratingStats = useMemo(() => {
    const stats = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach((review) => {
      if (review.rating) stats[review.rating] = (stats[review.rating] || 0) + 1;
    });
    return stats;
  }, [reviews]);

  if (!vendorId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Please log in to view reviews</p>
      </div>
    );
  }

  const modalContent = selectedReview && (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => {
          setSelectedReview(null);
          setResponseText("");
        }}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[100000]"
      />
      <div className="fixed inset-0 z-[100001] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden my-auto border border-gray-100"
          onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100 flex-shrink-0 bg-white">
            <h3 className="text-lg font-bold text-gray-900">
              Review Details
            </h3>
            <button
              onClick={() => {
                setSelectedReview(null);
                setResponseText("");
              }}
              className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 hover:text-gray-800 transition-colors">
              <FiX size={20} />
            </button>
          </div>

          <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
            <div className="bg-gray-50/70 p-3 rounded-xl space-y-1">
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Product</p>
              <p className="text-sm font-bold text-gray-900">
                {selectedReview.productName}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-50/70 p-3 rounded-xl space-y-1">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Customer</p>
                <p className="text-xs sm:text-sm font-bold text-gray-800 truncate">
                  {selectedReview.customerName}
                </p>
              </div>
              <div className="bg-gray-50/70 p-3 rounded-xl space-y-1">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Rating</p>
                <div className="pt-0.5">{renderStars(selectedReview.rating)}</div>
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-gray-700 mb-1">
                Customer Comment
              </p>
              <p className="text-xs sm:text-sm text-gray-700 bg-gray-50/60 p-3 rounded-xl border border-gray-100 whitespace-pre-wrap leading-relaxed">
                {selectedReview.comment || "No comment provided"}
              </p>
            </div>

            {selectedReview.vendorResponse && (
              <div>
                <p className="text-xs font-bold text-primary-700 mb-1">
                  Your Store Response
                </p>
                <p className="text-xs sm:text-sm text-gray-800 bg-primary-50/40 p-3 rounded-xl border border-primary-100 leading-relaxed">
                  {selectedReview.vendorResponse}
                </p>
              </div>
            )}

            {!selectedReview.vendorResponse && (
              <div>
                <label className="text-xs font-bold text-gray-700 mb-1.5 block">
                  Write a Response
                </label>
                <textarea
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  placeholder="Write a polite response to the customer..."
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white text-xs sm:text-sm"
                  rows="3"
                />
                <button
                  onClick={() => handleResponse(selectedReview.id)}
                  disabled={!responseText.trim()}
                  className="mt-2 w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-primary-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
                  <FiMessageSquare className="text-sm" />
                  <span>Submit Response</span>
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-2">
              {selectedReview.status !== "approved" && (
                <button
                  onClick={() => handleModerate(selectedReview.id, "approve")}
                  className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition-all shadow-xs text-center">
                  Approve Review
                </button>
              )}
              {selectedReview.status !== "hidden" && (
                <button
                  onClick={() => handleModerate(selectedReview.id, "hide")}
                  className="flex-1 px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl font-bold text-xs transition-all text-center">
                  Hide Review
                </button>
              )}
            </div>
          </div>

          <div className="flex justify-end p-4 sm:p-5 border-t border-gray-100 bg-gray-50/70 sm:bg-white flex-shrink-0">
            <button
              onClick={() => {
                setSelectedReview(null);
                setResponseText("");
              }}
              className="w-full sm:w-auto px-6 py-2.5 bg-white sm:bg-gray-100 border border-gray-200 sm:border-0 text-gray-700 rounded-xl hover:bg-gray-200 text-xs sm:text-sm font-bold transition-all text-center">
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 sm:space-y-6 pb-6 px-1 sm:px-0">
      <div className="lg:hidden">
        <h1 className="text-xl sm:text-3xl font-extrabold text-gray-900 tracking-tight mb-0.5 sm:mb-2">
          Product Reviews
        </h1>
        <p className="text-xs sm:text-base text-gray-500">
          Manage customer reviews and ratings
        </p>
      </div>

      {/* Stats - Compact 5-column grid */}
      <div className="grid grid-cols-5 gap-1.5 sm:gap-4">
        {[5, 4, 3, 2, 1].map((rating) => (
          <div
            key={rating}
            className="bg-white rounded-2xl sm:rounded-xl p-2 sm:p-4 shadow-xs sm:shadow-sm border border-gray-100 sm:border-gray-200 text-center flex flex-col justify-between">
            <div className="flex items-center justify-center gap-0.5 mb-1 text-amber-500 font-bold text-[11px] sm:text-sm">
              <span>{rating}</span>
              <FiStar className="fill-amber-400 text-amber-400 text-[10px] sm:text-xs" />
            </div>
            <p className="text-sm sm:text-2xl font-black text-gray-900 font-mono">
              {ratingStats[rating] || 0}
            </p>
          </div>
        ))}
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
              placeholder="Search reviews..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs sm:text-sm"
            />
          </div>

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:gap-4 w-full sm:w-auto">
            <AnimatedSelect
              value={selectedRating}
              onChange={(e) => setSelectedRating(e.target.value)}
              options={[
                { value: "all", label: "All Ratings" },
                { value: "5", label: "5 Stars" },
                { value: "4", label: "4 Stars" },
                { value: "3", label: "3 Stars" },
                { value: "2", label: "2 Stars" },
                { value: "1", label: "1 Star" },
              ]}
              className="w-full sm:w-auto min-w-[130px] sm:min-w-[140px]"
            />

            <AnimatedSelect
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
              options={[
                { value: "all", label: "All Products" },
                ...vendorProducts.map((p) => ({
                  value: String(p._id ?? p.id),
                  label: p.name,
                })),
              ]}
              className="w-full sm:w-auto min-w-[130px] sm:min-w-[140px]"
            />
          </div>

          <div className="w-full sm:w-auto pt-1 sm:pt-0">
            <ExportButton
              data={filteredReviews}
              headers={[
                { label: "Product", accessor: (row) => row.productName },
                { label: "Customer", accessor: (row) => row.customerName },
                { label: "Rating", accessor: (row) => row.rating },
                { label: "Review", accessor: (row) => row.comment },
                { label: "Status", accessor: (row) => row.status },
                {
                  label: "Date",
                  accessor: (row) =>
                    new Date(row.createdAt).toLocaleDateString(),
                },
              ]}
              filename="vendor-reviews"
            />
          </div>
        </div>
      </div>

      {/* Mobile Reviews Cards */}
      <div className="sm:hidden space-y-3">
        {isLoading ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-gray-100">
            <p className="text-gray-500 text-sm">Loading reviews...</p>
          </div>
        ) : filteredReviews.length > 0 ? (
          filteredReviews.map((review) => {
            const status = review.status || "pending";
            const statusStyles = {
              approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
              hidden: "bg-amber-50 text-amber-700 border-amber-200",
              pending: "bg-blue-50 text-blue-700 border-blue-200",
            };

            return (
              <div
                key={review.id}
                className="bg-white rounded-2xl p-3.5 shadow-xs border border-gray-100 space-y-3">
                {/* Product & Status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-gray-900 text-sm truncate">
                      {review.productName || "Unknown Product"}
                    </h3>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      By <span className="font-semibold text-gray-700">{review.customerName}</span> • {new Date(review.createdAt || new Date()).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border flex-shrink-0 ${
                      statusStyles[status] || statusStyles.pending
                    }`}>
                    {status}
                  </span>
                </div>

                {/* Stars Rating */}
                <div className="flex items-center gap-2">
                  {renderStars(review.rating)}
                  <span className="text-xs font-bold text-gray-700 font-mono">
                    {review.rating}/5
                  </span>
                </div>

                {/* Comment */}
                {review.comment && (
                  <p className="text-xs text-gray-700 bg-gray-50/70 p-2.5 rounded-xl leading-relaxed">
                    &ldquo;{review.comment}&rdquo;
                  </p>
                )}

                {/* Response if present */}
                {review.vendorResponse && (
                  <div className="bg-primary-50/40 border-l-2 border-primary-500 p-2.5 rounded-r-xl text-xs space-y-0.5">
                    <span className="text-[10px] font-bold text-primary-700 uppercase tracking-wider block">Your Response</span>
                    <p className="text-gray-800 text-[11px]">{review.vendorResponse}</p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                  <button
                    onClick={() => setSelectedReview(review)}
                    className="flex-1 py-1.5 bg-slate-50 hover:bg-primary-50 hover:text-primary-600 text-gray-700 border border-gray-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1">
                    <FiEye className="text-xs" />
                    <span>View & Respond</span>
                  </button>
                  {review.status !== "approved" && (
                    <button
                      onClick={() => handleModerate(review.id, "approve")}
                      className="p-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-xs transition-colors"
                      title="Approve">
                      <FiCheck className="text-xs" />
                    </button>
                  )}
                  {review.status !== "hidden" && (
                    <button
                      onClick={() => handleModerate(review.id, "hide")}
                      className="p-2 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-xl text-xs transition-colors"
                      title="Hide">
                      <FiX className="text-xs" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="bg-white rounded-2xl p-8 text-center border border-gray-100">
            <p className="text-gray-500 text-sm">No reviews found</p>
          </div>
        )}
      </div>

      {/* Desktop Reviews Table - 100% Unchanged */}
      <div className="hidden sm:block">
        {isLoading ? (
          <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-200 text-center">
            <p className="text-gray-500">Loading reviews...</p>
          </div>
        ) : filteredReviews.length > 0 ? (
          <DataTable
            data={filteredReviews}
            columns={columns}
            pagination={true}
            itemsPerPage={10}
          />
        ) : (
          <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-200 text-center">
            <p className="text-gray-500">No reviews found</p>
          </div>
        )}
      </div>

      {/* Portal Modal */}
      {typeof document !== "undefined" && createPortal(modalContent, document.body)}
    </motion.div>
  );
};

export default ProductReviews;
