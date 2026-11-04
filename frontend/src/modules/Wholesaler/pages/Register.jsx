import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { FiBriefcase, FiUpload, FiCheckCircle } from "react-icons/fi";
import toast from "react-hot-toast";
import { useWholesalerAuthStore } from "../store/wholesalerAuthStore";
import AuthShell, { inputClass, labelClass, primaryButtonClass } from "../components/AuthShell";

// Same 15-character GSTIN format the backend validates.
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const BUSINESS_TYPES = ["Distributor", "Manufacturer", "Dealer", "Trader", "Importer", "Other"];
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const Field = ({ label, required, hint, children }) => (
  <div>
    <label className={labelClass}>
      {label} {required && <span className="text-[#E31E24]">*</span>}
    </label>
    {children}
    {hint && <p className="text-[11px] text-[#64748B] mt-1">{hint}</p>}
  </div>
);

const FilePicker = ({ label, file, onChange }) => (
  <Field label={label} required hint="PDF, JPG or PNG · up to 5 MB">
    <label className="flex items-center gap-3 px-3.5 py-3 bg-[#F8FAFC] border border-dashed border-[#CBD5E1] rounded-xl cursor-pointer hover:border-[#E31E24] transition-colors">
      {file ? <FiCheckCircle className="text-emerald-600 flex-shrink-0" /> : <FiUpload className="text-[#64748B] flex-shrink-0" />}
      <span className={`text-sm truncate ${file ? "text-[#0F172A] font-medium" : "text-[#94A3B8]"}`}>
        {file ? file.name : "Choose file"}
      </span>
      <input
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] || null)}
      />
    </label>
  </Field>
);

const SectionTitle = ({ children }) => (
  <h2 className="text-sm font-extrabold text-[#0F172A] uppercase tracking-wider border-b border-[#E5E7EB] pb-2">{children}</h2>
);

