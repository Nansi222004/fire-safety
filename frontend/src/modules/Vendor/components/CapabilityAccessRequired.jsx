import { useState } from 'react';
import { motion } from 'framer-motion';
import { FiLock, FiCheckCircle, FiArrowRight } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../../shared/utils/api';
import { useVendorAuthStore } from '../store/vendorAuthStore';

const CapabilityAccessRequired = ({ requiredCapability = 'services' }) => {
  const { vendor, updateProfile } = useVendorAuthStore();
  const [isEnabling, setIsEnabling] = useState(false);

  const isServiceReq = requiredCapability === 'services' || requiredCapability === 'providesServices';

  const title = isServiceReq
    ? 'Service Provider Access Required'
    : 'Product Seller Access Required';

  const description = isServiceReq
    ? 'Your store is currently not configured for the Fire Safety Service Marketplace. Enable service capability to list service master offerings, set prices, define service area pincodes, and manage customer bookings.'
    : 'Your store is currently not configured for the Fire Safety Product Marketplace. Enable product seller capability to create product listings, manage inventory, and receive product orders.';

  const buttonText = isServiceReq ? 'Enable Service Capability' : 'Enable Product Capability';

  const handleEnable = async () => {
    setIsEnabling(true);
    try {
      const currentCaps = vendor?.vendorCapabilities || { sellsProducts: true, providesServices: false };
      const updatedCaps = {
        ...currentCaps,
        ...(isServiceReq ? { providesServices: true } : { sellsProducts: true }),
      };

      const res = await api.put('/vendor/auth/profile', {
        vendorCapabilities: updatedCaps,
      });

      const updatedVendor = res.data?.data || res.data || res;
      if (typeof updateProfile === 'function') {
        updateProfile(updatedVendor);
      }
      toast.success(`${isServiceReq ? 'Service' : 'Product'} capability enabled successfully!`);
      window.location.reload();
    } catch (err) {
      toast.error(err.message || 'Failed to enable capability.');
    } finally {
      setIsEnabling(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-lg w-full bg-white rounded-3xl border border-slate-200 p-8 text-center shadow-xl space-y-6"
      >
        <div className="w-16 h-16 rounded-2xl bg-[#FEF2F2] text-[#E31E24] flex items-center justify-center mx-auto text-3xl border border-red-100">
          <FiLock />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">{title}</h2>
          <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
        </div>

        <div className="bg-slate-50 rounded-2xl p-4 text-left border border-slate-100 text-xs text-slate-600 space-y-2">
          <div className="font-bold text-slate-900 flex items-center gap-1.5">
            <FiCheckCircle className="text-[#E31E24]" />
            <span>Enabling will allow you to:</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-slate-600 pl-1">
            {isServiceReq ? (
              <>
                <li>Configure pricing & pincode coverage for services</li>
                <li>Manage appointment slots and capacity</li>
                <li>Receive & fulfill service bookings</li>
              </>
            ) : (
              <>
                <li>Create and manage product listings</li>
                <li>Track product stock and warehouse inventory</li>
                <li>Receive product orders & fulfill shipments</li>
              </>
            )}
          </ul>
        </div>

        <button
          onClick={handleEnable}
          disabled={isEnabling}
          className="w-full py-4 bg-[#E31E24] hover:bg-[#c6151b] text-white rounded-2xl font-bold text-sm shadow-lg shadow-red-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isEnabling ? 'Enabling Capability...' : <>{buttonText} <FiArrowRight /></>}
        </button>
      </motion.div>
    </div>
  );
};

export default CapabilityAccessRequired;
