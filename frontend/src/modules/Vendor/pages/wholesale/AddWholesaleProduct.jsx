import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { FiUpload, FiX } from "react-icons/fi";
import api from "../../../../shared/utils/api";
import { useVendorAuthStore } from "../../store/vendorAuthStore";
import { getVendorCapabilities } from "../../utils/vendorCapabilities";
import { createWholesaleProduct, getVendorBrands, uploadVendorImages } from "../../services/vendorService";

const inputClass =
  "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500";

const Field = ({ label, children, hint }) => (
  <label className="block">
    <span className="block text-sm font-semibold text-gray-700 mb-1">{label}</span>
    {children}
    {hint && <span className="block text-xs text-gray-500 mt-1">{hint}</span>}
  </label>
);

const AddWholesaleProduct = () => {
  const navigate = useNavigate();
  const { vendor } = useVendorAuthStore();
  const { sellsProducts } = getVendorCapabilities(vendor);

  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [images, setImages] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    categoryId: "",
    brandId: "",
    unit: "Piece",
    channel: "b2b",
    retailPrice: "",
    wholesalePrice: "",
    moq: 10,
    stockQuantity: "",
    taxRate: 18,
    hsnCode: "",
  });

  useEffect(() => {
    api.get("/categories/all").then((data) => setCategories(Array.isArray(data) ? data : [])).catch(() => {});
    getVendorBrands()
      .then((data) => setBrands(Array.isArray(data) ? data : data?.brands ?? []))
      .catch(() => {});
  }, []);

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, 8 - images.length);
    e.target.value = "";
    if (!files.length) return;
    setIsUploading(true);
    try {
      const uploaded = await uploadVendorImages(files, "vendors/products");
      setImages((prev) => [...prev, ...uploaded.map((u) => u.url).filter(Boolean)].slice(0, 8));
    } catch (err) {
      toast.error(err.message || "Image upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.name.trim().length < 2) return toast.error("Product name is required.");
    if (!form.categoryId) return toast.error("Please select a category.");
    if (form.wholesalePrice === "" || Number(form.wholesalePrice) < 0) return toast.error("Enter a valid wholesale price.");
    if (!Number.isInteger(Number(form.moq)) || Number(form.moq) < 1) return toast.error("MOQ must be a whole number of at least 1.");
    if (form.stockQuantity === "" || Number(form.stockQuantity) < 0) return toast.error("Enter a valid stock quantity.");
    if (form.channel === "both" && (form.retailPrice === "" || Number(form.retailPrice) < 0)) {
      return toast.error("Enter a valid retail price for B2C availability.");
    }

    setIsSubmitting(true);
    try {
      await createWholesaleProduct({
        name: form.name.trim(),
        description: form.description,
        categoryId: form.categoryId,
        ...(form.brandId ? { brandId: form.brandId } : {}),
        unit: form.unit,
        channel: form.channel,
        ...(form.channel === "both" ? { retailPrice: Number(form.retailPrice) } : {}),
        wholesalePrice: Number(form.wholesalePrice),
        moq: Number(form.moq),
        stockQuantity: Number(form.stockQuantity),
        taxRate: Number(form.taxRate),
        hsnCode: form.hsnCode,
        images,
      });
      toast.success("Wholesale product created.");
      navigate("/vendor/wholesale/products");
    } catch (err) {
      toast.error(err.message || "Failed to create wholesale product.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-1">Add Wholesale Product</h1>
        <p className="text-sm sm:text-base text-gray-600">
          Create a product for B2B buyers. To offer an existing retail product wholesale, use Wholesale Pricing instead.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 space-y-5">
        <Field label="Product Name *">
          <input value={form.name} onChange={set("name")} maxLength={200} className={inputClass} />
        </Field>

        <Field label="Description">
          <textarea value={form.description} onChange={set("description")} rows={3} className={inputClass} />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Category *">
            <select value={form.categoryId} onChange={set("categoryId")} className={inputClass}>
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Brand">
            <select value={form.brandId} onChange={set("brandId")} className={inputClass}>
              <option value="">No brand</option>
              {brands.map((b) => (
                <option key={b._id || b.id} value={b._id || b.id}>{b.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Unit">
            <input value={form.unit} onChange={set("unit")} maxLength={30} className={inputClass} />
          </Field>
        </div>

        <Field
          label="Sales Channel *"
          hint={!sellsProducts ? "Retail (B2C) availability requires the Product Seller capability." : undefined}>
          <div className="flex flex-wrap gap-2">
            {[
              { value: "b2b", label: "B2B only (Wholesale)" },
              { value: "both", label: "B2C + B2B (Both)", disabled: !sellsProducts },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={opt.disabled}
                onClick={() => setForm((prev) => ({ ...prev, channel: opt.value }))}
                className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-40 ${
                  form.channel === opt.value
                    ? "bg-sky-50 border-sky-400 text-sky-700"
                    : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                }`}>
                {opt.label}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {form.channel === "both" && (
            <Field label="Retail Price (₹) *">
              <input type="number" min="0" step="0.01" value={form.retailPrice} onChange={set("retailPrice")} className={inputClass} />
            </Field>
          )}
          <Field label="Wholesale Price (₹) *" hint="Per unit, charged to B2B buyers">
            <input type="number" min="0" step="0.01" value={form.wholesalePrice} onChange={set("wholesalePrice")} className={inputClass} />
          </Field>
          <Field label="MOQ *" hint="Minimum order quantity">
            <input type="number" min="1" step="1" value={form.moq} onChange={set("moq")} className={inputClass} />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Stock Quantity *">
            <input type="number" min="0" step="1" value={form.stockQuantity} onChange={set("stockQuantity")} className={inputClass} />
          </Field>
          <Field label="Tax Rate (%)">
            <input type="number" min="0" max="100" value={form.taxRate} onChange={set("taxRate")} className={inputClass} />
          </Field>
          <Field label="HSN Code">
            <input value={form.hsnCode} onChange={set("hsnCode")} maxLength={20} className={inputClass} />
          </Field>
        </div>

        <div>
          <span className="block text-sm font-semibold text-gray-700 mb-2">Images</span>
          <div className="flex flex-wrap gap-3">
            {images.map((url) => (
              <div key={url} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200">
                <img src={url} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  aria-label="Remove image"
                  onClick={() => setImages((prev) => prev.filter((u) => u !== url))}
                  className="absolute top-1 right-1 p-0.5 rounded-full bg-black/60 text-white">
                  <FiX className="text-xs" />
                </button>
              </div>
            ))}
            {images.length < 8 && (
              <label className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 text-xs cursor-pointer hover:border-primary-400">
                <FiUpload className="text-lg mb-1" />
                {isUploading ? "Uploading…" : "Upload"}
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} disabled={isUploading} />
              </label>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={isSubmitting || isUploading}
            className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-lg text-sm font-semibold">
            {isSubmitting ? "Creating…" : "Create Wholesale Product"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/vendor/wholesale/products")}
            className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold">
            Cancel
          </button>
        </div>
      </form>
    </motion.div>
  );
};

export default AddWholesaleProduct;