const WholesalerRegister = () => {
  const navigate = useNavigate();
  const { register, isLoading } = useWholesalerAuthStore();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    businessName: "",
    gstNumber: "",
    businessType: "",
    expectedMonthlyVolume: "",
    description: "",
    address: { street: "", city: "", state: "", zipCode: "", country: "India" },
  });
  const [gstCertificate, setGstCertificate] = useState(null);
  const [identityProof, setIdentityProof] = useState(null);

  const setField = (name, value) => setFormData((prev) => ({ ...prev, [name]: value }));
  const setAddress = (name, value) => setFormData((prev) => ({ ...prev, address: { ...prev.address, [name]: value } }));

  const pickFile = (setter) => (file) => {
    if (file && file.size > MAX_FILE_BYTES) {
      toast.error("File must be 5 MB or smaller.");
      return;
    }
    setter(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const gstin = formData.gstNumber.trim().toUpperCase();
    const address = Object.fromEntries(Object.entries(formData.address).map(([k, v]) => [k, v.trim()]));

    if (!formData.name.trim() || !formData.email.trim() || !formData.phone.trim() || !formData.businessName.trim()) {
      toast.error("Please fill in all required fields.");
      return;
    }
    if (!GSTIN_PATTERN.test(gstin)) {
      toast.error("Enter a valid 15-character GSTIN.");
      return;
    }
    if (Object.values(address).some((v) => !v)) {
      toast.error("Please complete the business address.");
      return;
    }
    if (!gstCertificate || !identityProof) {
      toast.error("GST certificate and identity proof are required.");
      return;
    }
    if (formData.password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    const payload = new FormData();
    payload.append("name", formData.name.trim());
    payload.append("email", formData.email.trim().toLowerCase());
    payload.append("phone", formData.phone.trim());
    payload.append("password", formData.password);
    payload.append("businessName", formData.businessName.trim());
    payload.append("gstNumber", gstin);
    payload.append("businessType", formData.businessType);
    payload.append("expectedMonthlyVolume", formData.expectedMonthlyVolume.trim());
    payload.append("description", formData.description.trim());
    payload.append("address", JSON.stringify(address));
    payload.append("license", gstCertificate);
    payload.append("identity", identityProof);

    try {
      const result = await register(payload);
      toast.success(result.message || "Registration submitted!");
      navigate("/wholesaler/verification", { state: { email: formData.email.trim().toLowerCase() } });
    } catch (error) {
      if (!error?.toastShown) toast.error(error.message || "Registration failed. Please try again.");
    }
  };

  return (
    <AuthShell
      wide
      icon={FiBriefcase}
      title="Register as Wholesaler"
      subtitle="Sell in bulk to verified business buyers. Your account is activated after we verify your GSTIN."
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="space-y-4">
          <SectionTitle>Business Details</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Business / Trade Name" required>
              <input className={inputClass} value={formData.businessName} onChange={(e) => setField("businessName", e.target.value)} placeholder="e.g. Sharma Fire Equipments" required />
            </Field>
            <Field label="GSTIN" required hint="15 characters, e.g. 27AAPFU0939F1ZV">
              <input
                className={`${inputClass} uppercase`}
                value={formData.gstNumber}
                onChange={(e) => setField("gstNumber", e.target.value.toUpperCase().replace(/\s/g, ""))}
                maxLength={15}
                placeholder="22AAAAA0000A1Z5"
                required
              />
            </Field>
            <Field label="Business Type">
              <select className={inputClass} value={formData.businessType} onChange={(e) => setField("businessType", e.target.value)}>
                <option value="">Select type</option>
                {BUSINESS_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </Field>
            <Field label="Expected Monthly Volume">
              <input className={inputClass} value={formData.expectedMonthlyVolume} onChange={(e) => setField("expectedMonthlyVolume", e.target.value)} placeholder="e.g. ₹5–10 lakh / 500 units" />
            </Field>
          </div>
          <Field label="About Your Business">
            <textarea
              className={`${inputClass} min-h-[80px]`}
              value={formData.description}
              onChange={(e) => setField("description", e.target.value)}
              maxLength={1000}
              placeholder="Products you supply, brands, service areas…"
            />
          </Field>
        </section>

        <section className="space-y-4">
          <SectionTitle>Contact Person</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Full Name" required>
              <input className={inputClass} value={formData.name} onChange={(e) => setField("name", e.target.value)} required />
            </Field>
            <Field label="Phone" required>
              <input type="tel" className={inputClass} value={formData.phone} onChange={(e) => setField("phone", e.target.value)} required />
            </Field>
            <Field label="Email" required>
              <input type="email" className={inputClass} value={formData.email} onChange={(e) => setField("email", e.target.value)} placeholder="business@example.com" required />
            </Field>
          </div>
        </section>

        <section className="space-y-4">
          <SectionTitle>Business Address (Pickup / Warehouse)</SectionTitle>
          <Field label="Street Address" required>
            <input className={inputClass} value={formData.address.street} onChange={(e) => setAddress("street", e.target.value)} required />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="City" required>
              <input className={inputClass} value={formData.address.city} onChange={(e) => setAddress("city", e.target.value)} required />
            </Field>
            <Field label="State" required>
              <input className={inputClass} value={formData.address.state} onChange={(e) => setAddress("state", e.target.value)} required />
            </Field>
            <Field label="PIN Code" required>
              <input className={inputClass} value={formData.address.zipCode} onChange={(e) => setAddress("zipCode", e.target.value)} required />
            </Field>
            <Field label="Country" required>
              <input className={inputClass} value={formData.address.country} onChange={(e) => setAddress("country", e.target.value)} required />
            </Field>
          </div>
        </section>

        <section className="space-y-4">
          <SectionTitle>Documents</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FilePicker label="GST Registration Certificate" file={gstCertificate} onChange={pickFile(setGstCertificate)} />
            <FilePicker label="Identity Proof (PAN / Aadhaar)" file={identityProof} onChange={pickFile(setIdentityProof)} />
          </div>
        </section>

        <section className="space-y-4">
          <SectionTitle>Account Password</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Password" required hint="At least 6 characters">
              <input type="password" className={inputClass} value={formData.password} onChange={(e) => setField("password", e.target.value)} required />
            </Field>
            <Field label="Confirm Password" required>
              <input type="password" className={inputClass} value={formData.confirmPassword} onChange={(e) => setField("confirmPassword", e.target.value)} required />
            </Field>
          </div>
          <p className="text-[11px] text-[#64748B] leading-relaxed">
            Once approved, use the same email and password on the SafeFire app to buy from other wholesalers.
          </p>
        </section>

        <button type="submit" disabled={isLoading} className={primaryButtonClass}>
          {isLoading ? "Submitting..." : "Submit for Verification"}
        </button>

        <p className="text-center text-xs text-[#64748B] pt-2 border-t border-[#E5E7EB]">
          Already registered?{" "}
          <Link to="/wholesaler/login" className="font-bold text-[#E31E24] hover:underline">Login</Link>
        </p>
      </form>
    </AuthShell>
  );
};

export default WholesalerRegister;
