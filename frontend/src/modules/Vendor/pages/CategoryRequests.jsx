import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { FiPlus, FiSearch, FiEdit2, FiInfo, FiUpload, FiX, FiFolder, FiClock, FiCheckCircle, FiAlertCircle } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import DataTable from "../../../modules/Admin/components/DataTable";
import AnimatedSelect from "../../../modules/Admin/components/AnimatedSelect";
import { useCategoryStore } from "../../../shared/store/categoryStore";
import { uploadVendorImage } from "../services/vendorService";

const CategoryRequests = () => {
  const { categories, getCategories, categoryRequests, fetchCategoryRequests, requestCategory, resubmitCategoryRequest } = useCategoryStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingRequest, setEditingRequest] = useState(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const [formData, setFormData] = useState({
    categoryName: "",
    description: "",
    image: "",
    reason: "",
    requestedParentCategoryId: "",
  });

  useEffect(() => {
    fetchCategoryRequests();
    getCategories(); // Load approved categories for parent select list
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleOpenRequestModal = (reqToEdit = null) => {
    if (reqToEdit) {
      setEditingRequest(reqToEdit);
      setFormData({
        categoryName: reqToEdit.categoryName || "",
        description: reqToEdit.description || "",
        image: reqToEdit.image || "",
        reason: reqToEdit.reason || "",
        requestedParentCategoryId: reqToEdit.requestedParentCategoryId?._id || reqToEdit.requestedParentCategoryId || "",
      });
    } else {
      setEditingRequest(null);
      setFormData({
        categoryName: "",
        description: "",
        image: "",
        reason: "",
        requestedParentCategoryId: "",
      });
    }
    setShowModal(true);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type?.startsWith("image/")) {
      toast.error("Please select a valid image file");
      return;
    }

    setIsUploadingImage(true);
    try {
      const response = await uploadVendorImage(file, "categories");
      const imageUrl = response?.data?.url || response?.url;
      if (!imageUrl) {
        toast.error("Image upload failed");
        return;
      }
      setFormData((prev) => ({ ...prev, image: imageUrl }));
      toast.success("Image uploaded");
    } catch (error) {
      // Handled
    } finally {
      setIsUploadingImage(false);
      e.target.value = "";
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.categoryName.trim()) {
      toast.error("Category name is required");
      return;
    }

    try {
      if (editingRequest) {
        await resubmitCategoryRequest(editingRequest._id, formData);
      } else {
        await requestCategory(formData);
      }
      setShowModal(false);
      fetchCategoryRequests();
    } catch (error) {
      // Handled
    }
  };

  const filteredRequests = categoryRequests.filter((req) => {
    const matchesSearch =
      !searchQuery ||
      req.categoryName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (req.description || "").toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      selectedStatus === "all" || req.status === selectedStatus;

    return matchesSearch && matchesStatus;
  });

  const columns = [
    {
      key: "categoryName",
      label: "Category Name",
      sortable: true,
      render: (value, row) => (
        <div className="flex items-center gap-3">
          {row.image ? (
            <img
              src={row.image}
              alt={value}
              className="w-10 h-10 object-contain rounded-lg border border-gray-200 bg-gray-50 p-1"
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center font-bold text-gray-400 text-xs">
              NO IMAGE
            </div>
          )}
          <div>
            <span className="font-semibold text-gray-900 block">{value}</span>
            {row.description && (
              <span className="text-xs text-gray-500 line-clamp-1">{row.description}</span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "requestedParentCategoryId",
      label: "Requested Parent",
      sortable: true,
      render: (value, row) => (
        <span className="text-sm font-medium text-gray-700">
          {row.requestedParentCategoryId?.name || "Root (None)"}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value, row) => (
        <div className="flex flex-col gap-1 text-left">
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-1 rounded text-xs font-semibold uppercase ${
                value === "approved"
                  ? "bg-green-100 text-green-800"
                  : value === "rejected"
                  ? "bg-red-100 text-red-800"
                  : "bg-amber-100 text-amber-800"
              }`}>
              {value}
            </span>
            {value === "rejected" && (
              <button
                onClick={() => handleOpenRequestModal(row)}
                className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded text-[10px] font-bold transition-colors"
                title="Edit and Resubmit Request">
                <FiEdit2 size={10} />
                <span>Resubmit</span>
              </button>
            )}
          </div>
          {value === "rejected" && row.rejectionReason && (
            <div className="text-xs text-red-600 font-medium flex items-start gap-1 mt-1 max-w-[240px]">
              <FiInfo className="mt-0.5 flex-shrink-0" />
              <span>Reason: {row.rejectionReason}</span>
            </div>
          )}
          {row.resubmittedCount > 0 && (
            <div className="text-[10px] text-blue-600 font-medium mt-0.5">
              Resubmitted {row.resubmittedCount} time(s)
            </div>
          )}
        </div>
      ),
    },
    {
      key: "createdAt",
      label: "Date Requested",
      sortable: true,
      render: (value) => (
        <span className="text-sm text-gray-600">
          {new Date(value).toLocaleDateString()}
        </span>
      ),
    },
  ];

  const modalContent = showModal && (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => setShowModal(false)}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[100000]"
      />

      {/* Modal Dialog */}
      <div className="fixed inset-0 z-[100001] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden my-auto border border-gray-100">
          {/* Modal Header */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100 flex-shrink-0 bg-white">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                {editingRequest ? "Edit & Resubmit Request" : "New Category Request"}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {editingRequest ? "Modify rejected category details" : "Submit category for admin approval"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 hover:text-gray-800 transition-colors">
              <FiX size={20} />
            </button>
          </div>

          {/* Modal Form */}
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Category Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="categoryName"
                  value={formData.categoryName}
                  onChange={handleChange}
                  required
                  placeholder="e.g. Wireless Chargers, Ethnic Jackets"
                  className="w-full px-3.5 py-2.5 bg-gray-50 sm:bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white text-sm transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Parent Category
                </label>
                <AnimatedSelect
                  name="requestedParentCategoryId"
                  value={formData.requestedParentCategoryId}
                  onChange={handleChange}
                  options={[
                    { value: "", label: "No Parent (Root Category)" },
                    ...categories
                      .filter((c) => c.isActive !== false)
                      .map((c) => ({
                        value: String(c.id || c._id),
                        label: c.name,
                      })),
                  ]}
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Select where this category belongs in the catalog hierarchy.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Category Image
                </label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-200 hover:border-primary-500 hover:bg-primary-50/20 rounded-xl cursor-pointer text-xs font-bold text-gray-700 transition-all bg-gray-50 sm:bg-white active:scale-98">
                    <FiUpload className="text-primary-600" />
                    <span>{isUploadingImage ? "Uploading..." : "Upload Image"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                      disabled={isUploadingImage}
                    />
                  </label>
                  {formData.image && (
                    <div className="relative group">
                      <img
                        src={formData.image}
                        alt="Category preview"
                        className="w-12 h-12 object-contain rounded-xl border border-gray-200 p-1 bg-white shadow-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, image: "" }))}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors shadow-xs">
                        <FiX size={10} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Description
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={2}
                  placeholder="Brief description of the category..."
                  className="w-full px-3.5 py-2.5 bg-gray-50 sm:bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white text-sm transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Reason for Request
                </label>
                <textarea
                  name="reason"
                  value={formData.reason}
                  onChange={handleChange}
                  rows={2}
                  placeholder="Why do we need this category?"
                  className="w-full px-3.5 py-2.5 bg-gray-50 sm:bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white text-sm transition-all"
                />
              </div>
            </div>

            {/* Modal Footer - Fixed, clean, never cut off */}
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 sm:gap-3 p-4 sm:p-5 border-t border-gray-100 bg-gray-50/70 sm:bg-white flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="w-full sm:w-auto px-5 py-2.5 bg-white sm:bg-transparent border border-gray-200 sm:border-gray-300 text-gray-700 rounded-xl hover:bg-gray-100 text-sm font-bold transition-all text-center active:scale-98 shadow-xs sm:shadow-none">
                Cancel
              </button>
              <button
                type="submit"
                disabled={isUploadingImage}
                className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white rounded-xl text-sm font-bold transition-all shadow-md shadow-primary-500/20 disabled:opacity-50 text-center active:scale-98">
                {editingRequest ? "Resubmit Request" : "Submit Request"}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 sm:space-y-6 pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 px-1 sm:px-0">
        <div className="lg:hidden">
          <h1 className="text-xl sm:text-3xl font-extrabold text-gray-900 tracking-tight mb-0.5 sm:mb-1">
            Category Requests
          </h1>
          <p className="text-xs sm:text-sm text-gray-500">
            Submit catalog category requests and track their review history.
          </p>
        </div>
        <button
          onClick={() => handleOpenRequestModal(null)}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white rounded-xl sm:rounded-lg font-bold text-xs sm:text-sm shadow-md shadow-primary-500/20 lg:ml-auto active:scale-98 transition-all">
          <FiPlus className="text-base" />
          <span>Request New Category</span>
        </button>
      </div>

      {/* Search & Filter bar */}
      <div className="bg-white rounded-2xl sm:rounded-xl p-3.5 sm:p-4 shadow-xs sm:shadow-sm border border-gray-100 sm:border-gray-200">
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 sm:gap-4">
          <div className="relative flex-1 w-full">
            <FiSearch className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search requested category name..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50 sm:bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs sm:text-sm"
            />
          </div>

          <AnimatedSelect
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            options={[
              { value: "all", label: "All Statuses" },
              { value: "pending", label: "Pending" },
              { value: "approved", label: "Approved" },
              { value: "rejected", label: "Rejected" },
            ]}
            className="w-full sm:w-auto min-w-[140px] sm:min-w-[160px]"
          />
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="sm:hidden space-y-3">
        {filteredRequests.length > 0 ? (
          filteredRequests.map((req) => {
            const status = req.status || "pending";
            const statusStyles = {
              approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
              rejected: "bg-rose-50 text-rose-700 border-rose-200",
              pending: "bg-amber-50 text-amber-700 border-amber-200",
            };

            return (
              <div
                key={req._id || req.id}
                className="bg-white rounded-2xl p-3.5 shadow-xs border border-gray-100 space-y-3">
                <div className="flex items-start gap-3">
                  {req.image ? (
                    <img
                      src={req.image}
                      alt={req.categoryName}
                      className="w-12 h-12 object-contain rounded-xl border border-gray-100 bg-gray-50 p-1 flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 flex-shrink-0">
                      <FiFolder className="text-xl" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-gray-900 text-sm truncate">
                        {req.categoryName}
                      </h3>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                          statusStyles[status] || statusStyles.pending
                        }`}>
                        {status}
                      </span>
                    </div>
                    {req.description && (
                      <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">
                        {req.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50/70 p-2.5 rounded-xl">
                  <div>
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Parent</span>
                    <span className="font-semibold text-gray-700 text-xs truncate block">
                      {req.requestedParentCategoryId?.name || "Root (None)"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Requested On</span>
                    <span className="font-semibold text-gray-700 text-xs block">
                      {new Date(req.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {status === "rejected" && req.rejectionReason && (
                  <div className="bg-rose-50/80 border border-rose-200/80 rounded-xl p-2.5 text-xs text-rose-800 space-y-1">
                    <div className="flex items-center gap-1 font-bold text-rose-900">
                      <FiAlertCircle className="flex-shrink-0" />
                      <span>Rejection Reason</span>
                    </div>
                    <p className="text-rose-700 text-[11px] leading-relaxed">{req.rejectionReason}</p>
                  </div>
                )}

                {status === "rejected" && (
                  <button
                    onClick={() => handleOpenRequestModal(req)}
                    className="w-full py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors">
                    <FiEdit2 size={12} />
                    <span>Edit & Resubmit Request</span>
                  </button>
                )}
              </div>
            );
          })
        ) : (
          <div className="bg-gradient-to-b from-white to-gray-50/50 rounded-2xl p-8 text-center border border-gray-100 shadow-xs flex flex-col items-center justify-center">
            <div className="w-14 h-14 bg-primary-50 rounded-2xl flex items-center justify-center text-primary-600 mb-3 shadow-inner">
              <FiFolder className="text-2xl" />
            </div>
            <h3 className="text-sm font-bold text-gray-900 mb-1">No category requests found</h3>
            <p className="text-xs text-gray-500 max-w-[240px] leading-relaxed mb-4">
              {searchQuery || selectedStatus !== "all"
                ? "No requests match your current search or status filter."
                : "Submit a request to add new product categories to the catalog."}
            </p>
            {(!searchQuery && selectedStatus === "all") && (
              <button
                type="button"
                onClick={() => handleOpenRequestModal(null)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-xl text-xs font-bold shadow-md shadow-primary-500/20 active:scale-95 transition-all">
                <FiPlus className="text-sm" />
                <span>Create Request</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Desktop Table View - Unchanged */}
      <div className="hidden sm:block bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <DataTable
          data={filteredRequests}
          columns={columns}
          pagination={true}
          itemsPerPage={10}
        />
      </div>

      {/* Render Modal into Portal */}
      {typeof document !== "undefined" && createPortal(modalContent, document.body)}
    </motion.div>
  );
};

export default CategoryRequests;
