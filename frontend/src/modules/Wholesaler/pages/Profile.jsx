import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { FiSave, FiFileText, FiCreditCard } from "react-icons/fi";
import { useWholesalerAuthStore } from "../store/wholesalerAuthStore";
import { getWholesalerProfile } from "../services/wholesalerService";

const inputClass =
  "w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#E31E24]/40 disabled:text-slate-500";
const labelClass = "block text-xs font-semibold text-slate-600 mb-1";

const toForm = (profile) => ({
  name: profile?.name || "",
  phone: profile?.phone || "",
  storeName: profile?.storeName || "",
  storeDescription: profile?.storeDescription || "",
  address: {
    street: profile?.address?.street || "",
    city: profile?.address?.city || "",
    state: profile?.address?.state || "",
    zipCode: profile?.address?.zipCode || "",
    country: profile?.address?.country || "India",
  },
});

const ReadOnly = ({ label, value }) => (
  <div>
    <p className={labelClass}>{label}</p>
    <p className="text-sm font-semibold text-slate-800 break-words">{value || "—"}</p>
  </div>
);

const WholesalerProfile = () => {
  const { updateProfile, isLoading } = useWholesalerAuthStore();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(toForm(null));

  useEffect(() => {
    getWholesalerProfile()
      .then((data) => {
        setProfile(data);
        setForm(toForm(data));
      })
      .catch(() => {});
  }, []);

  const setField = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));
  const setAddress = (name, value) => setForm((prev) => ({ ...prev, address: { ...prev.address, [name]: value } }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.storeName.trim()) {
      toast.error("Contact name and business name are required.");
      return;
    }
    const addressChanged = JSON.stringify(form.address) !== JSON.stringify(toForm(profile).address);
    if (addressChanged && Object.values(form.address).some((v) => !String(v).trim())) {
      toast.error("Please complete the business address.");
      return;
    }
    try {
      const { vendor } = await updateProfile({
        name: form.name.trim(),
        phone: form.phone.trim(),
        storeName: form.storeName.trim(),
        storeDescription: form.storeDescription.trim(),
        ...(addressChanged ? { address: form.address } : {}),
      });
      setProfile(vendor);
      toast.success("Business profile updated.");
    } catch (err) {
      if (!err?.toastShown) toast.error(err.message || "Failed to update profile.");
    }
  };

  const business = profile?.wholesaleCapability?.businessDetails || {};

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 max-w-4xl">
      <div>
        <h1 className="hidden lg:block text-3xl font-bold text-slate-900 mb-1">Business Profile</h1>
        <p className="text-sm text-slate-500">Your wholesaler account details. GSTIN changes need a new verification — contact support.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ReadOnly label="Email (login)" value={profile?.email} />
        <ReadOnly label="GSTIN" value={business.gstNumber} />
        <ReadOnly label="Business Type" value={business.businessType} />
        <ReadOnly label="Account Status" value={profile?.status ? profile.status.charAt(0).toUpperCase() + profile.status.slice(1) : ""} />
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="storeName">Business / Trade Name</label>
            <input id="storeName" className={inputClass} value={form.storeName} onChange={(e) => setField("storeName", e.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="name">Contact Person</label>
            <input id="name" className={inputClass} value={form.name} onChange={(e) => setField("name", e.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="phone">Phone</label>
            <input id="phone" type="tel" className={inputClass} value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor="storeDescription">About Your Business</label>
          <textarea id="storeDescription" className={`${inputClass} min-h-[80px]`} value={form.storeDescription} onChange={(e) => setField("storeDescription", e.target.value)} maxLength={500} />
        </div>

        <div>
          <h2 className="text-sm font-bold text-slate-800 mb-1">Business Address</h2>
          <p className="text-xs text-slate-500 mb-3">Also used as the pickup address for your wholesale orders.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="street">Street Address</label>
              <input id="street" className={inputClass} value={form.address.street} onChange={(e) => setAddress("street", e.target.value)} />
            </div>
            {[
              ["city", "City"],
              ["state", "State"],
              ["zipCode", "PIN Code"],
              ["country", "Country"],
            ].map(([key, label]) => (
              <div key={key}>
                <label className={labelClass} htmlFor={key}>{label}</label>
                <input id={key} className={inputClass} value={form.address[key]} onChange={(e) => setAddress(key, e.target.value)} />
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap gap-4 text-xs font-semibold">
            <Link to="/wholesaler/settings/payment" className="inline-flex items-center gap-1.5 text-[#E31E24] hover:underline"><FiCreditCard /> Payout settings</Link>
            <Link to="/wholesaler/documents" className="inline-flex items-center gap-1.5 text-[#E31E24] hover:underline"><FiFileText /> Documents</Link>
          </div>
          <button
            type="submit"
            disabled={isLoading || !profile}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#E31E24] hover:bg-[#C8191E] disabled:opacity-50 text-white rounded-lg text-sm font-semibold"
          >
            <FiSave /> {isLoading ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </motion.div>
  );
};

export default WholesalerProfile;
