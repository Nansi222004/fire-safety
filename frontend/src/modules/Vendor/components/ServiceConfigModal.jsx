import React, { useState, useEffect } from 'react';
import { FiX, FiCheck, FiMapPin, FiClock, FiDollarSign, FiCalendar, FiFileText } from 'react-icons/fi';
import toast from 'react-hot-toast';

const ServiceConfigModal = ({ isOpen, onClose, vendorService, serviceMaster, onSave }) => {
  const [price, setPrice] = useState(499);
  const [pincodeInput, setPincodeInput] = useState('');
  const [serviceAreas, setServiceAreas] = useState([]);
  const [dailyCapacity, setDailyCapacity] = useState(10);
  const [workingHours, setWorkingHours] = useState({ start: '09:00', end: '18:00' });
  const [vendorNotes, setVendorNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (vendorService) {
      setPrice(vendorService.price ?? 499);
      setServiceAreas(Array.isArray(vendorService.serviceAreas) ? vendorService.serviceAreas : []);
      setDailyCapacity(vendorService.dailyCapacity ?? 10);
      setWorkingHours(vendorService.workingHours || { start: '09:00', end: '18:00' });
      setVendorNotes(vendorService.vendorNotes || '');
      setIsActive(vendorService.isActive !== false);
    } else {
      setPrice(499);
      setServiceAreas(['452001']); // Default initial example pincode
      setDailyCapacity(10);
      setWorkingHours({ start: '09:00', end: '18:00' });
      setVendorNotes('');
      setIsActive(true);
    }
  }, [vendorService, isOpen]);

  if (!isOpen) return null;

  const handleAddPincode = (e) => {
    e?.preventDefault();
    const clean = pincodeInput.trim();
    if (!clean) return;

    if (!/^\d{6}$/.test(clean)) {
      toast.error('Please enter a valid 6-digit postal pincode.');
      return;
    }

    if (serviceAreas.includes(clean)) {
      toast.error('Pincode already added.');
      return;
    }

    setServiceAreas([...serviceAreas, clean]);
    setPincodeInput('');
  };

  const handleRemovePincode = (codeToRemove) => {
    setServiceAreas(serviceAreas.filter((code) => code !== codeToRemove));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (serviceAreas.length === 0) {
      toast.error('You MUST add at least 1 service area pincode before activating this service.');
      return;
    }

    if (Number(price) < 0) {
      toast.error('Price cannot be negative.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        price: Number(price),
        serviceAreas,
        dailyCapacity: Number(dailyCapacity),
        workingHours,
        vendorNotes,
        isActive,
      };

      await onSave(payload);
      onClose();
    } catch (err) {
      console.error('Failed to save service config:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const serviceName = serviceMaster?.name || vendorService?.serviceId?.name || 'Service Configuration';
  const categoryName = serviceMaster?.categoryId?.name || vendorService?.serviceId?.categoryId?.name || 'Fire Safety';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#0F172A] text-white flex items-center justify-between border-b border-slate-800">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">
              {categoryName}
            </span>
            <h3 className="text-base sm:text-lg font-extrabold text-white leading-tight">
              {serviceName}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
          >
            <FiX className="text-lg" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Active Toggle */}
          <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
            <div>
              <p className="text-xs font-bold text-slate-900">Service Status</p>
              <p className="text-[11px] text-slate-500">Enable or temporarily pause bookings for this service</p>
            </div>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`w-12 h-6 rounded-full p-1 transition-colors ${
                isActive ? 'bg-[#E31E24]' : 'bg-slate-300'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  isActive ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Pricing */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
              <FiDollarSign className="text-red-500" />
              <span>Base Price (₹)</span>
            </label>
            <input
              type="number"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="e.g. 499"
              required
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#E31E24]"
            />
            <p className="text-[11px] text-slate-400 mt-1">Starting price charged for this service.</p>
          </div>

          {/* Service Areas (Pincodes Tag/Chip Input) */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
              <FiMapPin className="text-red-500" />
              <span>Serviced Pincodes <span className="text-red-500">* (Mandatory)</span></span>
            </label>

            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={pincodeInput}
                onChange={(e) => setPincodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddPincode();
                  }
                }}
                placeholder="Enter 6-digit pincode (e.g. 452001)"
                className="flex-1 px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-[#E31E24]"
              />
              <button
                type="button"
                onClick={handleAddPincode}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-all"
              >
                Add
              </button>
            </div>

            {/* Pincode Tag Chips */}
            <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 bg-slate-50 border border-slate-200 rounded-xl">
              {serviceAreas.length === 0 ? (
                <span className="text-[11px] text-slate-400 italic">No pincodes added. Service cannot be activated without pincodes.</span>
              ) : (
                serviceAreas.map((code) => (
                  <span
                    key={code}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 text-[#E31E24] border border-red-200 text-xs font-bold rounded-lg"
                  >
                    <span>{code}</span>
                    <button
                      type="button"
                      onClick={() => handleRemovePincode(code)}
                      className="hover:text-red-800 font-bold"
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Daily Capacity & Working Hours Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
                <FiCalendar className="text-red-500" />
                <span>Daily Capacity Limit</span>
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={dailyCapacity}
                onChange={(e) => setDailyCapacity(e.target.value)}
                className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#E31E24]"
              />
              <p className="text-[10px] text-slate-400 mt-1">Max bookings accepted per day.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
                <FiClock className="text-red-500" />
                <span>Working Hours</span>
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="time"
                  value={workingHours.start}
                  onChange={(e) => setWorkingHours({ ...workingHours, start: e.target.value })}
                  className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#E31E24]"
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="time"
                  value={workingHours.end}
                  onChange={(e) => setWorkingHours({ ...workingHours, end: e.target.value })}
                  className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#E31E24]"
                />
              </div>
            </div>
          </div>

          {/* Vendor Operational Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
              <FiFileText className="text-red-500" />
              <span>Vendor Instructions / Notes</span>
            </label>
            <textarea
              rows={2}
              value={vendorNotes}
              onChange={(e) => setVendorNotes(e.target.value)}
              placeholder="e.g. Please ensure clear driveway access for inspection team..."
              className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#E31E24]"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-[#E31E24] hover:bg-[#c6151b] text-white font-bold rounded-xl text-xs transition-all shadow-sm shadow-[#E31E24]/20 flex items-center gap-1.5 disabled:opacity-50"
            >
              <FiCheck />
              <span>{isSubmitting ? 'Saving...' : 'Save Configuration'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ServiceConfigModal;
