import { useState, useEffect } from 'react';
import { FiX, FiSave, FiMapPin, FiClock, FiDollarSign, FiCalendar, FiPlus, FiTrash2, FiLayers } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { useVendorServiceStore } from '../../../../shared/store/vendorServiceStore';
import toast from 'react-hot-toast';

const VendorServiceConfigModal = ({ vendorService, onClose, onSave }) => {
  const { updateServiceConfig } = useVendorServiceStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const serviceMaster = vendorService?.serviceId || {};
  const pricingType = serviceMaster?.pricingType || 'FIXED';

  const [formData, setFormData] = useState({
    price: 0,
    variantPrices: {},
    serviceAreasStr: '',
    workingHours: { start: '09:00', end: '18:00' },
    dailyCapacity: 10,
    vendorNotes: '',
    isActive: true,
  });

  useEffect(() => {
    if (vendorService) {
      setFormData({
        price: vendorService.price || 0,
        variantPrices: vendorService.variantPrices ? Object.fromEntries(new Map(Object.entries(vendorService.variantPrices))) : {},
        serviceAreasStr: Array.isArray(vendorService.serviceAreas) ? vendorService.serviceAreas.join(', ') : '',
        workingHours: {
          start: vendorService.workingHours?.start || '09:00',
          end: vendorService.workingHours?.end || '18:00',
        },
        dailyCapacity: vendorService.dailyCapacity ?? 10,
        vendorNotes: vendorService.vendorNotes || '',
        isActive: vendorService.isActive !== undefined ? vendorService.isActive : true,
      });
    }
  }, [vendorService]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleWorkingHoursChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      workingHours: {
        ...prev.workingHours,
        [name]: value,
      },
    }));
  };

  const handleVariantPriceChange = (variantKey, value) => {
    setFormData((prev) => ({
      ...prev,
      variantPrices: {
        ...prev.variantPrices,
        [variantKey]: Number(value) || 0,
      },
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const areasList = (formData.serviceAreasStr || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        price: Number(formData.price) || 0,
        variantPrices: formData.variantPrices,
        serviceAreas: areasList,
        workingHours: formData.workingHours,
        dailyCapacity: Number(formData.dailyCapacity) || 0,
        vendorNotes: formData.vendorNotes,
        isActive: formData.isActive,
      };

      await updateServiceConfig(vendorService.id || vendorService._id, payload);
      onSave?.();
      onClose();
    } catch (err) {
      // Handled in store/interceptor
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPricingLabel = () => {
    switch (pricingType) {
      case 'FIXED': return 'Fixed Service Rate (₹)';
      case 'PER_UNIT': return 'Rate Per Unit (₹ / Unit)';
      case 'SIZE_BASED': return 'Base Service Rate (₹)';
      case 'CUSTOM_QUOTE': return 'Initial Inspection / Consultation Charge (₹)';
      default: return 'Service Rate (₹)';
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
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/50 z-[10000]"
        />

        {/* Modal Window */}
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
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden pointer-events-auto">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between flex-shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white">
                    {serviceMaster.name || 'Configure Vendor Service'}
                  </h2>
                  <span className="px-2 py-0.5 bg-primary-500/20 border border-primary-500/40 text-primary-300 rounded text-[11px] font-semibold">
                    {pricingType}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Category: {serviceMaster.categoryId?.name || 'Fire Safety'}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                <FiX className="text-lg" />
              </button>
            </div>

            {/* Modal Form Content */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-admin">
              {/* Dynamic Pricing Config Section */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-2">
                    <FiDollarSign className="text-primary-600" />
                    Vendor Pricing Configuration
                  </h3>
                  <span className="text-[11px] font-medium text-gray-500">
                    Pricing Model: {pricingType}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {getPricingLabel()} <span className="text-red-500">*</span>
                  </label>
                  <div className="relative w-full sm:w-1/2">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-xs">₹</span>
                    <input
                      type="number"
                      name="price"
                      value={formData.price}
                      onChange={handleInputChange}
                      min="0"
                      step="any"
                      required
                      className="w-full pl-8 pr-3.5 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs font-semibold"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {pricingType === 'SIZE_BASED' && (
                  <div className="space-y-2 pt-2 border-t border-gray-200">
                    <label className="block text-xs font-semibold text-gray-700">
                      Variant-wise Rates (Capacity / Size)
                    </label>
                    <p className="text-[11px] text-gray-500">Set rates for specific size variants:</p>
                    <div className="grid grid-cols-2 gap-3">
                      {['2 KG', '4 KG', '6 KG', '9 KG'].map((variantKey) => (
                        <div key={variantKey} className="flex items-center gap-2 bg-white p-2 border border-gray-200 rounded-lg">
                          <span className="text-xs font-bold text-gray-700 w-16">{variantKey}:</span>
                          <span className="text-xs text-gray-400">₹</span>
                          <input
                            type="number"
                            value={formData.variantPrices[variantKey] || ''}
                            onChange={(e) => handleVariantPriceChange(variantKey, e.target.value)}
                            min="0"
                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                            placeholder="0"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Service Areas (Pincodes) */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-2">
                  <FiMapPin className="text-primary-600" />
                  Serviceable Pincodes / Areas
                </label>
                <input
                  type="text"
                  name="serviceAreasStr"
                  value={formData.serviceAreasStr}
                  onChange={handleInputChange}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs"
                  placeholder="e.g. 301001, 301002, 301003, Alwar City"
                />
                <p className="text-[11px] text-gray-500">
                  Separate multiple serviceable pincodes or regions with commas.
                </p>
              </div>

              {/* Capacity & Working Hours */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider mb-1">
                    Daily Service Capacity
                  </label>
                  <input
                    type="number"
                    name="dailyCapacity"
                    value={formData.dailyCapacity}
                    onChange={handleInputChange}
                    min="0"
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs"
                    placeholder="Max bookings per day"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <FiClock />
                    Working Hours
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      name="start"
                      value={formData.workingHours.start}
                      onChange={handleWorkingHoursChange}
                      className="w-full px-2.5 py-2 border border-gray-300 rounded-xl text-xs"
                    />
                    <span className="text-xs text-gray-400">to</span>
                    <input
                      type="time"
                      name="end"
                      value={formData.workingHours.end}
                      onChange={handleWorkingHoursChange}
                      className="w-full px-2.5 py-2 border border-gray-300 rounded-xl text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Vendor Specific Notes */}
              <div>
                <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider mb-1">
                  Vendor Notes & Store Terms
                </label>
                <textarea
                  name="vendorNotes"
                  value={formData.vendorNotes}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs"
                  placeholder="Special instructions, warranty details, technician site requirements..."
                />
              </div>

              {/* Availability Status Toggle */}
              <div className="pt-2 border-t border-gray-200 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-gray-800">Store Service Availability</p>
                  <p className="text-[11px] text-gray-500">Enable or disable receiving bookings for this service</p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="isActive"
                    checked={formData.isActive}
                    onChange={handleInputChange}
                    className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                  />
                  <span className="text-xs font-semibold text-gray-700">
                    {formData.isActive ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </label>
              </div>

              {/* Modal Footer Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors text-xs font-semibold">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-5 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors text-xs font-semibold shadow-md">
                  <FiSave />
                  <span>{isSubmitting ? 'Saving...' : 'Save Configuration'}</span>
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      </>
    </AnimatePresence>
  );
};

export default VendorServiceConfigModal;
