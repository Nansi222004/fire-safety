import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { FiBriefcase, FiClock, FiAlertCircle, FiCheckCircle, FiArrowRight } from "react-icons/fi";
import { useVendorAuthStore } from "../../store/vendorAuthStore";
import { getWholesaleApplication, applyForWholesale } from "../../services/vendorService";

const BUSINESS_TYPES = ["Distributor", "Manufacturer", "Wholesaler", "Contractor / Installer", "Institutional Supplier", "Other"];

const WholesaleApplication = () => {
  const navigate = useNavigate();
  const { vendor, syncVendor } = useVendorAuthStore();
  const [status, setStatus] = useState(vendor?.wholesaleCapability?.status || "none");
  const [rejectionReason, setRejectionReason] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    businessType: BUSINESS_TYPES[0],
    gstNumber: "",
    expectedMonthlyVolume: "",
    description: "",
  });

  const applyServerState = (data) => {
    const nextStatus = data?.wholesaleCapability?.status || "none";
    const nextEnabled = data?.vendorCapabilities?.wholesaleEnabled === true;
    setStatus(nextStatus);
    setRejectionReason(data?.wholesaleCapability?.rejectionReason || "");
    const current = useVendorAuthStore.getState().vendor;
    if (current) {
      syncVendor({
        ...current,
        vendorCapabilities: { ...(current.vendorCapabilities || {}), wholesaleEnabled: nextEnabled },
        wholesaleCapability: { ...(current.wholesaleCapability || {}), status: nextStatus },
      });
    }
  };

  useEffect(() => {
    getWholesaleApplication()
      .then(applyServerState)
      .catch((err) => toast.error(err.message || "Failed to load wholesale status."))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.description.trim().length < 20) {
      toast.error("Please describe your wholesale business (at least 20 characters).");
      return;
    }
    setIsSubmitting(true);
    try {
      const data = await applyForWholesale(form);
      applyServerState(data);
      toast.success("Wholesale application submitted. Awaiting admin approval.");
    } catch (err) {
      toast.error(err.message || "Failed to submit wholesale application.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isApproved = status === "approved" && vendor?.vendorCapabilities?.wholesaleEnabled === true;
  const showForm = !isApproved && status !== "pending";

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto space-y-6">
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center flex-shrink-0">
            <FiBriefcase className="text-xl" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Wholesale / B2B Capability</h1>
            <p className="text-sm text-gray-600 mt-1">
              Sell in bulk to approved business buyers with wholesale pricing and minimum order quantities.
              This is an additional capability — your existing product and service workspaces stay exactly as they are.
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 text-sm text-gray-500">Loading status…</div>
      ) : isApproved ? (
        <div className="bg-emerald-50 rounded-xl p-6 border border-emerald-200 space-y-3">
          <div className="flex items-center gap-2 text-emerald-700 font-bold">
            <FiCheckCircle /> Wholesale capability is active
          </div>
          <button
            type="button"
            onClick={() => navigate("/vendor/wholesale/products")}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold">
            Go to Wholesale Products <FiArrowRight />
          </button>
        </div>
      ) : status === "pending" ? (
        <div className="bg-amber-50 rounded-xl p-6 border border-amber-200">
          <div className="flex items-center gap-2 text-amber-700 font-bold">
            <FiClock /> Application under review
          </div>
          <p className="text-sm text-amber-800 mt-2">
            Our team is reviewing your wholesale application. The Wholesale workspace will appear in your dashboard once approved.
          </p>
        </div>
      ) : null}

      {!isLoading && status === "rejected" && (
        <div className="bg-red-50 rounded-xl p-4 border border-red-200 text-sm text-red-800 flex gap-2">
          <FiAlertCircle className="flex-shrink-0 mt-0.5" />
          <span>
            Your previous application was not approved{rejectionReason ? `: ${rejectionReason}` : "."} You can update your details and apply again.
          </span>
        </div>
      )}

      {!isLoading && showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-sm font-semibold text-gray-700 mb-1">Business Type</span>
              <select
                value={form.businessType}
                onChange={(e) => setForm({ ...form, businessType: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                {BUSINESS_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-sm font-semibold text-gray-700 mb-1">GST Number</span>
              <input
                value={form.gstNumber}
                onChange={(e) => setForm({ ...form, gstNumber: e.target.value })}
                placeholder="e.g. 27ABCDE1234F1Z5"
                maxLength={20}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm uppercase focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </label>
          </div>
          <label className="block">
            <span className="block text-sm font-semibold text-gray-700 mb-1">Expected Monthly Volume</span>
            <input
              value={form.expectedMonthlyVolume}
              onChange={(e) => setForm({ ...form, expectedMonthlyVolume: e.target.value })}
              placeholder="e.g. 500 units / month"
              maxLength={100}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-semibold text-gray-700 mb-1">About your wholesale business *</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={4}
              maxLength={1000}
              placeholder="Product lines you supply in bulk, typical buyers, fulfilment capacity…"
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </label>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full sm:w-auto px-5 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-lg text-sm font-semibold">
            {isSubmitting ? "Submitting…" : "Apply for Wholesale"}
          </button>
        </form>
      )}
    </motion.div>
  );
};

export default WholesaleApplication;
