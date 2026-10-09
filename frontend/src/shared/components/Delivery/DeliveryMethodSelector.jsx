import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { FiTruck, FiBox, FiCheckCircle, FiAlertCircle, FiRefreshCw } from 'react-icons/fi';

const METHOD_LABELS = {
  SHIPROCKET: 'Shiprocket',
  INTERNAL: 'Manual Delivery',
};

const MANUAL_ONLY_MESSAGES = {
  WHOLESALE: 'Wholesale orders require Manual Delivery (Internal Fleet).',
  OVERWEIGHT: 'Package exceeds the maximum Shiprocket weight limit and requires Manual Delivery.',
};

/**
 * DeliveryMethodSelector
 * Displays and allows selecting the fulfillment delivery method (Shiprocket vs Manual Delivery).
 * Options come from shipment.allowedDeliveryMethods (or inferred from wholesale/overweight rules).
 * Vendor can choose while order is processing and no delivery partner is assigned.
 */
const DeliveryMethodSelector = ({ shipment, orderId, vendorStatus, actor = 'vendor', onChanged }) => {
  const allowed = Array.isArray(shipment?.allowedDeliveryMethods) && shipment.allowedDeliveryMethods.length > 0
    ? shipment.allowedDeliveryMethods
    : (shipment?.deliveryRoutingReason === 'WHOLESALE' || shipment?.deliveryRoutingReason === 'OVERWEIGHT')
      ? ['INTERNAL']
      : ['SHIPROCKET', 'INTERNAL'];

  const current = shipment?.deliveryMethod || '';
  const manualOnly = allowed.length === 1 && allowed[0] === 'INTERNAL';

  const [choice, setChoice] = useState(current || (manualOnly ? 'INTERNAL' : ''));
  const [saving, setSaving] = useState(false);
  const [isChanging, setIsChanging] = useState(false);

  useEffect(() => {
    setChoice(current || (manualOnly ? 'INTERNAL' : ''));
  }, [current, manualOnly, shipment?._id]);

  const deliveryStarted = Boolean(shipment?.deliveryBoyId || shipment?.providerOrderId)
    || !['pending', 'processing', 'confirmed'].includes(shipment?.status);

  const canEdit = actor === 'vendor' && vendorStatus === 'processing' && !deliveryStarted;

  const save = async (methodOverride) => {
    const selectedMethod = methodOverride || choice;
    if (!selectedMethod) {
      return toast.error('Please choose Shiprocket or Manual Delivery');
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
    return (
      <div className="mt-3.5 rounded-xl border border-gray-200 bg-white p-3.5 sm:p-4 text-left shadow-xs transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-xl flex-shrink-0 ${current === 'SHIPROCKET' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
              {current === 'SHIPROCKET' ? <FiBox className="text-lg" /> : <FiTruck className="text-lg" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-medium">Selected Delivery Method:</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-green-50 text-green-700 border border-green-200">
                  <FiCheckCircle className="text-xs" /> {METHOD_LABELS[current] || current}
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                {current === 'SHIPROCKET'
                  ? 'Carrier pickup will be scheduled automatically when you mark ready for pickup.'
                  : 'Manual delivery via internal fleet or local rider. Assign rider below.'}
              </p>
            </div>
          </div>

          {canEdit && (
            <button
              type="button"
              onClick={() => setIsChanging(true)}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 active:scale-95 rounded-lg border border-gray-200 transition-all sm:self-center"
            >
              <FiRefreshCw className="text-xs" /> Change Method
            </button>
          )}
        </div>
      </div>
    );
  }

  // Case 2: Delivery method not selected yet, or user clicked "Change Method"
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

      {manualOnly ? (
        <div className="mt-3 space-y-2.5">
          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
            <FiAlertCircle className="text-sm flex-shrink-0 mt-0.5 text-amber-600" />
            <div>
              <p className="font-bold">Manual Delivery Required</p>
              <p className="text-[11px] mt-0.5">
                {MANUAL_ONLY_MESSAGES[shipment?.deliveryRoutingReason] || shipment?.deliveryRoutingDetails || 'This order requires Manual Delivery.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Manual Delivery - Selected */}
            <div className="p-3 rounded-xl border-2 border-primary-600 bg-primary-50/40 cursor-default flex items-start gap-3">
              <input
                type="radio"
                checked={true}
                readOnly
                className="mt-0.5 h-4 w-4 text-primary-600 focus:ring-primary-500"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-900">Manual Delivery</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded">Internal</span>
                </div>
                <p className="text-[11px] text-gray-600 mt-0.5">Fulfill via local delivery partner or internal fleet.</p>
              </div>
            </div>

            {/* Shiprocket - Disabled */}
            <div className="p-3 rounded-xl border border-gray-200 bg-gray-50/80 opacity-60 cursor-not-allowed flex items-start gap-3">
              <input
                type="radio"
                disabled={true}
                className="mt-0.5 h-4 w-4 text-gray-300"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500">Shiprocket</span>
                  <span className="text-[10px] font-medium px-1.5 py-0.2 bg-gray-200 text-gray-600 rounded">Unavailable</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">Not available for this package.</p>
              </div>
            </div>
          </div>

          {canEdit && (
            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => save('INTERNAL')}
                disabled={saving}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-md shadow-primary-500/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving ? 'Confirming…' : 'Confirm Manual Delivery'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Option 1: Shiprocket */}
            <div
              onClick={() => canEdit && setChoice('SHIPROCKET')}
              className={`p-3 rounded-xl border-2 transition-all flex items-start gap-3 ${
                choice === 'SHIPROCKET'
                  ? 'border-primary-600 bg-white ring-2 ring-primary-100 shadow-xs'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50'
              } ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <input
                type="radio"
                name={`delivery-method-${shipment?._id}`}
                value="SHIPROCKET"
                checked={choice === 'SHIPROCKET'}
                disabled={!canEdit}
                onChange={() => setChoice('SHIPROCKET')}
                className="mt-0.5 h-4 w-4 text-primary-600 focus:ring-primary-500 cursor-pointer"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    🚀 Shiprocket
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded border border-indigo-100">
                    Automated 3PL
                  </span>
                </div>
                <p className="text-[11px] text-gray-600 mt-1">
                  Automated courier pickup, live AWB tracking and door-to-door carrier delivery.
                </p>
              </div>
            </div>

            {/* Option 2: Manual Delivery */}
            <div
              onClick={() => canEdit && setChoice('INTERNAL')}
              className={`p-3 rounded-xl border-2 transition-all flex items-start gap-3 ${
                choice === 'INTERNAL'
                  ? 'border-primary-600 bg-white ring-2 ring-primary-100 shadow-xs'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50'
              } ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <input
                type="radio"
                name={`delivery-method-${shipment?._id}`}
                value="INTERNAL"
                checked={choice === 'INTERNAL'}
                disabled={!canEdit}
                onChange={() => setChoice('INTERNAL')}
                className="mt-0.5 h-4 w-4 text-primary-600 focus:ring-primary-500 cursor-pointer"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    🛵 Manual Delivery
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded border border-emerald-100">
                    Internal Fleet
                  </span>
                </div>
                <p className="text-[11px] text-gray-600 mt-1">
                  Assign to local SafeFire delivery riders or coordinate direct store delivery.
                </p>
              </div>
            </div>
          </div>

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
                disabled={saving || !choice || (choice === current && !isChanging)}
                className="px-4 py-2 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 active:scale-95 text-white rounded-xl text-xs font-bold shadow-md shadow-primary-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : current ? 'Update Delivery Method' : 'Confirm Delivery Method'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DeliveryMethodSelector;
