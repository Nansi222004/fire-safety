import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { FiTruck, FiBox, FiPackage, FiCheckCircle, FiAlertCircle, FiRefreshCw } from 'react-icons/fi';

export const METHOD_LABELS = {
  SHIPROCKET: 'Shiprocket',
  INTERNAL: 'Manual Delivery',
  SELLER_DELIVERY: 'Seller Delivery',
};

const METHOD_OPTIONS = {
  SHIPROCKET: {
    emoji: '🚀',
    badge: 'Automated 3PL',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    description: 'Automated courier pickup, live AWB tracking and door-to-door carrier delivery.',
    selectedNote: 'Carrier pickup will be scheduled automatically when you mark ready for pickup.',
  },
  INTERNAL: {
    emoji: '🛵',
    badge: 'SafeFire Delivery App',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    description: 'A SafeFire delivery partner picks up the package and delivers it with the customer OTP.',
    selectedNote: 'Manual delivery via a SafeFire delivery partner. Assign a rider below.',
  },
  SELLER_DELIVERY: {
    emoji: '📦',
    badge: 'Your courier',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-100',
    description: 'Ship with a courier you arrange. Enter the courier and tracking number when you dispatch; the customer confirms delivery with an OTP.',
    selectedNote: 'You ship this package with your own courier. Enter courier and tracking details when you dispatch it.',
  },
};

const MANUAL_ONLY_MESSAGES = {
  WHOLESALE: 'Wholesale orders cannot use Shiprocket.',
  OVERWEIGHT: 'Package exceeds the maximum Shiprocket weight limit.',
};

const MethodIcon = ({ method }) => {
  if (method === 'SHIPROCKET') return <FiBox className="text-lg" />;
  if (method === 'SELLER_DELIVERY') return <FiPackage className="text-lg" />;
  return <FiTruck className="text-lg" />;
};

/** Legacy payloads (no effective methods from the server): keep the previous inference. */
const legacyAllowed = (shipment) => {
  if (Array.isArray(shipment?.allowedDeliveryMethods) && shipment.allowedDeliveryMethods.length > 0) return shipment.allowedDeliveryMethods;
  if (shipment?.deliveryRoutingReason === 'WHOLESALE' || shipment?.deliveryRoutingReason === 'OVERWEIGHT') return ['INTERNAL'];
  return ['SHIPROCKET', 'INTERNAL'];
};

/**
 * DeliveryMethodSelector
 * Shows and lets the vendor select how a package is fulfilled. The options are exactly the backend's
 * `effectiveAllowedDeliveryMethods` (Admin Delivery App / Seller Delivery switches, payment and routing
 * rules applied server-side); `unavailableDeliveryMethods` explains why an option is missing.
 */
