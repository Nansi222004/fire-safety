import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  FiMail,
  FiLock,
  FiEye,
  FiEyeOff,
  FiUser,
  FiPhone,
  FiShoppingBag,
  FiMapPin,
  FiFileText,
  FiUpload,
  FiCheckCircle,
  FiShield,
  FiArrowRight,
  FiInfo,
} from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useVendorAuthStore } from '../store/vendorAuthStore';
import toast from 'react-hot-toast';
import { appLogo } from '../../../shared/utils/imagePaths';

const VendorRegister = () => {
  const navigate = useNavigate();
  const { register: registerVendor, isLoading } = useVendorAuthStore();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    storeName: '',
    storeDescription: '',
    address: {
      street: '',
      city: '',
      state: '',
      zipCode: '',
      country: 'USA',
    },
  });

  const [licenseFile, setLicenseFile] = useState(null);
  const [identityFile, setIdentityFile] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [vendorCapabilities, setVendorCapabilities] = useState({
    sellsProducts: true,
    providesServices: false,
  });

  const toggleCapability = (cap) => {
    setVendorCapabilities((prev) => {
      const next = { ...prev, [cap]: !prev[cap] };
      // Prevent unselecting both
      if (!next.sellsProducts && !next.providesServices) {
        toast.error('At least one capability (Products or Services) must be selected.');
        return prev;
      }
      return next;
    });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name.startsWith('address.')) {
      const addressField = name.split('.')[1];
      setFormData({
        ...formData,
        address: {
          ...formData.address,
          [addressField]: value,
        },
      });
    } else {
      setFormData({
        ...formData,
        [name]: value,
      });
    }
  };

  const handleFileChange = (e, setFile) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File size must be under 10MB');
        return;
      }
      setFile(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Capability Validation
    if (!vendorCapabilities.sellsProducts && !vendorCapabilities.providesServices) {
      toast.error('At least one offering (Products or Services) must be selected.');
      return;
    }

    // Required Field Validations
    if (!formData.name || !formData.email || !formData.phone || !formData.password || !formData.storeName) {
      toast.error('Please fill in all required personal and store fields');
      return;
    }

    // Business Address Validations
    if (
      !formData.address.street.trim() ||
      !formData.address.city.trim() ||
      !formData.address.state.trim() ||
      !formData.address.zipCode.trim() ||
      !formData.address.country.trim()
    ) {
      toast.error('All Business Address fields (Street Address, City, State, Zip Code, Country) are mandatory');
      return;
    }

    // Document Validations
    if (!licenseFile) {
      toast.error('Business License document is mandatory');
      return;
    }

    if (!identityFile) {
      toast.error('Identity Proof document is mandatory');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    try {
      const payload = new FormData();
      payload.append('name', formData.name.trim());
      payload.append('email', formData.email.trim().toLowerCase());
      payload.append('password', formData.password);
      payload.append('phone', formData.phone.trim());
      payload.append('storeName', formData.storeName.trim());
      payload.append('storeDescription', formData.storeDescription.trim());
      payload.append('vendorCapabilities', JSON.stringify(vendorCapabilities));
      payload.append('address', JSON.stringify({
        street: formData.address.street.trim(),
        city: formData.address.city.trim(),
        state: formData.address.state.trim(),
        zipCode: formData.address.zipCode.trim(),
        country: formData.address.country.trim(),
      }));
      payload.append('license', licenseFile);
      payload.append('identity', identityFile);

      const result = await registerVendor(payload);

      toast.success(result.message || 'Registration successful!');
      // Navigate to verification page
      navigate('/vendor/verification', { state: { email: formData.email } });
    } catch (error) {
      toast.error(error.message || error?.response?.data?.message || 'Registration failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1F2937] flex flex-col">
      {/* 1. Top Brand Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-[#E5E7EB] px-4 lg:px-8 py-3.5 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <img src={appLogo} alt="Fire Safety Shop Logo" className="h-9 w-auto object-contain" />
            <div>
              <span className="text-lg font-bold text-[#0F172A] tracking-tight group-hover:text-[#E31E24] transition-colors block leading-none">
                Fire Safety Shop
              </span>
              <span className="text-xs text-[#64748B] font-medium block mt-0.5">
                Seller Registration
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2.5">
            <span className="hidden sm:inline text-xs text-[#64748B]">Already have a seller account?</span>
            <Link
              to="/vendor/login"
              className="px-4 py-2 text-xs font-semibold text-[#E31E24] bg-[#FEF2F2] hover:bg-red-100 rounded-xl border border-red-200 transition-colors"
            >
              Login
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 lg:py-10">
        <div className="max-w-5xl mx-auto space-y-6">
          
          {/* Header Card */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 md:p-8 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#FEF2F2] text-[#E31E24] flex items-center justify-center flex-shrink-0 border border-red-100">
                <FiShoppingBag className="text-2xl" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-extrabold text-[#0F172A] tracking-tight">
                  Become a Fire Safety Seller
                </h1>
                <p className="text-sm text-[#64748B] mt-1">
                  Register your business to sell fire safety products and equipment on Fire Safety Shop.
                </p>
              </div>
            </div>

            {/* Section Step Progress Indicators */}
            <div className="mt-8 pt-6 border-t border-[#E5E7EB] grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-semibold">
              <div className="flex items-center gap-2 text-[#E31E24]">
                <span className="w-6 h-6 rounded-full bg-[#E31E24] text-white flex items-center justify-center text-[11px] font-bold">
                  01
                </span>
                <span>Personal Info</span>
              </div>
              <div className="flex items-center gap-2 text-[#64748B]">
                <span className="w-6 h-6 rounded-full bg-[#FEF2F2] text-[#E31E24] border border-red-200 flex items-center justify-center text-[11px] font-bold">
                  02
                </span>
                <span>Store Information</span>
              </div>
              <div className="flex items-center gap-2 text-[#64748B]">
                <span className="w-6 h-6 rounded-full bg-[#FEF2F2] text-[#E31E24] border border-red-200 flex items-center justify-center text-[11px] font-bold">
                  03
                </span>
                <span>Business & Documents</span>
              </div>
              <div className="flex items-center gap-2 text-[#64748B]">
                <span className="w-6 h-6 rounded-full bg-[#FEF2F2] text-[#E31E24] border border-red-200 flex items-center justify-center text-[11px] font-bold">
                  04
                </span>
                <span>Account Security</span>
              </div>
            </div>
          </div>

          {/* Grid Layout: Form + Desktop Seller Info Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left Main Registration Form */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="lg:col-span-8 bg-white rounded-2xl border border-[#E5E7EB] p-6 md:p-8 shadow-sm"
            >
              <form onSubmit={handleSubmit} className="space-y-8">

                {/* 0. Marketplace Capabilities Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3 border-b border-[#E5E7EB] pb-3">
                    <span className="w-7 h-7 rounded-lg bg-[#FEF2F2] text-[#E31E24] font-bold text-xs flex items-center justify-center border border-red-100">
                      ★
                    </span>
                    <div>
                      <h2 className="text-base font-bold text-[#0F172A] uppercase tracking-wider text-xs">
                        What would you like to offer on SafeFire?
                      </h2>
                      <p className="text-xs text-[#64748B]">Select one or both marketplace modules you wish to participate in.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    {/* Products Card */}
                    <div
                      onClick={() => toggleCapability('sellsProducts')}
                      className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${
                        vendorCapabilities.sellsProducts
                          ? 'border-[#E31E24] bg-[#FEF2F2]/40 shadow-sm'
                          : 'border-[#E5E7EB] bg-white hover:border-gray-300 opacity-70'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="text-2xl mb-2">🛒</div>
                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center text-xs font-bold ${
                          vendorCapabilities.sellsProducts ? 'bg-[#E31E24] border-[#E31E24] text-white' : 'border-gray-300 bg-white'
                        }`}>
                          {vendorCapabilities.sellsProducts && '✓'}
                        </div>
                      </div>
                      <h3 className="font-bold text-[#0F172A] text-sm mb-1">FIRE SAFETY PRODUCTS</h3>
                      <p className="text-xs text-[#64748B] leading-relaxed">
                        Sell fire safety equipment and products through the SafeFire marketplace.
                      </p>
                    </div>

                    {/* Services Card */}
                    <div
                      onClick={() => toggleCapability('providesServices')}
                      className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${
                        vendorCapabilities.providesServices
                          ? 'border-[#E31E24] bg-[#FEF2F2]/40 shadow-sm'
                          : 'border-[#E5E7EB] bg-white hover:border-gray-300 opacity-70'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="text-2xl mb-2">🛠️</div>
                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center text-xs font-bold ${
                          vendorCapabilities.providesServices ? 'bg-[#E31E24] border-[#E31E24] text-white' : 'border-gray-300 bg-white'
                        }`}>
                          {vendorCapabilities.providesServices && '✓'}
                        </div>
                      </div>
                      <h3 className="font-bold text-[#0F172A] text-sm mb-1">FIRE SAFETY SERVICES</h3>
                      <p className="text-xs text-[#64748B] leading-relaxed">
                        Provide professional fire safety maintenance, refill, and installation services to customers.
                      </p>
                    </div>
                  </div>
                </div>

                {/* 1. Personal Information Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3 border-b border-[#E5E7EB] pb-3">
                    <span className="w-7 h-7 rounded-lg bg-[#FEF2F2] text-[#E31E24] font-bold text-xs flex items-center justify-center border border-red-100">
                      01
                    </span>
                    <div>
                      <h2 className="text-base font-bold text-[#0F172A] uppercase tracking-wider text-xs">
                        Personal Information
                      </h2>
                      <p className="text-xs text-[#64748B]">Tell us who will manage this seller account.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-[#1F2937] uppercase tracking-wider mb-1.5">
                        Full Name <span className="text-[#E31E24]">*</span>
                      </label>
                      <div className="relative">
                        <FiUser className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-[#64748B]" />
                        <input
                          type="text"
                          name="name"
                          value={formData.name}
                          onChange={handleChange}
                          placeholder="John Doe"
                          className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#D1D5DB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:ring-1 focus:ring-[#E31E24] text-sm text-[#1F2937] placeholder:text-[#94A3B8]"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#1F2937] uppercase tracking-wider mb-1.5">
                        Email Address <span className="text-[#E31E24]">*</span>
                      </label>
                      <div className="relative">
                        <FiMail className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-[#64748B]" />
                        <input
                          type="email"
                          name="email"
                          value={formData.email}
                          onChange={handleChange}
                          placeholder="vendor@example.com"
                          className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#D1D5DB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:ring-1 focus:ring-[#E31E24] text-sm text-[#1F2937] placeholder:text-[#94A3B8]"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#1F2937] uppercase tracking-wider mb-1.5">
                        Phone Number <span className="text-[#E31E24]">*</span>
                      </label>
                      <div className="relative">
                        <FiPhone className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-[#64748B]" />
                        <input
                          type="tel"
                          name="phone"
                          value={formData.phone}
                          onChange={handleChange}
                          placeholder="+1234567890"
                          className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#D1D5DB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:ring-1 focus:ring-[#E31E24] text-sm text-[#1F2937] placeholder:text-[#94A3B8]"
                          required
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 6. Store Information Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3 border-b border-[#E5E7EB] pb-3">
                    <span className="w-7 h-7 rounded-lg bg-[#FEF2F2] text-[#E31E24] font-bold text-xs flex items-center justify-center border border-red-100">
                      02
                    </span>
                    <div>
                      <h2 className="text-base font-bold text-[#0F172A] uppercase tracking-wider text-xs">
                        Store Information
                      </h2>
                      <p className="text-xs text-[#64748B]">Add the basic information customers will see about your store.</p>
                    </div>
                  </div>

                  <div className="space-y-4 pt-2">
                    <div>
                      <label className="block text-xs font-bold text-[#1F2937] uppercase tracking-wider mb-1.5">
                        Store Name <span className="text-[#E31E24]">*</span>
                      </label>
                      <div className="relative">
                        <FiShoppingBag className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-[#64748B]" />
                        <input
                          type="text"
                          name="storeName"
                          value={formData.storeName}
                          onChange={handleChange}
                          placeholder="My Fire Safety Store"
                          className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#D1D5DB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:ring-1 focus:ring-[#E31E24] text-sm text-[#1F2937] placeholder:text-[#94A3B8]"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#1F2937] uppercase tracking-wider mb-1.5">
                        Store Description
                      </label>
                      <textarea
                        name="storeDescription"
                        value={formData.storeDescription}
                        onChange={handleChange}
                        placeholder="Describe your store and safety equipment catalog..."
                        rows={3}
                        className="w-full px-4 py-2.5 bg-white border border-[#D1D5DB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:ring-1 focus:ring-[#E31E24] text-sm text-[#1F2937] placeholder:text-[#94A3B8]"
                      />
                    </div>
                  </div>
                </div>

                {/* 7. Business & Documents Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3 border-b border-[#E5E7EB] pb-3">
                    <span className="w-7 h-7 rounded-lg bg-[#FEF2F2] text-[#E31E24] font-bold text-xs flex items-center justify-center border border-red-100">
                      03
                    </span>
                    <div>
                      <h2 className="text-base font-bold text-[#0F172A] uppercase tracking-wider text-xs">
                        Business & Documents
                      </h2>
                      <p className="text-xs text-[#64748B]">Provide the address and documents required to review your seller application.</p>
                    </div>
                  </div>

                  {/* Business Address */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-[#1F2937] uppercase tracking-wider mb-1.5">
                        Street Address <span className="text-[#E31E24]">*</span>
                      </label>
                      <div className="relative">
                        <FiMapPin className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-[#64748B]" />
                        <input
                          type="text"
                          name="address.street"
                          value={formData.address.street}
                          onChange={handleChange}
                          placeholder="123 Industrial Safety Way"
                          className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#D1D5DB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:ring-1 focus:ring-[#E31E24] text-sm text-[#1F2937] placeholder:text-[#94A3B8]"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#1F2937] uppercase tracking-wider mb-1.5">
                        City <span className="text-[#E31E24]">*</span>
                      </label>
                      <input
                        type="text"
                        name="address.city"
                        value={formData.address.city}
                        onChange={handleChange}
                        placeholder="New York"
                        className="w-full px-4 py-2.5 bg-white border border-[#D1D5DB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:ring-1 focus:ring-[#E31E24] text-sm text-[#1F2937] placeholder:text-[#94A3B8]"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#1F2937] uppercase tracking-wider mb-1.5">
                        State <span className="text-[#E31E24]">*</span>
                      </label>
                      <input
                        type="text"
                        name="address.state"
                        value={formData.address.state}
                        onChange={handleChange}
                        placeholder="NY"
                        className="w-full px-4 py-2.5 bg-white border border-[#D1D5DB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:ring-1 focus:ring-[#E31E24] text-sm text-[#1F2937] placeholder:text-[#94A3B8]"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#1F2937] uppercase tracking-wider mb-1.5">
                        Zip Code <span className="text-[#E31E24]">*</span>
                      </label>
                      <input
                        type="text"
                        name="address.zipCode"
                        value={formData.address.zipCode}
                        onChange={handleChange}
                        placeholder="10001"
                        className="w-full px-4 py-2.5 bg-white border border-[#D1D5DB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:ring-1 focus:ring-[#E31E24] text-sm text-[#1F2937] placeholder:text-[#94A3B8]"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#1F2937] uppercase tracking-wider mb-1.5">
                        Country <span className="text-[#E31E24]">*</span>
                      </label>
                      <input
                        type="text"
                        name="address.country"
                        value={formData.address.country}
                        onChange={handleChange}
                        placeholder="USA"
                        className="w-full px-4 py-2.5 bg-white border border-[#D1D5DB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:ring-1 focus:ring-[#E31E24] text-sm text-[#1F2937] placeholder:text-[#94A3B8]"
                        required
                      />
                    </div>
                  </div>

                  {/* Verification Document Uploads */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                    {/* Business License Upload */}
                    <div className="bg-white p-4 border-2 border-dashed border-[#D1D5DB] hover:border-[#E31E24] transition-colors rounded-xl flex flex-col justify-between">
                      <div>
                        <label className="block text-xs font-bold text-[#0F172A] mb-1 flex items-center gap-1.5">
                          <FiFileText className="text-[#E31E24]" />
                          Business License <span className="text-[#E31E24]">*</span>
                        </label>
                        <p className="text-xs text-[#64748B] mb-3">Upload business registration / trade license (PDF/Image max 10MB)</p>
                      </div>

                      <div>
                        <input
                          type="file"
                          accept=".pdf,image/*"
                          onChange={(e) => handleFileChange(e, setLicenseFile)}
                          id="license-upload"
                          className="hidden"
                          required
                        />
                        <label
                          htmlFor="license-upload"
                          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#FEF2F2] text-[#E31E24] rounded-xl cursor-pointer hover:bg-red-100 font-semibold text-xs transition-colors border border-red-200"
                        >
                          <FiUpload />
                          {licenseFile ? 'Change License File' : 'Upload License'}
                        </label>

                        {licenseFile && (
                          <div className="mt-2.5 flex items-center gap-2 text-xs font-medium text-[#E31E24] bg-[#FEF2F2] p-2 rounded-lg border border-red-200">
                            <FiCheckCircle className="text-[#E31E24] flex-shrink-0" />
                            <span className="truncate">{licenseFile.name}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Identity Proof Upload */}
                    <div className="bg-white p-4 border-2 border-dashed border-[#D1D5DB] hover:border-[#E31E24] transition-colors rounded-xl flex flex-col justify-between">
                      <div>
                        <label className="block text-xs font-bold text-[#0F172A] mb-1 flex items-center gap-1.5">
                          <FiUser className="text-[#E31E24]" />
                          Identity Proof <span className="text-[#E31E24]">*</span>
                        </label>
                        <p className="text-xs text-[#64748B] mb-3">Upload Passport, Driver License, or ID Card (PDF/Image max 10MB)</p>
                      </div>

                      <div>
                        <input
                          type="file"
                          accept=".pdf,image/*"
                          onChange={(e) => handleFileChange(e, setIdentityFile)}
                          id="identity-upload"
                          className="hidden"
                          required
                        />
                        <label
                          htmlFor="identity-upload"
                          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#FEF2F2] text-[#E31E24] rounded-xl cursor-pointer hover:bg-red-100 font-semibold text-xs transition-colors border border-red-200"
                        >
                          <FiUpload />
                          {identityFile ? 'Change Identity File' : 'Upload Identity'}
                        </label>

                        {identityFile && (
                          <div className="mt-2.5 flex items-center gap-2 text-xs font-medium text-[#E31E24] bg-[#FEF2F2] p-2 rounded-lg border border-red-200">
                            <FiCheckCircle className="text-[#E31E24] flex-shrink-0" />
                            <span className="truncate">{identityFile.name}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 8. Account Security Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3 border-b border-[#E5E7EB] pb-3">
                    <span className="w-7 h-7 rounded-lg bg-[#FEF2F2] text-[#E31E24] font-bold text-xs flex items-center justify-center border border-red-100">
                      04
                    </span>
                    <div>
                      <h2 className="text-base font-bold text-[#0F172A] uppercase tracking-wider text-xs">
                        Account Security
                      </h2>
                      <p className="text-xs text-[#64748B]">Choose a strong password for your seller account.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="block text-xs font-bold text-[#1F2937] uppercase tracking-wider mb-1.5">
                        Password <span className="text-[#E31E24]">*</span>
                      </label>
                      <div className="relative">
                        <FiLock className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-[#64748B]" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          name="password"
                          value={formData.password}
                          onChange={handleChange}
                          placeholder="Minimum 6 characters"
                          className="w-full pl-10 pr-10 py-2.5 bg-white border border-[#D1D5DB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:ring-1 focus:ring-[#E31E24] text-sm text-[#1F2937] placeholder:text-[#94A3B8]"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-1/2 transform -translate-y-1/2 text-[#64748B] hover:text-[#0F172A]"
                        >
                          {showPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#1F2937] uppercase tracking-wider mb-1.5">
                        Confirm Password <span className="text-[#E31E24]">*</span>
                      </label>
                      <div className="relative">
                        <FiLock className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-[#64748B]" />
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          name="confirmPassword"
                          value={formData.confirmPassword}
                          onChange={handleChange}
                          placeholder="Re-enter password"
                          className="w-full pl-10 pr-10 py-2.5 bg-white border border-[#D1D5DB] rounded-xl focus:outline-none focus:border-[#E31E24] focus:ring-1 focus:ring-[#E31E24] text-sm text-[#1F2937] placeholder:text-[#94A3B8]"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3.5 top-1/2 transform -translate-y-1/2 text-[#64748B] hover:text-[#0F172A]"
                        >
                          {showConfirmPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Important Notice */}
                <div className="bg-[#FEF2F2] border border-red-200 rounded-xl p-4 flex items-start gap-3">
                  <FiInfo className="text-[#E31E24] text-lg flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-[#1F2937] leading-relaxed">
                    <strong className="text-[#0F172A]">Note:</strong> You must upload your verification documents and verify your email.
                    Your account and documents will be reviewed by Admin before approval.
                  </p>
                </div>

                {/* Submit Action */}
                <div className="pt-2 space-y-3">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-[#E31E24] hover:bg-[#C1171C] text-white py-3.5 px-6 rounded-xl font-bold text-sm tracking-wide shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 h-12"
                  >
                    {isLoading ? (
                      'Registering & Uploading Documents...'
                    ) : (
                      <>
                        Create Seller Account <FiArrowRight />
                      </>
                    )}
                  </button>

                  <p className="text-center text-[11px] text-[#64748B]">
                    By registering, you agree to the Seller Terms & Conditions and Privacy Policy.
                  </p>
                </div>

                {/* Login Redirect Footer */}
                <div className="border-t border-[#E5E7EB] pt-4 text-center">
                  <p className="text-xs text-[#64748B]">
                    Already registered?{' '}
                    <Link
                      to="/vendor/login"
                      className="text-[#E31E24] hover:underline font-bold"
                    >
                      Sign in to your seller account
                    </Link>
                  </p>
                </div>
              </form>
            </motion.div>

            {/* 11. Optional Right-Side Information Panel (Desktop Only) */}
            <div className="hidden lg:block lg:col-span-4 space-y-6">
              
              {/* Seller Benefits Card */}
              <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-sm space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#FEF2F2] text-[#E31E24] flex items-center justify-center border border-red-100">
                    <FiShield className="text-xl" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#0F172A]">Sell Fire Safety Products</h3>
                    <p className="text-xs text-[#64748B]">Grow your business with Fire Safety Shop</p>
                  </div>
                </div>

                <ul className="space-y-3 text-xs text-[#1F2937]">
                  <li className="flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full bg-[#FEF2F2] text-[#E31E24] flex items-center justify-center text-[10px] font-bold mt-0.5 flex-shrink-0 border border-red-200">
                      ✓
                    </span>
                    <span>Reach active customers looking for certified safety equipment</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full bg-[#FEF2F2] text-[#E31E24] flex items-center justify-center text-[10px] font-bold mt-0.5 flex-shrink-0 border border-red-200">
                      ✓
                    </span>
                    <span>Manage your store catalog and inventory seamlessly</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full bg-[#FEF2F2] text-[#E31E24] flex items-center justify-center text-[10px] font-bold mt-0.5 flex-shrink-0 border border-red-200">
                      ✓
                    </span>
                    <span>Track orders, dispatch shipments, and review sales analytics</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full bg-[#FEF2F2] text-[#E31E24] flex items-center justify-center text-[10px] font-bold mt-0.5 flex-shrink-0 border border-red-200">
                      ✓
                    </span>
                    <span>Verified seller badge & prompt payout support</span>
                  </li>
                </ul>

                <div className="bg-[#FEF2F2] p-4 rounded-xl border border-red-100 text-xs">
                  <p className="font-bold text-[#0F172A] mb-1">Fast Approval Process</p>
                  <p className="text-[#64748B] text-[11px] leading-relaxed">
                    Once submitted, your business license and identity documents are reviewed by our safety compliance team within 24-48 hours.
                  </p>
                </div>
              </div>

              {/* Support Contact Box */}
              <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-sm text-xs text-[#64748B] space-y-2">
                <p className="font-bold text-[#0F172A]">Need help registering?</p>
                <p className="text-[11px]">
                  Contact our Seller Support Team for assistance with business documentation or onboarding questions.
                </p>
              </div>

            </div>

          </div>
        </div>
      </main>
    </div>
  );
};

export default VendorRegister;
