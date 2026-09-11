import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiCheckCircle,
  FiClock,
  FiAlertCircle,
  FiArrowRight,
  FiArrowLeft,
  FiPlus,
  FiTrash2,
  FiUploadCloud,
  FiShield,
  FiAward,
  FiMapPin,
  FiFileText,
  FiTool,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../../../shared/utils/api';
import { useVendorAuthStore } from '../../store/vendorAuthStore';
import { getVendorCapabilities } from '../../utils/vendorCapabilities';

const ServicePartnerApplication = () => {
  const navigate = useNavigate();
  const { vendor, updateProfile } = useVendorAuthStore();
  const vendorCaps = getVendorCapabilities(vendor);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [categories, setCategories] = useState([]);
  const [currentApp, setCurrentApp] = useState(null);

  // Wizard Step: 1 = Business Info, 2 = Categories & Areas, 3 = Certifications & Docs, 4 = Review
  const [step, setStep] = useState(1);

  // Form State
  const [formData, setFormData] = useState({
    businessDescription: '',
    serviceExperienceYears: 1,
    requestedServiceCategories: [],
    requestedServiceAreas: '',
    certifications: [],
    documents: [],
    additionalInformation: '',
  });

  // New certification row state
  const [newCert, setNewCert] = useState({
    name: '',
    issuer: '',
    certificateNumber: '',
    expiryDate: '',
  });

  // Fetch current application & service categories
  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [appRes, catRes] = await Promise.allSettled([
          api.get('/vendor/service-partner-applications/current'),
          api.get('/service-categories/all'),
        ]);

        if (catRes.status === 'fulfilled' && catRes.value?.data?.data) {
          if (isMounted) setCategories(catRes.value.data.data);
        }

        if (appRes.status === 'fulfilled' && appRes.value?.data?.data) {
          const appData = appRes.value.data.data.application;
          if (isMounted && appData) {
            setCurrentApp(appData);
            // Pre-fill form if rejected or reviewing
            setFormData({
              businessDescription: appData.applicationData?.businessDescription || '',
              serviceExperienceYears: appData.applicationData?.serviceExperienceYears || 1,
              requestedServiceCategories: (appData.applicationData?.requestedServiceCategories || []).map(
                (c) => (typeof c === 'object' ? c._id : c)
              ),
              requestedServiceAreas: (appData.applicationData?.requestedServiceAreas || []).join(', '),
              certifications: appData.applicationData?.certifications || [],
              documents: appData.documents || [],
              additionalInformation: appData.applicationData?.additionalInformation || '',
            });
          }
        }
      } catch (err) {
        console.warn('Failed to load application data:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleCategoryToggle = (catId) => {
    setFormData((prev) => {
      const exists = prev.requestedServiceCategories.includes(catId);
      return {
        ...prev,
        requestedServiceCategories: exists
          ? prev.requestedServiceCategories.filter((id) => id !== catId)
          : [...prev.requestedServiceCategories, catId],
      };
    });
  };

  const handleAddCert = () => {
    if (!newCert.name.trim()) {
      toast.error('Certification name is required.');
      return;
    }
    setFormData((prev) => ({
      ...prev,
      certifications: [...prev.certifications, { ...newCert }],
    }));
    setNewCert({ name: '', issuer: '', certificateNumber: '', expiryDate: '' });
  };

  const handleRemoveCert = (index) => {
    setFormData((prev) => ({
      ...prev,
      certifications: prev.certifications.filter((_, i) => i !== index),
    }));
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const uploadForm = new FormData();
    uploadForm.append('image', file);
    uploadForm.append('folder', 'vendors/certifications');

    const toastId = toast.loading('Uploading document...');
    try {
      const res = await api.post('/vendor/uploads/image', uploadForm, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = res?.data?.data || res?.data;
      if (data?.url) {
        setFormData((prev) => ({
          ...prev,
          documents: [
            ...prev.documents,
            {
              name: file.name,
              url: data.url,
              filePublicId: data.publicId,
              documentType: 'certification',
              uploadedAt: new Date(),
            },
          ],
        }));
        toast.success('Document attached successfully.', { id: toastId });
      }
    } catch (err) {
      toast.error(err.message || 'Failed to upload document.', { id: toastId });
    }
  };

  const handleRemoveDoc = (index) => {
    setFormData((prev) => ({
      ...prev,
      documents: prev.documents.filter((_, i) => i !== index),
    }));
  };

  const validateStep = (currentStep) => {
    if (currentStep === 1) {
      if (formData.businessDescription.trim().length < 20) {
        toast.error('Business description must be at least 20 characters.');
        return false;
      }
      if (Number(formData.serviceExperienceYears) < 0) {
        toast.error('Years of experience cannot be negative.');
        return false;
      }
    }
    if (currentStep === 2) {
      if (formData.requestedServiceCategories.length === 0) {
        toast.error('Please select at least one service category.');
        return false;
      }
      const areas = formData.requestedServiceAreas
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);
      if (areas.length === 0) {
        toast.error('Please specify at least one service area / pincode.');
        return false;
      }
    }
    return true;
  };

  const nextStep = () => {
    if (validateStep(step)) {
      setStep((prev) => Math.min(4, prev + 1));
    }
  };

  const prevStep = () => {
    setStep((prev) => Math.max(1, prev - 1));
  };

  const handleSubmit = async () => {
    if (!validateStep(1) || !validateStep(2)) return;

    setSubmitting(true);
    const payload = {
      businessDescription: formData.businessDescription.trim(),
      serviceExperienceYears: Number(formData.serviceExperienceYears) || 0,
      requestedServiceCategories: formData.requestedServiceCategories,
      requestedServiceAreas: formData.requestedServiceAreas
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
      certifications: formData.certifications,
      documents: formData.documents,
      additionalInformation: formData.additionalInformation.trim(),
    };

    try {
      let res;
      if (currentApp?.status === 'rejected') {
        res = await api.put('/vendor/service-partner-applications/resubmit', payload);
        toast.success('Application resubmitted successfully for review!');
      } else {
        res = await api.post('/vendor/service-partner-applications', payload);
        toast.success('Service Partner application submitted successfully!');
      }

      const appData = res?.data?.data;
      if (appData) {
        setCurrentApp(appData);
      }

      // Refresh vendor profile in store
      try {
        const profRes = await api.get('/vendor/auth/profile');
        if (profRes?.data?.data && typeof updateProfile === 'function') {
          updateProfile(profRes.data.data);
        }
      } catch {
        // profile reload best effort
      }
    } catch (err) {
      toast.error(err.message || 'Failed to submit application.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-[#E31E24] border-t-transparent"></div>
      </div>
    );
  }

  // 1. APPROVED STATE
  if (vendorCaps.isServiceApproved) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white rounded-3xl p-8 border border-emerald-200 shadow-sm text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-3xl mx-auto border border-emerald-100">
            <FiShield />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">
              Verified Partner
            </span>
            <h1 className="text-2xl font-black text-slate-900 mt-2">
              You are an Approved SafeFire Service Partner
            </h1>
            <p className="text-sm text-slate-600 max-w-lg mx-auto mt-1">
              Your business has been vetted and approved to deliver fire safety maintenance, installation, and inspection services.
            </p>
          </div>

          <div className="pt-4 flex flex-wrap justify-center gap-3">
            <button
              onClick={() => navigate('/vendor/services')}
              className="px-6 py-3 bg-[#E31E24] hover:bg-[#c6151b] text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-red-500/20 flex items-center gap-2"
            >
              <FiTool /> Configure Services & Pricing
            </button>
            <button
              onClick={() => navigate('/vendor/service-bookings')}
              className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-sm rounded-xl transition-all"
            >
              View Service Bookings
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. PENDING / UNDER REVIEW STATE
  if (currentApp && (currentApp.status === 'pending' || currentApp.status === 'under_review')) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-amber-50/70 border border-amber-200 rounded-3xl p-8 text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center text-3xl mx-auto">
            <FiClock />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800 bg-amber-200/70 px-3 py-1 rounded-full">
              Application Under Review
            </span>
            <h1 className="text-2xl font-black text-slate-900 mt-2">
              Your Service Partner Application is Being Reviewed
            </h1>
            <p className="text-sm text-slate-600 max-w-lg mx-auto mt-1">
              Our safety compliance officers are reviewing your application and credentials. You will receive an email and system notification once review is complete.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 text-left border border-amber-200 max-w-xl mx-auto space-y-3 text-xs">
            <div className="flex justify-between border-b pb-2">
              <span className="text-slate-500">Application ID</span>
              <span className="font-mono font-bold text-slate-800">{currentApp._id}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-slate-500">Submitted On</span>
              <span className="font-bold text-slate-800">
                {new Date(currentApp.appliedAt || currentApp.createdAt).toLocaleDateString()}
              </span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-slate-500">Experience</span>
              <span className="font-bold text-slate-800">
                {currentApp.applicationData?.serviceExperienceYears} Years
              </span>
            </div>
            <div>
              <span className="text-slate-500 block mb-1">Requested Categories</span>
              <div className="flex flex-wrap gap-1.5">
                {(currentApp.applicationData?.requestedServiceCategories || []).map((cat, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-medium text-[11px]"
                  >
                    {typeof cat === 'object' ? cat.name : 'Category'}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={() => navigate('/vendor/dashboard')}
            className="px-6 py-2.5 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-xl transition-all"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // 3. APPLICATION WIZARD (for none or rejected)
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
          SafeFire Service Partner Application
        </h1>
        <p className="text-sm text-slate-600">
          Get verified to list maintenance, installation, and inspection services on the SafeFire Marketplace.
        </p>
      </div>

      {/* Rejection Alert if resubmitting */}
      {currentApp?.status === 'rejected' && (
        <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center text-xl shrink-0 mt-0.5">
            <FiAlertCircle />
          </div>
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-red-700 bg-red-100 px-2.5 py-0.5 rounded-full inline-block">
              Action Required
            </span>
            <h3 className="text-sm font-bold text-slate-900">Your application needs some changes</h3>
            <p className="text-xs text-red-800 bg-white/80 p-3 rounded-xl border border-red-200 font-medium">
              <strong>Reason:</strong> {currentApp.rejectionReason || 'Please update your application information.'}
            </p>
            <p className="text-xs text-slate-600">
              Please update the details below according to the feedback and click &ldquo;Update & Resubmit Application&rdquo;.
            </p>
          </div>
        </div>
      )}

      {/* Step Indicator */}
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
        {[
          { num: 1, label: 'Business Overview', shortLabel: 'Overview' },
          { num: 2, label: 'Categories & Coverage', shortLabel: 'Coverage' },
          { num: 3, label: 'Certifications', shortLabel: 'Certs' },
          { num: 4, label: 'Review & Submit', shortLabel: 'Submit' },
        ].map((s) => (
          <div
            key={s.num}
            onClick={() => s.num < step && setStep(s.num)}
            className={`p-2 sm:p-3 rounded-xl sm:rounded-2xl border text-center transition-all cursor-pointer ${
              step === s.num
                ? 'bg-red-50/50 border-[#E31E24] shadow-sm'
                : step > s.num
                ? 'bg-slate-50 border-slate-200 text-slate-600'
                : 'bg-white border-slate-100 opacity-60 pointer-events-none'
            }`}
          >
            <div
              className={`w-6 h-6 rounded-full mx-auto flex items-center justify-center text-xs font-bold mb-1 ${
                step === s.num
                  ? 'bg-[#E31E24] text-white'
                  : step > s.num
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-200 text-slate-500'
              }`}
            >
              {step > s.num ? '✓' : s.num}
            </div>
            <span className="text-[10px] sm:text-[11px] font-bold block truncate">
              <span className="sm:hidden">{s.shortLabel}</span>
              <span className="hidden sm:inline">{s.label}</span>
            </span>
          </div>
        ))}
      </div>

      {/* Form Card */}
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 p-4 sm:p-6 lg:p-8 shadow-sm">
        <AnimatePresence mode="wait">
          {/* Step 1: Business Overview */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="border-b pb-4">
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <FiFileText className="text-[#E31E24]" /> Business Overview
                </h2>
                <p className="text-xs text-slate-500">
                  Provide details regarding your fire-safety service operations and qualifications.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                    Service Experience (Years) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.serviceExperienceYears}
                    onChange={(e) =>
                      setFormData({ ...formData, serviceExperienceYears: e.target.value })
                    }
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#E31E24] text-sm"
                    placeholder="e.g. 5"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                    Business Description & Technical Capabilities <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows="4"
                    value={formData.businessDescription}
                    onChange={(e) =>
                      setFormData({ ...formData, businessDescription: e.target.value })
                    }
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#E31E24] text-sm"
                    placeholder="Describe your company's fire safety servicing background, technician qualifications, equipment testing procedures, and standards compliance (minimum 20 characters)..."
                  />
                  <span className="text-[11px] text-slate-400">
                    {formData.businessDescription.length} / 20 min characters
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                    Additional Information / Specialties (Optional)
                  </label>
                  <textarea
                    rows="2"
                    value={formData.additionalInformation}
                    onChange={(e) =>
                      setFormData({ ...formData, additionalInformation: e.target.value })
                    }
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#E31E24] text-sm"
                    placeholder="e.g. Authorized distributor for major fire extinguisher brands, 24/7 emergency refilling, on-site hydrostatic testing..."
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 2: Categories & Coverage */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="border-b pb-4">
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <FiMapPin className="text-[#E31E24]" /> Categories & Coverage Area
                </h2>
                <p className="text-xs text-slate-500">
                  Select the master service categories you are qualified to provide and the areas you cover.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                    Select Service Categories <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {categories.map((cat) => {
                      const isSelected = formData.requestedServiceCategories.includes(cat._id);
                      return (
                        <div
                          key={cat._id}
                          onClick={() => handleCategoryToggle(cat._id)}
                          className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-start gap-3 ${
                            isSelected
                              ? 'bg-red-50/50 border-[#E31E24] shadow-sm'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div
                            className={`w-5 h-5 rounded-lg border mt-0.5 flex items-center justify-center text-xs font-bold ${
                              isSelected
                                ? 'bg-[#E31E24] border-[#E31E24] text-white'
                                : 'border-slate-300'
                            }`}
                          >
                            {isSelected && '✓'}
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-slate-900">{cat.name}</h4>
                            {cat.description && (
                              <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">
                                {cat.description}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                    Service Areas / Pincodes <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.requestedServiceAreas}
                    onChange={(e) =>
                      setFormData({ ...formData, requestedServiceAreas: e.target.value })
                    }
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#E31E24] text-sm"
                    placeholder="Enter pincodes or cities separated by commas (e.g. 110001, 110002, 110003, Delhi NCR)"
                  />
                  <span className="text-[11px] text-slate-400">
                    Separate multiple areas or postal codes with commas
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 3: Certifications & Verification Documents */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="border-b pb-4">
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <FiAward className="text-[#E31E24]" /> Certifications & Compliance Documents
                </h2>
                <p className="text-xs text-slate-500">
                  Add professional fire-safety certifications and upload proof documentation.
                </p>
              </div>

              {/* Add Certification */}
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Add Professional Certification
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={newCert.name}
                    onChange={(e) => setNewCert({ ...newCert, name: e.target.value })}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 text-xs bg-white"
                    placeholder="Certification Name (e.g. ISO 9001 Fire Safety)"
                  />
                  <input
                    type="text"
                    value={newCert.issuer}
                    onChange={(e) => setNewCert({ ...newCert, issuer: e.target.value })}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 text-xs bg-white"
                    placeholder="Issuing Authority (e.g. PESO, BIS, Civil Defence)"
                  />
                  <input
                    type="text"
                    value={newCert.certificateNumber}
                    onChange={(e) => setNewCert({ ...newCert, certificateNumber: e.target.value })}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 text-xs bg-white"
                    placeholder="License / Certificate Number"
                  />
                  <input
                    type="date"
                    value={newCert.expiryDate}
                    onChange={(e) => setNewCert({ ...newCert, expiryDate: e.target.value })}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 text-xs bg-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddCert}
                  className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
                >
                  <FiPlus /> Add Certification
                </button>
              </div>

              {/* Certifications List */}
              {formData.certifications.length > 0 && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Added Certifications ({formData.certifications.length})
                  </label>
                  <div className="space-y-2">
                    {formData.certifications.map((c, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white text-xs"
                      >
                        <div>
                          <span className="font-bold text-slate-800">{c.name}</span>
                          <span className="text-slate-500 block">
                            Issuer: {c.issuer || 'N/A'} • #{c.certificateNumber || 'N/A'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveCert(idx)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Document Upload */}
              <div className="space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Supporting Documents / PDF Certifications
                </label>
                <label className="border-2 border-dashed border-slate-300 hover:border-[#E31E24] rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors bg-slate-50 hover:bg-red-50/20">
                  <FiUploadCloud className="text-3xl text-slate-400 mb-2" />
                  <span className="text-xs font-bold text-slate-700">Click to upload document</span>
                  <span className="text-[11px] text-slate-400">PDF, PNG, JPG up to 10MB</span>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*,.pdf"
                    onChange={handleFileUpload}
                  />
                </label>

                {formData.documents.length > 0 && (
                  <div className="space-y-2">
                    {formData.documents.map((d, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <FiFileText className="text-[#E31E24]" />
                          <span className="font-medium text-slate-800">{d.name}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveDoc(idx)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Step 4: Review & Submit */}
          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="border-b pb-4">
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <FiCheckCircle className="text-[#E31E24]" /> Review Your Application
                </h2>
                <p className="text-xs text-slate-500">
                  Verify all submitted information before dispatching for SafeFire compliance review.
                </p>
              </div>

              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 space-y-4 text-xs">
                <div className="space-y-1">
                  <span className="text-slate-500 block uppercase tracking-wider text-[10px] font-bold">
                    Business Description
                  </span>
                  <p className="text-slate-800 font-medium leading-relaxed">
                    {formData.businessDescription}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t pt-3">
                  <div>
                    <span className="text-slate-500 block uppercase tracking-wider text-[10px] font-bold">
                      Experience
                    </span>
                    <span className="font-bold text-slate-800">
                      {formData.serviceExperienceYears} Years
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block uppercase tracking-wider text-[10px] font-bold">
                      Coverage Pincodes / Areas
                    </span>
                    <span className="font-bold text-slate-800">
                      {formData.requestedServiceAreas}
                    </span>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <span className="text-slate-500 block uppercase tracking-wider text-[10px] font-bold mb-1">
                    Selected Categories ({formData.requestedServiceCategories.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {categories
                      .filter((c) => formData.requestedServiceCategories.includes(c._id))
                      .map((c) => (
                        <span
                          key={c._id}
                          className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 font-medium"
                        >
                          {c.name}
                        </span>
                      ))}
                  </div>
                </div>

                <div className="border-t pt-3">
                  <span className="text-slate-500 block uppercase tracking-wider text-[10px] font-bold mb-1">
                    Certifications & Documents
                  </span>
                  <span className="text-slate-700">
                    {formData.certifications.length} Certifications attached •{' '}
                    {formData.documents.length} Verification documents uploaded
                  </span>
                </div>
              </div>

              <div className="p-4 bg-red-50/50 rounded-2xl border border-red-200 text-xs text-red-900 space-y-1">
                <span className="font-bold flex items-center gap-1.5">
                  <FiShield /> Compliance Declaration
                </span>
                <p className="text-[11px] leading-relaxed text-red-800">
                  By submitting, you certify that all technical qualifications, licenses, and documentation provided are authentic and comply with SafeFire marketplace standards.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation Buttons */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-200 pt-6 mt-8">
          {step > 1 ? (
            <button
              type="button"
              onClick={prevStep}
              className="w-full sm:w-auto px-5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
            >
              <FiArrowLeft /> Back
            </button>
          ) : (
            <div className="hidden sm:block"></div>
          )}

          {step < 4 ? (
            <button
              type="button"
              onClick={nextStep}
              className="w-full sm:w-auto px-6 py-2.5 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              Next Step <FiArrowRight />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full sm:w-auto px-8 py-3 bg-[#E31E24] hover:bg-[#c6151b] text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-md shadow-red-500/20 disabled:opacity-50"
            >
              {submitting ? (
                'Submitting Application...'
              ) : currentApp?.status === 'rejected' ? (
                <>Update & Resubmit Application <FiArrowRight /></>
              ) : (
                <>Submit Service Partner Application <FiArrowRight /></>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ServicePartnerApplication;
