import { useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../utils/api';

const METHOD_LABELS = { SHIPROCKET: 'Shiprocket', INTERNAL: 'Manual Delivery' };

const MANUAL_ONLY_MESSAGES = {
  WHOLESALE: 'Wholesale orders require Manual Delivery.',
  OVERWEIGHT: 'Order exceeds the maximum Shiprocket weight limit.',
};

/**
 * Delivery method for one shipment (Shiprocket vs Manual Delivery).
 * Options come from shipment.allowedDeliveryMethods (decided server-side from wholesale + weight).
 * Vendor can choose while the order is accepted (processing) and no delivery has started; Admin sees it read-only.
 */
const DeliveryMethodSelector = ({ shipment, orderId, vendorStatus, actor = 'vendor', onChanged }) => {
  const allowed = Array.isArray(shipment?.allowedDeliveryMethods) ? shipment.allowedDeliveryMethods : [];
  const [choice, setChoice] = useState(shipment?.deliveryMethod || '');
  const [saving, setSaving] = useState(false);

  // Legacy shipments (routed before vendor selection existed) have no options to show.
  if (!allowed.length) return null;

  const current = shipment.deliveryMethod || '';
  const manualOnly = allowed.length === 1 && allowed[0] === 'INTERNAL';
  const deliveryStarted = Boolean(shipment.deliveryBoyId || shipment.providerOrderId)
    || !['pending', 'processing', 'confirmed'].includes(shipment.status);
  const canEdit = actor === 'vendor' && !manualOnly && vendorStatus === 'processing' && !deliveryStarted;

  const save = async () => {
    if (!choice) return toast.error('Choose Shiprocket or Manual Delivery');
    setSaving(true);
    try {
      const data = await api.patch(`/vendor/orders/${orderId}/shipments/${shipment._id}/delivery-method`, { method: choice });
      toast.success(`${METHOD_LABELS[choice]} selected`);
      if (data?.warning) toast(data.warning, { icon: '⚠️', duration: 6000 });
      onChanged?.();
    } catch {
      // API client shows the error toast
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-left">
      <p className="text-xs font-bold text-gray-800">Delivery Method</p>

      {manualOnly ? (
        <div className="mt-2 space-y-1">
          <label className="flex items-center gap-2 text-xs font-semibold text-gray-800">
            <input type="radio" checked readOnly /> Manual Delivery
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input type="radio" disabled /> Shiprocket (unavailable)
          </label>
          <p className="text-[11px] text-amber-700">
            {MANUAL_ONLY_MESSAGES[shipment.deliveryRoutingReason] || shipment.deliveryRoutingDetails || 'This order requires Manual Delivery.'}
          </p>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-4">
            {['SHIPROCKET', 'INTERNAL'].filter((m) => allowed.includes(m)).map((method) => (
              <label key={method} className={`flex items-center gap-2 text-xs font-semibold ${canEdit ? 'text-gray-800 cursor-pointer' : 'text-gray-500'}`}>
                <input
                  type="radio"
                  name={`delivery-method-${shipment._id}`}
                  value={method}
                  checked={(canEdit ? choice : current) === method}
                  disabled={!canEdit}
                  onChange={() => setChoice(method)}
                />
                {METHOD_LABELS[method]}
              </label>
            ))}
          </div>

          {!current && actor === 'vendor' && vendorStatus !== 'processing' && (
            <p className="text-[11px] text-gray-500">Accept the order to choose how it will be delivered.</p>
          )}
          {!current && actor === 'admin' && (
            <p className="text-[11px] text-gray-500">Waiting for the vendor to choose Shiprocket or Manual Delivery.</p>
          )}
          {current && <p className="text-[11px] text-gray-600">Selected: <span className="font-semibold">{METHOD_LABELS[current]}</span></p>}

          {canEdit && (
            <button
              type="button"
              onClick={save}
              disabled={saving || !choice || choice === current}
              className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
              {saving ? 'Saving…' : current ? 'Change Delivery Method' : 'Confirm Delivery Method'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default DeliveryMethodSelector;
