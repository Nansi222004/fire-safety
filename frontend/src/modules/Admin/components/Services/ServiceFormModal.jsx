import { useState, useEffect } from "react";
import { FiX, FiSave, FiUpload, FiPlus, FiTrash2, FiArrowUp, FiArrowDown, FiEye, FiSettings, FiDollarSign, FiCalendar, FiList } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import { useServiceStore } from "../../../../shared/store/serviceStore";
import { getAllServiceCategories, uploadAdminImage } from "../../services/adminService";
import AnimatedSelect from "../AnimatedSelect";
import toast from "react-hot-toast";
import Button from "../Button";

const PRICING_TYPES = [
  { value: "FIXED", label: "Fixed Price (e.g. ₹1500)" },
  { value: "PER_UNIT", label: "Per Unit (e.g. ₹250 per extinguisher)" },
  { value: "SIZE_BASED", label: "Size Based (e.g. 2KG, 4KG, 6KG)" },
  { value: "CUSTOM_QUOTE", label: "Custom Quote (Price after inspection)" },
];

const BOOKING_TYPES = [
  { value: "INSTANT", label: "Instant Booking" },
  { value: "SCHEDULED", label: "Scheduled (Date & Slot)" },
  { value: "SITE_VISIT", label: "Site Visit First" },
  { value: "CUSTOM_QUOTE", label: "Custom Quotation" },
];

const FIELD_TYPES = [
  { value: "TEXT", label: "Single Line Text" },
  { value: "TEXTAREA", label: "Multi-line Textarea" },
  { value: "NUMBER", label: "Number Input" },
  { value: "SELECT", label: "Dropdown Select" },
  { value: "MULTI_SELECT", label: "Multi Select" },
  { value: "RADIO", label: "Radio Buttons" },
  { value: "CHECKBOX", label: "Checkbox Options" },
  { value: "DATE", label: "Date Picker" },
  { value: "FILE", label: "File Upload" },
];

