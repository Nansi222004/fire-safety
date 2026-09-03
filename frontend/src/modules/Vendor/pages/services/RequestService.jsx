import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FiTool,
  FiPlus,
  FiX,
  FiUpload,
  FiLayers,
  FiDollarSign,
  FiClock,
  FiCalendar,
  FiFileText,
  FiCheckCircle,
  FiAlertCircle,
} from "react-icons/fi";
import {
  createVendorServiceRequest,
  uploadVendorImage,
  getPublicServiceCategories,
} from "../../services/vendorService";
import AnimatedSelect from "../../../Admin/components/AnimatedSelect";
import toast from "react-hot-toast";

const RequestService = () => {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const res = await getPublicServiceCategories();
        const list = Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res)
          ? res
          : [];
        setCategories(list);
      } catch (err) {
        console.error(err);
      }
    };
    loadCategories();
  }, []);

  const activeCategories = categories.filter((c) => c.isActive !== false);

  const [formData, setFormData] = useState({
    serviceName: "",
    categoryId: "",
    shortDescription: "",
    description: "",
    image: "",
    pricingType: "FIXED",
    suggestedPrice: "",
    bookingType: "SCHEDULED",
    estimatedDuration: "",
    additionalNotes: "",
  });

  const [serviceFields, setServiceFields] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type?.startsWith("image/")) {
      toast.error("Please select a valid image file");
      return;
    }

    setIsUploading(true);
    try {
      const res = await uploadVendorImage(file, "services");
      const payload = res?.data ?? res ?? {};
      if (payload?.url) {
        setFormData((prev) => ({ ...prev, image: payload.url }));
        toast.success("Image uploaded successfully");
      }
    } catch (err) {
      toast.error("Failed to upload image");
    } finally {
      setIsUploading(false);
    }
  };

  // Custom Fields Builder handlers
  const addServiceField = () => {
    setServiceFields((prev) => [
      ...prev,
      {
        key: `field_${Date.now()}`,
        label: "",
        type: "TEXT",
        required: false,
        placeholder: "",
        options: [],
        optionsInput: "",
      },
    ]);
  };

  const updateServiceField = (index, fieldName, value) => {
    setServiceFields((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [fieldName]: value };

      if (fieldName === "label" && (!next[index].key || next[index].key.startsWith("field_"))) {
        next[index].key = value
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "_")
          .replace(/^_+|_+$/g, "");
      }
      return next;
    });
  };

  const removeServiceField = (index) => {
    setServiceFields((prev) => prev.filter((_, i) => i !== index));
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.serviceName.trim()) {
      errors.serviceName = "Service name is required";
    }
    if (!formData.categoryId) {
      errors.categoryId = "Service Category is required";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error("Please fix highlighted errors before submitting");
      return;
    }

    setIsSubmitting(true);
    try {
      const cleanedFields = serviceFields
        .filter((f) => f.label.trim())
        .map((f) => ({
          key: f.key.trim() || f.label.toLowerCase().replace(/[^a-z0-9]/g, "_"),
          label: f.label.trim(),
          type: f.type,
          required: Boolean(f.required),
          placeholder: f.placeholder.trim(),
          options: f.optionsInput
            ? f.optionsInput
                .split(",")
                .map((o) => o.trim())
                .filter(Boolean)
            : f.options || [],
        }));

      const payload = {
        ...formData,
        suggestedPrice: Number(formData.suggestedPrice) || 0,
        serviceFields: cleanedFields,
      };

      await createVendorServiceRequest(payload);
      toast.success("Service request submitted for Admin review!");
      navigate("/vendor/services/my-requests");
    } catch (err) {
      const errRes = err?.response?.data;
      if (errRes?.errors && Array.isArray(errRes.errors)) {
        const mapped = {};
        errRes.errors.forEach((eItem) => {
          if (eItem.field) mapped[eItem.field] = eItem.message;
        });
        setFieldErrors(mapped);
      }
      toast.error(errRes?.message || err?.message || "Failed to submit service request");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 p-4 sm:p-6 max-w-5xl mx-auto"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-3">
            <FiTool className="text-primary-600" />
            Request New Platform Service
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Submit a new service for Admin approval. Once approved, it becomes an official service master and automatically enables for your store.
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate("/vendor/services/my-requests")}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-xl transition-colors self-start"
        >
          <span>View My Requests</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Details Section */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <FiFileText className="text-primary-600" />
            Service Basic Information
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Service Name */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Service Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="serviceName"
                value={formData.serviceName}
                onChange={handleChange}
                placeholder="e.g. Fire Pump Annual Maintenance & Inspection"
                className={`w-full px-3.5 py-2.5 bg-gray-50 border rounded-xl focus:outline-none focus:ring-2 text-sm ${
                  fieldErrors.serviceName
                    ? "border-red-500 bg-red-50 focus:ring-red-500"
                    : "border-gray-300 focus:ring-primary-500"
                }`}
              />
              {fieldErrors.serviceName && (
                <p className="mt-1 text-xs text-red-600 font-medium flex items-center gap-1">
                  <FiAlertCircle /> {fieldErrors.serviceName}
                </p>
              )}
            </div>

            {/* Service Category */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Service Category <span className="text-red-500">*</span>
              </label>
              <AnimatedSelect
                value={formData.categoryId}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, categoryId: e.target.value }));
                  if (fieldErrors.categoryId) setFieldErrors((prev) => ({ ...prev, categoryId: null }));
                }}
                options={[
                  { value: "", label: "Select Service Category" },
                  ...activeCategories.map((c) => ({
                    value: String(c._id || c.id),
                    label: c.name,
                  })),
                ]}
                className="w-full"
              />
              {fieldErrors.categoryId && (
                <p className="mt-1 text-xs text-red-600 font-medium flex items-center gap-1">
                  <FiAlertCircle /> {fieldErrors.categoryId}
                </p>
              )}
            </div>
          </div>

          {/* Short Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Short Description
            </label>
            <input
              type="text"
              name="shortDescription"
              value={formData.shortDescription}
              onChange={handleChange}
              placeholder="Brief 1-line summary of what this service covers..."
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            />
          </div>

          {/* Full Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Detailed Description
            </label>
            <textarea
              name="description"
              rows={3}
              value={formData.description}
              onChange={handleChange}
              placeholder="Comprehensive description of the service scope, tools used, standards complied with..."
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            />
          </div>

          {/* Image Upload */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Service Image / Banner
            </label>
            <div className="flex items-center gap-4">
              {formData.image ? (
                <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-300">
                  <img
                    src={formData.image}
                    alt="Service preview"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, image: "" }))}
                    className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 text-xs shadow-md"
                  >
                    <FiX />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-36 h-20 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                  <FiUpload className="text-gray-400 text-xl" />
                  <span className="text-[11px] text-gray-500 mt-1">
                    {isUploading ? "Uploading..." : "Upload Image"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={isUploading}
                    className="hidden"
                  />
                </label>
              )}
              <p className="text-xs text-gray-500 max-w-xs">
                Upload a representative image for this service. Max 5MB (PNG, JPG, WEBP).
              </p>
            </div>
          </div>
        </div>

        {/* Pricing & Booking Configurations */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <FiDollarSign className="text-primary-600" />
            Pricing & Delivery Configuration
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Pricing Type */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Pricing Type <span className="text-red-500">*</span>
              </label>
              <AnimatedSelect
                value={formData.pricingType}
                onChange={(e) => setFormData((prev) => ({ ...prev, pricingType: e.target.value }))}
                options={[
                  { value: "FIXED", label: "Fixed Rate" },
                  { value: "PER_UNIT", label: "Per Unit Rate" },
                  { value: "SIZE_BASED", label: "Size / Area Based" },
                  { value: "CUSTOM_QUOTE", label: "Custom Quote Required" },
                ]}
                className="w-full"
              />
            </div>

            {/* Suggested Price */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Suggested Rate (₹)
              </label>
              <input
                type="number"
                min="0"
                name="suggestedPrice"
                value={formData.suggestedPrice}
                onChange={handleChange}
                disabled={formData.pricingType === "CUSTOM_QUOTE"}
                placeholder="e.g. 1500"
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm disabled:opacity-50"
              />
            </div>

            {/* Booking Type */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Booking Type <span className="text-red-500">*</span>
              </label>
              <AnimatedSelect
                value={formData.bookingType}
                onChange={(e) => setFormData((prev) => ({ ...prev, bookingType: e.target.value }))}
                options={[
                  { value: "SCHEDULED", label: "Scheduled Appointment" },
                  { value: "INSTANT", label: "Instant Booking" },
                  { value: "SITE_VISIT", label: "Site Visit Required" },
                  { value: "CUSTOM_QUOTE", label: "Custom Quote Request" },
                ]}
                className="w-full"
              />
            </div>

            {/* Estimated Duration */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Estimated Duration
              </label>
              <input
                type="text"
                name="estimatedDuration"
                value={formData.estimatedDuration}
                onChange={handleChange}
                placeholder="e.g. 2 Hours"
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Optional Custom Form Fields Builder */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <FiLayers className="text-primary-600" />
                Custom Service Fields (Optional Suggestions)
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Suggest input fields customers must fill when booking this service (e.g. Number of Cylinders, Building Type). Admin will review these before approval.
              </p>
            </div>
            <button
              type="button"
              onClick={addServiceField}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 hover:bg-primary-100 text-primary-700 text-xs font-bold rounded-xl transition-colors"
            >
              <FiPlus />
              <span>Add Custom Field</span>
            </button>
          </div>

          {serviceFields.length === 0 ? (
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-center text-xs text-gray-500">
              No custom fields added yet. Click "+ Add Custom Field" above to suggest customer booking inputs.
            </div>
          ) : (
            <div className="space-y-3">
              {serviceFields.map((field, idx) => (
                <div key={idx} className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-3 items-center">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                        Field Label *
                      </label>
                      <input
                        type="text"
                        value={field.label}
                        onChange={(e) => updateServiceField(idx, "label", e.target.value)}
                        placeholder="e.g. Number of Cylinders"
                        className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                        Input Type *
                      </label>
                      <select
                        value={field.type}
                        onChange={(e) => updateServiceField(idx, "type", e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
                      >
                        <option value="TEXT">Short Text</option>
                        <option value="TEXTAREA">Long Text / Notes</option>
                        <option value="NUMBER">Number</option>
                        <option value="SELECT">Select Dropdown</option>
                        <option value="MULTI_SELECT">Multi Select</option>
                        <option value="RADIO">Radio Buttons</option>
                        <option value="CHECKBOX">Checkbox</option>
                        <option value="DATE">Date Picker</option>
                        <option value="FILE">File Upload</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                        Placeholder
                      </label>
                      <input
                        type="text"
                        value={field.placeholder}
                        onChange={(e) => updateServiceField(idx, "placeholder", e.target.value)}
                        placeholder="e.g. Enter quantity"
                        className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
                      />
                    </div>

                    <div className="flex items-center justify-between sm:justify-start gap-4 pt-4 sm:pt-0">
                      <label className="inline-flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => updateServiceField(idx, "required", e.target.checked)}
                          className="rounded text-primary-600 focus:ring-primary-500"
                        />
                        <span>Required</span>
                      </label>

                      <button
                        type="button"
                        onClick={() => removeServiceField(idx)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-auto"
                        title="Remove field"
                      >
                        <FiX className="text-base" />
                      </button>
                    </div>
                  </div>

                  {["SELECT", "MULTI_SELECT", "RADIO", "CHECKBOX"].includes(field.type) && (
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                        Options (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={field.optionsInput || (field.options || []).join(", ")}
                        onChange={(e) => updateServiceField(idx, "optionsInput", e.target.value)}
                        placeholder="Option 1, Option 2, Option 3"
                        className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Additional Notes */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm space-y-3">
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Additional Notes for Admin
          </label>
          <textarea
            name="additionalNotes"
            rows={2}
            value={formData.additionalNotes}
            onChange={handleChange}
            placeholder="Any special remarks or context for Admin reviewing this service request..."
            className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          />
        </div>

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={() => navigate("/vendor/services/my-requests")}
            className="px-5 py-2.5 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-primary-600 to-primary-700 text-white text-sm font-bold rounded-xl hover:from-primary-500 hover:to-primary-600 transition-all shadow-md disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>Submitting...</span>
            ) : (
              <>
                <FiCheckCircle />
                <span>Submit Service Request</span>
              </>
            )}
          </button>
        </div>
      </form>
    </motion.div>
  );
};

export default RequestService;
