import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FiSave, FiShoppingBag, FiGlobe, FiUpload, FiTrash2, FiX, FiAlertTriangle } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import { useVendorAuthStore } from "../../store/vendorAuthStore";
import { uploadVendorImage } from "../../services/vendorService";
import toast from "react-hot-toast";

const StoreSettings = () => {
  const navigate = useNavigate();
  const { vendor, updateProfile, deleteAccount } = useVendorAuthStore();
  const [formData, setFormData] = useState({});
  const [activeSection, setActiveSection] = useState("identity");
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  useEffect(() => {
    if (vendor) {
      setFormData({
        storeName: vendor.storeName || "",
        storeLogo: vendor.storeLogo || "",
        storeDescription: vendor.storeDescription || "",
        email: vendor.email || "",
        phone: vendor.phone || "",
        address: vendor.address
          ? `${vendor.address.street || ""}, ${vendor.address.city || ""}, ${vendor.address.state || ""
          } ${vendor.address.zipCode || ""}`
          : "",
        businessHours: vendor.businessHours || "Mon-Fri 9AM-6PM",
      });
    }
  }, [vendor]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast.error("Please select an image file");
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image size should be less than 5MB");
        return;
      }

      setIsUploadingLogo(true);
      try {
        const res = await uploadVendorImage(file, "vendors/logos");
        const uploaded = res?.data ?? res;
        setFormData((prev) => ({
          ...prev,
          storeLogo: uploaded?.url || "",
        }));
        toast.success("Logo uploaded successfully");
      } catch {
        // api.js shows toast
      } finally {
        setIsUploadingLogo(false);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!vendor) return;

    try {
      // Parse address string into the object shape the backend expects
      let addressData = vendor.address || {};
      if (formData.address) {
        const addressParts = formData.address.split(",");
        if (addressParts.length >= 3) {
          addressData = {
            street: addressParts[0].trim(),
            city: addressParts[1].trim(),
            state: addressParts[2].trim().split(" ")[0],
            zipCode: addressParts[2].trim().split(" ")[1] || "",
            country: vendor.address?.country || "India",
          };
        }
      }

      // Only send fields accepted by PUT /vendor/auth/profile
      await updateProfile({
        storeName: formData.storeName,
        storeLogo: formData.storeLogo,
        storeDescription: formData.storeDescription,
        phone: formData.phone,
        address: addressData,
      });
      toast.success("Store settings saved successfully");
    } catch {
      // api.js shows toast
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);
    try {
      await deleteAccount();
      toast.success("Your vendor account has been permanently deleted.");
      setShowDeleteModal(false);
      setDeleteConfirmText("");
      navigate("/vendor/login");
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || "Failed to delete vendor account.");
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const sections = [
    { id: "identity", label: "Store Identity", icon: FiShoppingBag },
    { id: "contact", label: "Contact Info", icon: FiGlobe },
  ];

  if (!vendor) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Loading vendor information...</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-full overflow-x-hidden">
      <div className="lg:hidden">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
          Store Settings
        </h1>
        <p className="text-sm sm:text-base text-gray-600">
          Configure your store identity and information
        </p>
      </div>

      {/* Section Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 max-w-full overflow-x-hidden">
        <div className="border-b border-gray-200 overflow-x-hidden">
          <div className="flex overflow-x-auto scrollbar-hide -mx-1 px-1">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 md:px-6 py-3 sm:py-4 border-b-2 transition-colors whitespace-nowrap text-xs sm:text-sm ${activeSection === section.id
                      ? "border-primary-600 text-primary-600 font-bold"
                      : "border-transparent text-gray-600 hover:text-gray-800"
                    }`}>
                  <Icon className="text-base sm:text-lg" />
                  <span>{section.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-3 sm:p-4 md:p-6">
          {/* Store Identity Section */}
          {activeSection === "identity" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Store Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="storeName"
                    value={formData.storeName || ""}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Store Logo
                  </label>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <div className="relative flex-1 sm:flex-initial">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="hidden"
                        id="logo-upload"
                        disabled={isUploadingLogo}
                      />
                      <label
                        htmlFor="logo-upload"
                        className={`flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed rounded-lg cursor-pointer transition-colors bg-white ${
                          isUploadingLogo
                            ? "border-gray-300 bg-gray-50 cursor-not-allowed"
                            : "border-primary-300 hover:border-primary-500 hover:bg-primary-50"
                        }`}
                      >
                        <FiUpload className={`text-base ${isUploadingLogo ? "text-primary-400 animate-spin" : "text-primary-600"}`} />
                        <span className="text-xs font-semibold text-gray-700">
                          {isUploadingLogo ? "Uploading..." : formData.storeLogo ? "Change Logo" : "Choose Logo"}
                        </span>
                      </label>
                    </div>

                    <input
                      type="text"
                      name="storeLogo"
                      value={formData.storeLogo || ""}
                      onChange={handleChange}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      placeholder="Or enter logo URL directly"
                    />
                  </div>

                  {formData.storeLogo && (
                    <div className="mt-3 flex items-center gap-3 bg-gray-50 p-2.5 rounded-lg border border-gray-200 w-full sm:w-fit">
                      <img
                        src={formData.storeLogo}
                        alt="Logo Preview"
                        className="w-16 h-16 object-cover rounded-lg border border-primary-200 shadow-sm"
                        onError={(e) => {
                          e.target.style.display = "none";
                        }}
                      />
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-xs text-gray-500 font-medium truncate max-w-[150px]">
                          {formData.storeLogo.split("/").pop()}
                        </span>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, storeLogo: "" })}
                          className="text-xs font-bold text-red-500 hover:text-red-700 transition-colors"
                        >
                          Remove Logo
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Store Description
                  </label>
                  <textarea
                    name="storeDescription"
                    value={formData.storeDescription || ""}
                    onChange={handleChange}
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Brief description of your store"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Contact Info Section */}
          {activeSection === "contact" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Contact Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email || ""}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Contact Phone <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone || ""}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Address
                  </label>
                  <textarea
                    name="address"
                    value={formData.address || ""}
                    onChange={handleChange}
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Street, City, State ZIP"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Business Hours
                  </label>
                  <input
                    type="text"
                    name="businessHours"
                    value={formData.businessHours || ""}
                    onChange={handleChange}
                    placeholder="Mon-Fri 9AM-6PM"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-4 sm:pt-6 border-t border-slate-200 mt-4 sm:mt-6">
            <button
              type="submit"
              className="flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white rounded-2xl shadow-lg shadow-primary-500/20 active:scale-95 transition-all font-bold text-sm sm:text-base w-full sm:w-auto">
              <FiSave />
              Save Settings
            </button>
          </div>
        </form>
      </div>

      {/* Danger Zone Card */}
      <div className="bg-red-50/50 rounded-2xl border border-red-200 p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2.5 text-red-600 font-black text-sm">
          <FiAlertTriangle className="text-base" />
          <span>Danger Zone</span>
        </div>
        <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
          Need to permanently close and delete your vendor account? This will permanently delete your store, catalog listings, and account records.
        </p>
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs sm:text-sm transition-colors flex items-center gap-2 shadow-sm"
          >
            <FiTrash2 />
            <span>Delete Vendor Account</span>
          </button>
        </div>
      </div>

      {/* Confirmation Modal for Deleting Vendor Account */}
      <AnimatePresence>
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isDeletingAccount && setShowDeleteModal(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full relative z-10 shadow-2xl border border-red-100 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center font-bold text-xl">
                    <FiTrash2 />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Delete Vendor Account</h3>
                    <p className="text-xs text-red-500 font-bold">Permanent Deletion</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !isDeletingAccount && setShowDeleteModal(false)}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 transition-colors"
                >
                  <FiX className="text-lg" />
                </button>
              </div>

              <div className="p-4 rounded-2xl bg-red-50/70 border border-red-100 space-y-2">
                <p className="text-xs sm:text-sm text-slate-800 font-bold leading-relaxed">
                  Are you sure you want to permanently delete your vendor account and store?
                </p>
                <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
                  <li>Your store profile, logo, products, and services will be permanently removed.</li>
                  <li>Deletion is blocked if there are active, unfulfilled customer orders or pending service requests.</li>
                </ul>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Type <span className="text-red-600 font-black">DELETE</span> to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Type DELETE"
                  className="w-full px-4 py-2.5 border-2 border-slate-200 focus:border-red-500 rounded-xl text-sm font-semibold focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteConfirmText("");
                    setShowDeleteModal(false);
                  }}
                  disabled={isDeletingAccount}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmText !== "DELETE" || isDeletingAccount}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-xs transition-colors shadow-md flex items-center justify-center gap-1.5"
                >
                  {isDeletingAccount ? (
                    <span>Deleting...</span>
                  ) : (
                    <>
                      <FiTrash2 />
                      <span>Delete Store</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default StoreSettings;