const ServiceFormModal = ({ service, onClose, onSave }) => {
  const { createService, updateService } = useServiceStore();
  const isEdit = !!service;
  const [activeTab, setActiveTab] = useState("basic");
  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    categoryId: "",
    shortDescription: "",
    description: "",
    image: "",
    sortOrder: 0,
    isActive: true,
    pricingType: "FIXED",
    bookingType: "SCHEDULED",
    estimatedDuration: "1-2 Hours",
    serviceSettings: {
      requiresAddress: true,
      requiresDate: true,
      requiresTimeSlot: true,
      requiresQuantity: false,
      requiresSiteVisit: false,
      requiresQuote: false,
      requiresDocuments: false,
      isRecurring: false,
    },
    serviceFields: [],
  });

  // Fetch dynamic Service Categories for dropdown
  useEffect(() => {
    const fetchCats = async () => {
      try {
        setLoadingCategories(true);
        const res = await getAllServiceCategories({ status: "ACTIVE" });
        const list = Array.isArray(res?.data?.categories)
          ? res.data.categories
          : Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res)
          ? res
          : [];
        setCategories(list);
      } catch (err) {
        toast.error("Failed to load service categories.");
      } finally {
        setLoadingCategories(false);
      }
    };
    fetchCats();
  }, []);

  useEffect(() => {
    if (service) {
      const catId = typeof service.categoryId === "object" ? service.categoryId?._id || service.categoryId?.id : service.categoryId;
      setFormData({
        name: service.name || "",
        categoryId: catId || "",
        shortDescription: service.shortDescription || "",
        description: service.description || "",
        image: service.image || "",
        sortOrder: service.sortOrder || 0,
        isActive: service.isActive !== undefined ? service.isActive : true,
        pricingType: service.pricingType || "FIXED",
        bookingType: service.bookingType || "SCHEDULED",
        estimatedDuration: service.estimatedDuration || "",
        serviceSettings: {
          requiresAddress: true,
          requiresDate: true,
          requiresTimeSlot: true,
          requiresQuantity: false,
          requiresSiteVisit: false,
          requiresQuote: false,
          requiresDocuments: false,
          isRecurring: false,
          ...(service.serviceSettings || {}),
        },
        serviceFields: (service.serviceFields || []).map((f) => ({
          key: f.key || "",
          label: f.label || "",
          type: f.type || "TEXT",
          required: !!f.required,
          placeholder: f.placeholder || "",
          optionsStr: Array.isArray(f.options) ? f.options.join(", ") : "",
          sortOrder: f.sortOrder || 0,
        })),
      });
    }
  }, [service]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSettingChange = (e) => {
    const { name, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      serviceSettings: {
        ...prev.serviceSettings,
        [name]: checked,
      },
    }));
  };

  // Field Builder Actions
  const handleAddField = () => {
    setFormData((prev) => ({
      ...prev,
      serviceFields: [
        ...prev.serviceFields,
        {
          key: "",
          label: "",
          type: "TEXT",
          required: false,
          placeholder: "",
          optionsStr: "",
          sortOrder: prev.serviceFields.length,
        },
      ],
    }));
  };

  const handleFieldChange = (index, key, value) => {
    setFormData((prev) => {
      const updated = [...prev.serviceFields];
      updated[index] = { ...updated[index], [key]: value };
      return { ...prev, serviceFields: updated };
    });
  };

  const handleRemoveField = (index) => {
    setFormData((prev) => ({
      ...prev,
      serviceFields: prev.serviceFields.filter((_, i) => i !== index),
    }));
  };

  const handleMoveField = (index, direction) => {
    setFormData((prev) => {
      const fields = [...prev.serviceFields];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= fields.length) return prev;
      const temp = fields[index];
      fields[index] = fields[targetIndex];
      fields[targetIndex] = temp;
      return { ...prev, serviceFields: fields };
    });
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
      const res = await uploadAdminImage(file, "services");
      const url = res?.data?.url || res?.url;
      if (url) {
        setFormData((prev) => ({ ...prev, image: url }));
        toast.success("Service image uploaded.");
      }
    } catch (err) {
      // Handled by api interceptor
    } finally {
      setIsUploadingImage(false);
      e.target.value = "";
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error("Service name is required.");
      return;
    }

    if (!formData.categoryId) {
      toast.error("Please select a Service Category.");
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const payload = {
        ...formData,
        serviceFields: formData.serviceFields.map((f, i) => ({
          key: f.key || f.label.toLowerCase().replace(/[^a-z0-9_]/g, "_") || `field_${i + 1}`,
          label: f.label,
          type: f.type,
          required: f.required,
          placeholder: f.placeholder,
          options: (f.optionsStr || "").split(",").map((s) => s.trim()).filter(Boolean),
          sortOrder: i,
        })),
      };

      if (isEdit) {
        await updateService(service.id || service._id, payload);
      } else {
        await createService(payload);
      }
      onSave?.();
      onClose();
    } catch (err) {
      // Handled in store / interceptor
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <>
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/50 z-[10000]"
        />

        {/* Modal Content */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-6 pointer-events-none">
          <motion.div
            variants={{
              hidden: { y: "100%", scale: 0.95, opacity: 0 },
              visible: {
                y: 0,
                scale: 1,
                opacity: 1,
                transition: { type: "spring", damping: 22, stiffness: 350, mass: 0.7 },
              },
              exit: {
                y: "100%",
                scale: 0.95,
                opacity: 0,
                transition: { type: "spring", damping: 30, stiffness: 400 },
              },
            }}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden pointer-events-auto">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-xl font-bold text-gray-800">
                  {isEdit ? "Edit Fire Safety Service" : "Create New Fire Safety Service"}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Configure service pricing, booking workflow, and dynamic custom customer input fields
                </p>
              </div>
              <Button onClick={onClose} variant="icon" icon={FiX} className="text-gray-600" />
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-2 px-6 pt-3 border-b border-gray-200 bg-gray-50 flex-shrink-0 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveTab("basic")}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-colors ${
                  activeTab === "basic"
                    ? "bg-white text-primary-600 border-t-2 border-primary-600 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}>
                <FiList />
                <span>1. Basic Info</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("pricing")}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-colors ${
                  activeTab === "pricing"
                    ? "bg-white text-primary-600 border-t-2 border-primary-600 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}>
                <FiDollarSign />
                <span>2. Pricing & Booking</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("settings")}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-colors ${
                  activeTab === "settings"
                    ? "bg-white text-primary-600 border-t-2 border-primary-600 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}>
                <FiSettings />
                <span>3. Workflow Settings</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("fields")}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-colors ${
                  activeTab === "fields"
                    ? "bg-white text-primary-600 border-t-2 border-primary-600 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}>
                <FiPlus />
                <span>4. Dynamic Fields & Preview</span>
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 scrollbar-admin space-y-6">
              {/* TAB 1: BASIC INFO */}
              {activeTab === "basic" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Service Category <span className="text-red-500">*</span>
                      </label>
                      {loadingCategories ? (
                        <p className="text-xs text-gray-400 py-2">Loading categories...</p>
                      ) : (
                        <AnimatedSelect
                          name="categoryId"
                          value={formData.categoryId}
                          onChange={handleInputChange}
                          options={[
                            { value: "", label: "Select Service Category" },
                            ...categories.map((c) => ({
                              value: String(c._id || c.id),
                              label: c.name,
                            })),
                          ]}
                          className="w-full"
                        />
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Service Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        required
                        className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs"
                        placeholder="e.g., Fire Extinguisher Refilling"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Short Description
                    </label>
                    <input
                      type="text"
                      name="shortDescription"
                      value={formData.shortDescription}
                      onChange={handleInputChange}
                      className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs"
                      placeholder="Brief one-liner summary of service..."
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Detailed Description
                    </label>
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleInputChange}
                      rows={4}
                      className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs"
                      placeholder="Comprehensive service details, process, safety certifications..."
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center pt-2">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Service Image
                      </label>
                      <div className="flex items-center gap-3">
                        <label className="inline-flex items-center gap-2 px-3.5 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors cursor-pointer text-xs font-semibold">
                          <FiUpload />
                          {isUploadingImage
                            ? "Uploading..."
                            : formData.image
                            ? "Change Image"
                            : "Upload Image"}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            className="hidden"
                            disabled={isUploadingImage}
                          />
                        </label>
                        {formData.image && (
                          <div className="relative">
                            <img
                              src={formData.image}
                              alt="Service"
                              className="w-12 h-12 object-cover rounded-xl border border-gray-200"
                            />
                            <button
                              type="button"
                              onClick={() => setFormData((prev) => ({ ...prev, image: "" }))}
                              className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 text-xs">
                              <FiX />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 pt-4 sm:pt-0">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Sort Order
                        </label>
                        <input
                          type="number"
                          name="sortOrder"
                          value={formData.sortOrder}
                          onChange={handleInputChange}
                          min="0"
                          className="w-24 px-3 py-1.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs"
                        />
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer pt-4">
                        <input
                          type="checkbox"
                          name="isActive"
                          checked={formData.isActive}
                          onChange={handleInputChange}
                          className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                        />
                        <span className="text-xs font-semibold text-gray-700">Active Service</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: PRICING & BOOKING CONFIG */}
              {activeTab === "pricing" && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                      <label className="block text-xs font-bold text-gray-800 mb-2">
                        Pricing Model
                      </label>
                      <div className="space-y-2">
                        {PRICING_TYPES.map((pt) => (
                          <label
                            key={pt.value}
                            className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                              formData.pricingType === pt.value
                                ? "bg-primary-50 border-primary-500 text-primary-900 font-semibold"
                                : "bg-white border-gray-200 text-gray-700 hover:bg-gray-100"
                            }`}>
                            <input
                              type="radio"
                              name="pricingType"
                              value={pt.value}
                              checked={formData.pricingType === pt.value}
                              onChange={handleInputChange}
                              className="text-primary-600 focus:ring-primary-500"
                            />
                            <span className="text-xs">{pt.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                      <label className="block text-xs font-bold text-gray-800 mb-2">
                        Booking Workflow Type
                      </label>
                      <div className="space-y-2">
                        {BOOKING_TYPES.map((bt) => (
                          <label
                            key={bt.value}
                            className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                              formData.bookingType === bt.value
                                ? "bg-primary-50 border-primary-500 text-primary-900 font-semibold"
                                : "bg-white border-gray-200 text-gray-700 hover:bg-gray-100"
                            }`}>
                            <input
                              type="radio"
                              name="bookingType"
                              value={bt.value}
                              checked={formData.bookingType === bt.value}
                              onChange={handleInputChange}
                              className="text-primary-600 focus:ring-primary-500"
                            />
                            <span className="text-xs">{bt.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Estimated Completion Duration
                    </label>
                    <input
                      type="text"
                      name="estimatedDuration"
                      value={formData.estimatedDuration}
                      onChange={handleInputChange}
                      className="w-full sm:w-1/2 px-3.5 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs"
                      placeholder="e.g., 2 - 4 Hours, 1 Business Day, On-site 45 Mins"
                    />
                  </div>
                </div>
              )}

              {/* TAB 3: WORKFLOW SETTINGS */}
              {activeTab === "settings" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                    Customer Booking Requirements & Toggles
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { key: "requiresAddress", label: "Requires Customer Address", desc: "Require service location address during booking" },
                      { key: "requiresDate", label: "Requires Preferred Date", desc: "Allow customer to pick preferred service date" },
                      { key: "requiresTimeSlot", label: "Requires Time Slot", desc: "Allow customer to pick morning/afternoon time slot" },
                      { key: "requiresQuantity", label: "Requires Quantity Counter", desc: "Allow customer to increment service unit quantity" },
                      { key: "requiresSiteVisit", label: "Requires Initial Site Inspection", desc: "Technician must visit site before final confirmation" },
                      { key: "requiresQuote", label: "Requires Vendor Custom Quote", desc: "Price is calculated and approved via quotation flow" },
                      { key: "requiresDocuments", label: "Requires Document Uploads", desc: "Customer must upload building blueprint/existing audit certificates" },
                      { key: "isRecurring", label: "Supports AMC / Recurring Plan", desc: "Service can be booked under annual maintenance contracts" },
                    ].map((st) => (
                      <label
                        key={st.key}
                        className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-100/80 transition-colors">
                        <input
                          type="checkbox"
                          name={st.key}
                          checked={!!formData.serviceSettings[st.key]}
                          onChange={handleSettingChange}
                          className="mt-0.5 w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                        />
                        <div>
                          <p className="text-xs font-bold text-gray-800">{st.label}</p>
                          <p className="text-[11px] text-gray-500 mt-0.5">{st.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 4: DYNAMIC FIELDS & PREVIEW */}
              {activeTab === "fields" && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left Col: Field Configurator */}
                  <div className="lg:col-span-7 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                          Custom Service Fields Builder
                        </h3>
                        <p className="text-[11px] text-gray-500">
                          Add custom fields required from customer (Extinguisher type, Capacity, etc.)
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddField}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-xs font-semibold transition-colors">
                        <FiPlus />
                        <span>Add Field</span>
                      </button>
                    </div>

                    {formData.serviceFields.length === 0 ? (
                      <div className="text-center py-10 bg-gray-50 border border-dashed border-gray-300 rounded-xl">
                        <p className="text-xs text-gray-500">No dynamic fields configured yet.</p>
                        <button
                          type="button"
                          onClick={handleAddField}
                          className="mt-2 text-xs font-bold text-primary-600 hover:underline">
                          + Click to add your first field
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {formData.serviceFields.map((field, idx) => (
                          <div
                            key={idx}
                            className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3 relative group">
                            <div className="flex items-center justify-between gap-2 border-b border-gray-200 pb-2">
                              <span className="text-xs font-bold text-gray-700">
                                Field #{idx + 1}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleMoveField(idx, -1)}
                                  disabled={idx === 0}
                                  className="p-1 text-gray-500 hover:text-gray-800 disabled:opacity-30">
                                  <FiArrowUp />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveField(idx, 1)}
                                  disabled={idx === formData.serviceFields.length - 1}
                                  className="p-1 text-gray-500 hover:text-gray-800 disabled:opacity-30">
                                  <FiArrowDown />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveField(idx)}
                                  className="p-1 text-red-500 hover:text-red-700">
                                  <FiTrash2 />
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[11px] font-semibold text-gray-600 mb-0.5">
                                  Field Label <span className="text-red-500">*</span>
                                </label>
                                <input
                                  type="text"
                                  value={field.label}
                                  onChange={(e) => handleFieldChange(idx, "label", e.target.value)}
                                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs"
                                  placeholder="e.g. Extinguisher Type"
                                />
                              </div>

                              <div>
                                <label className="block text-[11px] font-semibold text-gray-600 mb-0.5">
                                  Input Type
                                </label>
                                <select
                                  value={field.type}
                                  onChange={(e) => handleFieldChange(idx, "type", e.target.value)}
                                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs bg-white">
                                  {FIELD_TYPES.map((ft) => (
                                    <option key={ft.value} value={ft.value}>
                                      {ft.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {["SELECT", "MULTI_SELECT", "RADIO", "CHECKBOX"].includes(field.type) && (
                              <div>
                                <label className="block text-[11px] font-semibold text-gray-600 mb-0.5">
                                  Options (Comma-separated)
                                </label>
                                <input
                                  type="text"
                                  value={field.optionsStr || ""}
                                  onChange={(e) => handleFieldChange(idx, "optionsStr", e.target.value)}
                                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs"
                                  placeholder="e.g. ABC, CO2, DCP, Foam"
                                />
                              </div>
                            )}

                            <div className="flex items-center justify-between pt-1">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={field.required}
                                  onChange={(e) => handleFieldChange(idx, "required", e.target.checked)}
                                  className="w-3.5 h-3.5 text-primary-600 rounded"
                                />
                                <span className="text-[11px] font-semibold text-gray-700">Required Field</span>
                              </label>

                              <input
                                type="text"
                                value={field.placeholder}
                                onChange={(e) => handleFieldChange(idx, "placeholder", e.target.value)}
                                className="w-48 px-2 py-1 border border-gray-300 rounded text-[11px]"
                                placeholder="Placeholder hint..."
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right Col: Live Customer Form Preview */}
                  <div className="lg:col-span-5 bg-slate-900 text-white rounded-2xl p-4 space-y-4 border border-slate-800 h-fit">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 border-b border-slate-800 pb-2">
                      <FiEye />
                      <span>Live Customer Form Preview</span>
                    </div>

                    <div className="space-y-3 text-xs">
                      <p className="font-semibold text-slate-300 border-b border-slate-800 pb-1">
                        Service: {formData.name || "Untitled Service"}
                      </p>

                      {formData.serviceFields.length === 0 ? (
                        <p className="text-slate-500 italic py-4 text-center">
                          Add custom fields on the left to see live customer input preview.
                        </p>
                      ) : (
                        formData.serviceFields.map((f, i) => (
                          <div key={i} className="space-y-1">
                            <label className="block text-[11px] text-slate-300">
                              {f.label || `Field #${i + 1}`}
                              {f.required && <span className="text-red-400 ml-0.5">*</span>}
                            </label>
                            {f.type === "TEXT" && (
                              <input
                                disabled
                                type="text"
                                placeholder={f.placeholder || "Enter details..."}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-400 text-xs"
                              />
                            )}
                            {f.type === "TEXTAREA" && (
                              <textarea
                                disabled
                                rows={2}
                                placeholder={f.placeholder || "Enter notes..."}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-400 text-xs"
                              />
                            )}
                            {f.type === "NUMBER" && (
                              <input
                                disabled
                                type="number"
                                placeholder="0"
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-400 text-xs"
                              />
                            )}
                            {["SELECT", "MULTI_SELECT"].includes(f.type) && (
                              <select
                                disabled
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-400 text-xs">
                                <option>-- Select Option --</option>
                                {(f.optionsStr || "").split(",").map((opt, oi) => (
                                  <option key={oi}>{opt.trim()}</option>
                                ))}
                              </select>
                            )}
                            {["RADIO", "CHECKBOX"].includes(f.type) && (
                              <div className="flex flex-wrap gap-2 pt-0.5">
                                {(f.optionsStr || "Option 1, Option 2").split(",").map((opt, oi) => (
                                  <span
                                    key={oi}
                                    className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-[10px] text-slate-300">
                                    {opt.trim()}
                                  </span>
                                ))}
                              </div>
                            )}
                            {f.type === "DATE" && (
                              <input
                                disabled
                                type="date"
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-400 text-xs"
                              />
                            )}
                            {f.type === "FILE" && (
                              <div className="p-2 border border-dashed border-slate-700 rounded-lg bg-slate-800 text-center text-[10px] text-slate-400">
                                Upload Document
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Actions Footer */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <Button type="button" onClick={onClose} variant="secondary">
                  Cancel
                </Button>
                <Button type="submit" variant="primary" icon={FiSave} disabled={isSubmitting || isUploadingImage}>
                  {isEdit ? "Update Service" : "Create Service"}
                </Button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      </>
    </AnimatePresence>
  );
};

export default ServiceFormModal;
