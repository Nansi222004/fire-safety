import { useState, useEffect } from 'react';
import { FiSave, FiCreditCard, FiTruck } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useSettingsStore } from '../../../../shared/store/settingsStore';
import AnimatedSelect from '../../components/AnimatedSelect';
import toast from 'react-hot-toast';
import { getCompanyPaymentSettings, updateCompanyPaymentSettings } from '../../services/adminService';
import api from '../../../../shared/utils/api';

const PaymentShippingSettings = () => {
  const { settings, updateSettings, initialize } = useSettingsStore();
  const [paymentData, setPaymentData] = useState({});
  const [shippingData, setShippingData] = useState({});
  const routingDefaults = {
    maxShiprocketDistanceKm: 50,
    maxShiprocketWeightKg: 20,
    maxAutomaticShiprocketOrderValue: 50000,
  };
  const [activeSection, setActiveSection] = useState('payment');
  const [companyPaymentData, setCompanyPaymentData] = useState({
    upiId: '',
    accountName: '',
    accountNumber: '',
    bankName: '',
    ifscCode: ''
  });

  useEffect(() => {
    initialize();
    if (settings) {
      if (settings.payment) setPaymentData(settings.payment);
      if (settings.shipping) setShippingData({ ...routingDefaults, ...settings.shipping });
    }

    // Load company payment settings from database
    const loadCompanySettings = async () => {
      try {
        const res = await getCompanyPaymentSettings();
        const data = res?.data ?? res ?? {};
        if (data.value) {
          setCompanyPaymentData(data.value);
        }
      } catch (err) {
        console.error('Failed to load company payment settings', err);
      }
    };
    loadCompanySettings();
  }, []);

  useEffect(() => {
    if (settings) {
      if (settings.payment) setPaymentData(settings.payment);
      if (settings.shipping) setShippingData({ ...routingDefaults, ...settings.shipping });
    }
  }, [settings]);

  // Effective payment state from the server (includes the PAYMENT_MODE default for online payments
  // when the Admin has never saved the Online switch).
  const [serverPayment, setServerPayment] = useState(null);
  useEffect(() => {
    api.get('/settings/checkout')
      .then((res) => setServerPayment((res?.data ?? res)?.payment || null))
      .catch(() => setServerPayment(null));
  }, []);

  // Same defaults as the backend: a method with no saved value is on.
  const isOn = (field) => paymentData[field] !== false;
  const onlineEnabled = typeof paymentData.onlineEnabled === 'boolean'
    ? paymentData.onlineEnabled
    : serverPayment?.onlineEnabled === true;

  const handlePaymentChange = (e) => {
    const { name, value, type, checked } = e.target;
    setPaymentData({
      ...paymentData,
      [name]: type === 'checkbox' ? checked : value,
    });
  };

  const handleShippingChange = (e) => {
    const { name, value } = e.target;
    setShippingData({
      ...shippingData,
      [name]: value,
    });
  };

  const handleCompanyChange = (e) => {
    const { name, value } = e.target;
    setCompanyPaymentData({
      ...companyPaymentData,
      [name]: value,
    });
  };

  const handlePaymentFeeChange = (method, fee) => {
    setPaymentData({
      ...paymentData,
      paymentFees: {
        ...paymentData.paymentFees,
        [method]: parseFloat(fee) || 0,
      },
    });
  };

  const handleShippingMethodToggle = (method) => {
    const methods = shippingData.shippingMethods || [];
    if (methods.includes(method)) {
      setShippingData({
        ...shippingData,
        shippingMethods: methods.filter((m) => m !== method),
      });
    } else {
      setShippingData({
        ...shippingData,
        shippingMethods: [...methods, method],
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Save explicit booleans so the stored setting means exactly what the Admin sees here.
    const paymentToSave = {
      ...paymentData,
      onlineEnabled,
      codEnabled: isOn('codEnabled'),
      cardEnabled: isOn('cardEnabled'),
      upiEnabled: isOn('upiEnabled'),
      walletEnabled: isOn('walletEnabled'),
    };
    const canPay = paymentToSave.codEnabled || (onlineEnabled && (paymentToSave.cardEnabled || paymentToSave.upiEnabled));
    if (!canPay) {
      toast.error('Keep at least one payment method on: Cash on Delivery, or Online Payments with Card or UPI enabled.');
      return;
    }
    // Same defaults as the backend: Delivery App on, Seller Delivery off until Admin enables it.
    // Save exactly what the form shows: an unsaved rate/threshold is 0 (the backend's default), never blank.
    const toAmount = (value) => (value === '' || value === undefined || value === null ? 0 : Number(value));
    const shippingToSave = {
      ...shippingData,
      freeShippingThreshold: toAmount(shippingData.freeShippingThreshold),
      defaultShippingRate: toAmount(shippingData.defaultShippingRate),
      deliveryAppEnabled: shippingData.deliveryAppEnabled !== false,
      sellerDeliveryEnabled: shippingData.sellerDeliveryEnabled === true,
    };
    try {
      await updateSettings('payment', paymentToSave, true);
      await updateSettings('shipping', shippingToSave, true);
      await updateCompanyPaymentSettings(companyPaymentData);
      toast.success('Settings saved successfully');
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to save settings');
    }
  };

  const sections = [
    { id: 'payment', label: 'Payment Methods', icon: FiCreditCard },
    { id: 'shipping', label: 'Shipping Settings', icon: FiTruck },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-full overflow-x-hidden"
    >
      <div className="lg:hidden">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Payment & Shipping</h1>
        <p className="text-sm sm:text-base text-gray-600">Configure payment methods and shipping options</p>
      </div>

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
                      ? 'border-primary-600 text-primary-600 font-semibold'
                      : 'border-transparent text-gray-600 hover:text-gray-800'
                    }`}
                >
                  <Icon className="text-base sm:text-lg" />
                  <span>{section.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-3 sm:p-4 md:p-6">
          {/* Payment Section */}
          {activeSection === 'payment' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4">Payment Methods</h3>
                <div className="mb-4 p-3 sm:p-4 border-2 border-primary-200 bg-primary-50/40 rounded-lg">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={onlineEnabled}
                      onChange={(e) => setPaymentData({ ...paymentData, onlineEnabled: e.target.checked })}
                      className="mt-0.5 w-4 h-4 text-primary-600 rounded focus:ring-primary-500 flex-shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-gray-800">Online Payments (Razorpay)</span>
                      <span className="block text-xs text-gray-600 mt-0.5">
                        Master switch for Card and UPI payments at checkout, service bookings and wholesale.
                        When on, customers are charged through the Razorpay keys configured on the server.
                      </span>
                      {typeof paymentData.onlineEnabled !== 'boolean' && (
                        <span className="block text-xs text-amber-700 mt-1">
                          Not saved yet — currently following the server default ({onlineEnabled ? 'on' : 'off'}). Saving this page stores your choice.
                        </span>
                      )}
                    </span>
                  </label>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Changes apply to new orders and bookings only. Existing Cash on Delivery orders, collections and settlements are not affected.
                </p>
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        name="codEnabled"
                        checked={isOn('codEnabled')}
                        onChange={handlePaymentChange}
                        className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 flex-shrink-0"
                      />
                      <span className="text-sm font-semibold text-gray-700 truncate">Cash on Delivery (COD)</span>
                    </div>
                    <div className="flex items-center gap-2 sm:ml-4">
                      <label className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Fee (%):</label>
                      <input
                        type="number"
                        value={paymentData.paymentFees?.cod || 0}
                        onChange={(e) => handlePaymentFeeChange('cod', e.target.value)}
                        step="0.1"
                        min="0"
                        max="10"
                        className="w-16 sm:w-20 px-2 sm:px-3 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        name="cardEnabled"
                        checked={isOn('cardEnabled')}
                        disabled={!onlineEnabled}
                        onChange={handlePaymentChange}
                        className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 flex-shrink-0"
                      />
                      <span className="text-sm font-semibold text-gray-700 truncate">Credit/Debit Card</span>
                    </div>
                    <div className="flex items-center gap-2 sm:ml-4">
                      <label className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Fee (%):</label>
                      <input
                        type="number"
                        value={paymentData.paymentFees?.card || 2.5}
                        onChange={(e) => handlePaymentFeeChange('card', e.target.value)}
                        step="0.1"
                        min="0"
                        max="10"
                        className="w-16 sm:w-20 px-2 sm:px-3 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        name="walletEnabled"
                        checked={isOn('walletEnabled')}
                        onChange={handlePaymentChange}
                        className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 flex-shrink-0"
                      />
                      <span className="text-sm font-semibold text-gray-700 truncate">Digital Wallet</span>
                    </div>
                    <div className="flex items-center gap-2 sm:ml-4">
                      <label className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Fee (%):</label>
                      <input
                        type="number"
                        value={paymentData.paymentFees?.wallet || 1.5}
                        onChange={(e) => handlePaymentFeeChange('wallet', e.target.value)}
                        step="0.1"
                        min="0"
                        max="10"
                        className="w-16 sm:w-20 px-2 sm:px-3 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        name="upiEnabled"
                        checked={isOn('upiEnabled')}
                        disabled={!onlineEnabled}
                        onChange={handlePaymentChange}
                        className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 flex-shrink-0"
                      />
                      <span className="text-sm font-semibold text-gray-700 truncate">UPI</span>
                    </div>
                    <div className="flex items-center gap-2 sm:ml-4">
                      <label className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Fee (%):</label>
                      <input
                        type="number"
                        value={paymentData.paymentFees?.upi || 0.5}
                        onChange={(e) => handlePaymentFeeChange('upi', e.target.value)}
                        step="0.1"
                        min="0"
                        max="10"
                        className="w-16 sm:w-20 px-2 sm:px-3 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>


              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Company Payout Collection Details (COD Settlements)</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Company UPI ID</label>
                      <input
                        type="text"
                        name="upiId"
                        value={companyPaymentData.upiId || ''}
                        onChange={handleCompanyChange}
                        placeholder="e.g. pay@company.com"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-semibold text-gray-800"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Account Holder Name</label>
                      <input
                        type="text"
                        name="accountName"
                        value={companyPaymentData.accountName || ''}
                        onChange={handleCompanyChange}
                        placeholder="e.g. COMPANY LOGISTICS PVT LTD"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-semibold text-gray-800"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Account Number</label>
                      <input
                        type="text"
                        name="accountNumber"
                        value={companyPaymentData.accountNumber || ''}
                        onChange={handleCompanyChange}
                        placeholder="e.g. 50200012345678"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-mono text-gray-800 font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Bank Name</label>
                      <input
                        type="text"
                        name="bankName"
                        value={companyPaymentData.bankName || ''}
                        onChange={handleCompanyChange}
                        placeholder="e.g. HDFC Bank"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-semibold text-gray-800"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">IFSC Code</label>
                      <input
                        type="text"
                        name="ifscCode"
                        value={companyPaymentData.ifscCode || ''}
                        onChange={handleCompanyChange}
                        placeholder="e.g. HDFC0000103"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-mono text-gray-800 font-bold"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Shipping Section */}
          {activeSection === 'shipping' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Free Shipping Threshold
                  </label>
                  <input
                    type="number"
                    name="freeShippingThreshold"
                    value={shippingData.freeShippingThreshold ?? 0}
                    onChange={handleShippingChange}
                    min="0"
                    step="0.01"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Free shipping for orders above this amount</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Default Shipping Rate
                  </label>
                  <input
                    type="number"
                    name="defaultShippingRate"
                    value={shippingData.defaultShippingRate ?? 0}
                    onChange={handleShippingChange}
                    min="0"
                    step="0.01"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Default shipping cost</p>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-lg font-bold text-gray-800 mb-1">Delivery Methods</h3>
                <p className="text-xs text-gray-500 mb-4">
                  Control who can deliver new packages. Shiprocket is not affected by these switches. Changes apply to new delivery
                  assignments and method choices only — packages already with a delivery partner are completed normally.
                </p>
                <div className="space-y-3">
                  <label className="flex items-start gap-3 p-3 sm:p-4 border-2 border-primary-200 bg-primary-50/40 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shippingData.deliveryAppEnabled !== false}
                      onChange={(e) => setShippingData({ ...shippingData, deliveryAppEnabled: e.target.checked })}
                      className="mt-0.5 w-4 h-4 text-primary-600 rounded focus:ring-primary-500 flex-shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-gray-800">SafeFire Delivery App (internal riders)</span>
                      <span className="block text-xs text-gray-600 mt-0.5">
                        When off, sellers cannot choose Manual Delivery and no new rider assignments are made (forward deliveries,
                        return pickups and exchange replacements). Riders who already hold a package can still pick it up, deliver it
                        with the customer OTP and settle cash. Shiprocket failures are not sent to riders while this is off.
                      </span>
                      {typeof shippingData.deliveryAppEnabled !== 'boolean' && (
                        <span className="block text-xs text-amber-700 mt-1">Not saved yet — currently on (default).</span>
                      )}
                    </span>
                  </label>
                  <label className="flex items-start gap-3 p-3 sm:p-4 border border-gray-200 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shippingData.sellerDeliveryEnabled === true}
                      onChange={(e) => setShippingData({ ...shippingData, sellerDeliveryEnabled: e.target.checked })}
                      className="mt-0.5 w-4 h-4 text-primary-600 rounded focus:ring-primary-500 flex-shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-gray-800">Seller Delivery (seller&apos;s own courier)</span>
                      <span className="block text-xs text-gray-600 mt-0.5">
                        Lets sellers ship prepaid packages with a courier they arrange, entering the courier name and tracking number.
                        The customer confirms delivery with an OTP; seller earnings follow the normal return-window hold.
                        Not available for Cash on Delivery orders.
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-lg font-bold text-gray-800 mb-1">Shiprocket Routing Limits</h3>
                <p className="text-xs text-gray-500 mb-4">Shipments heavier than this limit (and all wholesale orders) use Manual Delivery. Lighter orders let the vendor choose Shiprocket or Manual Delivery.</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                  {[
                    ['maxShiprocketWeightKg', 'Maximum Shiprocket Weight (kg)', 20],
                  ].map(([name, label, fallback]) => (
                    <div key={name}>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">{label}</label>
                      <input
                        type="number"
                        name={name}
                        value={shippingData[name] ?? fallback}
                        onChange={handleShippingChange}
                        min="0.01"
                        step="0.01"
                        required
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Shipping Methods</h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={shippingData.shippingMethods?.includes('standard') || false}
                      onChange={() => handleShippingMethodToggle('standard')}
                      className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm font-semibold text-gray-700">Standard Shipping</span>
                  </label>
                  <label className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={shippingData.shippingMethods?.includes('express') || false}
                      onChange={() => handleShippingMethodToggle('express')}
                      className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm font-semibold text-gray-700">Express Shipping</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-4 sm:pt-6 border-t border-gray-200 mt-4 sm:mt-6">
            <button
              type="submit"
              className="flex items-center gap-2 px-4 sm:px-6 py-2 gradient-green text-white rounded-lg hover:shadow-glow-green transition-all font-semibold text-sm sm:text-base w-full sm:w-auto"
            >
              <FiSave />
              Save Settings
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
};

export default PaymentShippingSettings;