const DeliveryMethodSelector = ({ shipment, orderId, vendorStatus, actor = 'vendor', onChanged }) => {
  const hasEffective = Array.isArray(shipment?.effectiveAllowedDeliveryMethods);
  const methods = hasEffective ? shipment.effectiveAllowedDeliveryMethods : legacyAllowed(shipment);
  const unavailable = Array.isArray(shipment?.unavailableDeliveryMethods) ? shipment.unavailableDeliveryMethods : [];
  const current = shipment?.deliveryMethod || '';
  const singleOption = methods.length === 1 ? methods[0] : '';

  const [choice, setChoice] = useState(current || singleOption);
  const [saving, setSaving] = useState(false);
  const [isChanging, setIsChanging] = useState(false);

  useEffect(() => {
    setChoice(current || singleOption);
    setIsChanging(false);
  }, [current, singleOption, shipment?._id]);

  const deliveryStarted = Boolean(shipment?.deliveryBoyId || shipment?.providerOrderId)
    || !['pending', 'processing', 'confirmed'].includes(shipment?.status);

  // Delivery App turned off after a Manual Delivery package was marked ready (no rider yet): the backend lets the
  // seller move it to Seller Delivery.
  const strandedInternal = current === 'INTERNAL' && !shipment?.deliveryBoyId && shipment?.status === 'ready_for_pickup'
    && !methods.includes('INTERNAL') && methods.includes('SELLER_DELIVERY');
  const canEdit = actor === 'vendor' && ((vendorStatus === 'processing' && !deliveryStarted) || strandedInternal);
  const currentUnavailable = current && hasEffective && !methods.includes(current) && !deliveryStarted
    ? unavailable.find((u) => u.method === current)
    : null;

  const save = async (methodOverride) => {
    const selectedMethod = methodOverride || choice;
    if (!selectedMethod || saving) {
      if (!selectedMethod) toast.error('Please choose a delivery method');
      return;
    }
    setSaving(true);
    try {
      const data = await api.patch(
        `/vendor/orders/${orderId}/shipments/${shipment._id}/delivery-method`,
        { method: selectedMethod }
      );
      toast.success(`${METHOD_LABELS[selectedMethod]} selected successfully!`);
      if (data?.warning) {
        toast(data.warning, { icon: '⚠️', duration: 6000 });
      }
      setIsChanging(false);
      onChanged?.();
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to update delivery method');
    } finally {
      setSaving(false);
    }
  };

  // Case 1: Method is already selected and user is not actively changing it
  if (current && !isChanging) {
    const option = METHOD_OPTIONS[current] || {};
    return (
      <div className="mt-3.5 rounded-xl border border-gray-200 bg-white p-3.5 sm:p-4 text-left shadow-xs transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-xl flex-shrink-0 ${current === 'SHIPROCKET' ? 'bg-indigo-50 text-indigo-600' : current === 'SELLER_DELIVERY' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-600'}`}>
              <MethodIcon method={current} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500 font-medium">Selected Delivery Method:</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-green-50 text-green-700 border border-green-200">
                  <FiCheckCircle className="text-xs" /> {METHOD_LABELS[current] || current}
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-1">{option.selectedNote}</p>
            </div>
          </div>

          {canEdit && methods.some((m) => m !== current) && (
            <button
              type="button"
              onClick={() => setIsChanging(true)}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 active:scale-95 rounded-lg border border-gray-200 transition-all sm:self-center"
            >
              <FiRefreshCw className="text-xs" /> Change Method
            </button>
          )}
        </div>
        {currentUnavailable && (
          <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
            <FiAlertCircle className="text-sm flex-shrink-0 mt-0.5 text-amber-600" />
            <p>
              {currentUnavailable.reason}{' '}
              {methods.length > 0
                ? `Change the delivery method to ${methods.map((m) => METHOD_LABELS[m]).join(' or ')}.`
                : shipment?.noDeliveryMethodReason || 'Contact Admin to resolve this shipment.'}
            </p>
          </div>
        )}
      </div>
    );
  }

  // Case 2: Delivery method not selected yet, or user clicked "Change Method"
  const restrictionNote = methods.length > 0 && !methods.includes('SHIPROCKET')
    ? MANUAL_ONLY_MESSAGES[shipment?.deliveryRoutingReason] || (shipment?.deliveryRoutingReason === 'SHIPROCKET_CREATION_FAILED' ? shipment?.deliveryRoutingDetails : null)
    : null;

  return (
    <div className="mt-3.5 rounded-xl border-2 border-primary-300/80 bg-primary-50/20 p-3.5 sm:p-4 text-left shadow-xs transition-all">
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-primary-100">
        <div className="flex items-center gap-2">
          <span className="p-1.5 bg-primary-100 text-primary-700 rounded-lg text-sm">🚚</span>
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-gray-900">Choose Delivery Method</h4>
            <p className="text-[11px] text-gray-600">
              Select how this package will be fulfilled before marking the order ready for pickup.
            </p>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-amber-100 text-amber-800 border border-amber-200 flex-shrink-0">
          Required
        </span>
      </div>

      {methods.length === 0 ? (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
          <FiAlertCircle className="text-sm flex-shrink-0 mt-0.5 text-red-600" />
          <div>
            <p className="font-bold">No delivery method available</p>
            <p className="text-[11px] mt-0.5">{shipment?.noDeliveryMethodReason || 'No delivery method is available for this shipment right now. Contact Admin to resolve it.'}</p>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {restrictionNote && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
              <FiAlertCircle className="text-sm flex-shrink-0 mt-0.5 text-amber-600" />
              <p className="text-[11px]">{restrictionNote}</p>
            </div>
          )}

          <div className={`grid grid-cols-1 ${methods.length > 1 ? 'sm:grid-cols-2' : ''} ${methods.length > 2 ? 'lg:grid-cols-3' : ''} gap-2.5`}>
            {methods.map((method) => {
              const option = METHOD_OPTIONS[method] || { emoji: '🚚', description: '' };
              const selected = choice === method;
              return (
                <label
                  key={method}
                  className={`p-3 rounded-xl border-2 transition-all flex items-start gap-3 ${
                    selected
                      ? 'border-primary-600 bg-white ring-2 ring-primary-100 shadow-xs'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50'
                  } ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <input
                    type="radio"
                    name={`delivery-method-${shipment?._id}`}
                    value={method}
                    checked={selected}
                    disabled={!canEdit || saving}
                    onChange={() => setChoice(method)}
                    className="mt-0.5 h-4 w-4 text-primary-600 focus:ring-primary-500 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                        {option.emoji} {METHOD_LABELS[method] || method}
                      </span>
                      {option.badge && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${option.badgeClass}`}>
                          {option.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-600 mt-1">{option.description}</p>
                  </div>
                </label>
              );
            })}
          </div>

          {unavailable.length > 0 && (
            <ul className="space-y-1">
              {unavailable.map((u) => (
                <li key={u.method} className="text-[11px] text-gray-500 flex items-start gap-1.5">
                  <FiAlertCircle className="mt-0.5 flex-shrink-0 text-gray-400" />
                  <span><span className="font-semibold">{METHOD_LABELS[u.method] || u.method} unavailable:</span> {u.reason}</span>
                </li>
              ))}
            </ul>
          )}

          {!current && actor === 'vendor' && vendorStatus !== 'processing' && (
            <p className="text-[11px] text-gray-500">Accept the order first to choose how it will be delivered.</p>
          )}

          {canEdit && (
            <div className="pt-1 flex items-center justify-end gap-2.5">
              {isChanging && (
                <button
                  type="button"
                  onClick={() => {
                    setIsChanging(false);
                    setChoice(current);
                  }}
                  disabled={saving}
                  className="px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 rounded-xl text-xs font-semibold transition-all"
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={() => save(choice)}
                disabled={saving || !choice || choice === current}
                className="px-4 py-2 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 active:scale-95 text-white rounded-xl text-xs font-bold shadow-md shadow-primary-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : current ? 'Update Delivery Method' : `Confirm ${choice ? METHOD_LABELS[choice] : 'Delivery Method'}`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DeliveryMethodSelector;
