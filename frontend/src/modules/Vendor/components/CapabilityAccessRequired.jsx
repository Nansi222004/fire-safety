import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiLock, FiCheckCircle, FiArrowRight, FiClock, FiAlertCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../../shared/utils/api';
import { useVendorAuthStore } from '../store/vendorAuthStore';
import { getVendorCapabilities } from '../utils/vendorCapabilities';

const CapabilityAccessRequired = ({ requiredCapability = 'services' }) => {
  const navigate = useNavigate();
  const { vendor, updateProfile } = useVendorAuthStore();
  const [isEnabling, setIsEnabling] = useState(false);

  const vendorCaps = getVendorCapabilities(vendor);
  const isServiceReq = requiredCapability === 'services' || requiredCapability === 'providesServices';

  const title = isServiceReq
    ? vendorCaps.isServicePending
      ? 'Service Partner Application Under Review'
      : vendorCaps.isServiceRejected
      ? 'Service Partner Action Required'
      : vendorCaps.isServiceApproved
      ? 'Service Capability Paused'
      : 'Become a SafeFire Service Partner'
    : 'Product Seller Access Required';

  const description = isServiceReq
    ? vendorCaps.isServicePending
      ? 'Your application to become a SafeFire Service Partner is currently under review by our compliance team. Service access will be activated immediately upon admin approval.'
      : vendorCaps.isServiceRejected
      ? 'Your Service Partner application requires updates before service capability can be enabled. Please review the feedback and resubmit.'
      : vendorCaps.isServiceApproved
      ? 'Your service partner capability is approved but currently paused. Re-enable to resume accepting service bookings.'
      : 'To offer maintenance, refill, and installation services on SafeFire, vendors must submit a Service Partner Application and receive verification.'
    : 'Your store is currently not configured for the Fire Safety Product Marketplace. Enable product seller capability to create product listings, manage inventory, and receive product orders.';

  const handleAction = async () => {
    if (isServiceReq) {
      if (vendorCaps.isServiceApproved) {
        // Approved vendor re-enabling paused capability
        setIsEnabling(true);
        try {
          const currentCaps = vendor?.vendorCapabilities || { sellsProducts: true, providesServices: false };
          const res = await api.put('/vendor/auth/profile', {
            vendorCapabilities: { ...currentCaps, providesServices: true },
          });
          const updatedVendor = res.data?.data || res.data || res;
          if (typeof updateProfile === 'function') {
            updateProfile(updatedVendor);
          }
          toast.success('Service capability re-enabled successfully!');
          window.location.reload();
        } catch (err) {
          toast.error(err.message || 'Failed to re-enable service capability.');
        } finally {
          setIsEnabling(false);
        }
      } else {
        // Navigate to the Service Partner Application Wizard
        navigate('/vendor/services/apply');
      }
      return;
    }

    // Product enablement
    setIsEnabling(true);
    try {
      const currentCaps = vendor?.vendorCapabilities || { sellsProducts: false, providesServices: true };
      const res = await api.put('/vendor/auth/profile', {
        vendorCapabilities: { ...currentCaps, sellsProducts: true },
      });
      const updatedVendor = res.data?.data || res.data || res;
      if (typeof updateProfile === 'function') {
        updateProfile(updatedVendor);
      }
      toast.success('Product capability enabled successfully!');
      window.location.reload();
    } catch (err) {
      toast.error(err.message || 'Failed to enable product capability.');
    } finally {
      setIsEnabling(false);
    }
  };

  const getButtonText = () => {
    if (isEnabling) return 'Processing...';
    if (!isServiceReq) return 'Enable Product Capability';
    if (vendorCaps.isServiceApproved) return 'Resume Service Capability';
    if (vendorCaps.isServicePending) return 'View Application Status';
    if (vendorCaps.isServiceRejected) return 'Update & Resubmit Application';
    return 'Apply to Become a Service Partner';
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-lg w-full bg-white rounded-3xl border border-slate-200 p-8 text-center shadow-xl space-y-6"
      >
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto text-3xl border ${
          vendorCaps.isServicePending
            ? 'bg-amber-50 text-amber-600 border-amber-100'
            : vendorCaps.isServiceRejected
            ? 'bg-red-50 text-red-600 border-red-100'
            : 'bg-[#FEF2F2] text-[#E31E24] border-red-100'
        }`}>
          {vendorCaps.isServicePending ? <FiClock /> : vendorCaps.isServiceRejected ? <FiAlertCircle /> : <FiLock />}
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">{title}</h2>
          <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
        </div>

        {vendorCaps.isServiceRejected && vendor?.serviceCapability?.rejectionReason && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-left text-xs text-red-700">
            <span className="font-bold block mb-1">Feedback from Reviewer:</span>
            {vendor.serviceCapability.rejectionReason}
          </div>
        )}

        <div className="bg-slate-50 rounded-2xl p-4 text-left border border-slate-100 text-xs text-slate-600 space-y-2">
          <div className="font-bold text-slate-900 flex items-center gap-1.5">
            <FiCheckCircle className="text-[#E31E24]" />
            <span>Service Partner Benefits:</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-slate-600 pl-1">
            {isServiceReq ? (
              <>
                <li>List official fire extinguisher maintenance & inspection services</li>
                <li>Configure custom pricing & service pincode coverage</li>
                <li>Receive verified appointments with automated scheduling</li>
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
          onClick={handleAction}
          disabled={isEnabling}
          className="w-full py-4 bg-[#E31E24] hover:bg-[#c6151b] text-white rounded-2xl font-bold text-sm shadow-lg shadow-red-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {getButtonText()} <FiArrowRight />
        </button>
      </motion.div>
    </div>
  );
};

export default CapabilityAccessRequired;
