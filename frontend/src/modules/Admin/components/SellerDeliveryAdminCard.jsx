import { useState } from 'react';
import toast from 'react-hot-toast';
import { FiPackage, FiExternalLink, FiCheckCircle, FiAlertTriangle } from 'react-icons/fi';
import api from '../../../shared/utils/api';

const isHttpsUrl = (value) => {
  try {
    return new URL(String(value || '')).protocol === 'https:';
  } catch {
    return false;
  }
};
const formatDateTime = (value) => (value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const FIELD_LABELS = {
  courierName: 'Courier',
  trackingNumber: 'Tracking number',
  trackingUrl: 'Tracking link',
  deliveryPersonName: 'Delivery person',
  deliveryPersonPhone: 'Delivery person phone',
};
const CONFIRMATION_LABELS = {
  CUSTOMER_OTP: 'Customer OTP (entered by seller)',
  RIDER_OTP: 'Customer OTP (entered by rider)',
  COURIER_WEBHOOK: 'Courier webhook',
  ADMIN_OVERRIDE: 'Admin override',
};

/**
 * Admin view of a Seller Delivery package: courier + tracking, change history, delivery confirmation and the
 * audited delivery override (reason + proof required) for packages whose customer OTP cannot be used.
 */
const SellerDeliveryAdminCard = ({ shipment, orderId, onChanged }) => {
  const sd = shipment?.sellerDelivery || {};
  const confirmation = shipment?.deliveryConfirmation;
  const inTransit = ['shipped', 'out_for_delivery'].includes(shipment?.status);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [proofReference, setProofReference] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (reason.trim().length < 10) return toast.error('Describe the reason in at least 10 characters.');
    if (proofReference.trim().length < 3) return toast.error('Proof or reference is required (e.g. courier POD number).');
    if (!window.confirm('Mark this package delivered? This starts the seller\'s earnings hold and cannot be undone.')) return;
    setSaving(true);
    try {
      await api.post(`/admin/orders/${orderId}/shipments/${shipment._id}/confirm-delivery`,
        { reason: reason.trim(), proofReference: proofReference.trim() }, { skipErrorToast: true });
      toast.success('Delivery confirmed by Admin override.');
      setOpen(false);
      setReason('');
      setProofReference('');
      onChanged?.();
    } catch (err) {
      toast.error(err?.response?.data?.errors?.[0]?.message || err?.response?.data?.message || 'Override failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-left space-y-2">
      <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5"><FiPackage /> Seller Delivery (seller&apos;s own courier)</p>
      {sd.courierName ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
          <p><span className="text-gray-500">Courier:</span> <span className="font-semibold text-gray-800">{sd.courierName}</span></p>
          <p><span className="text-gray-500">Tracking no.:</span> <span className="font-mono font-semibold text-gray-800 break-all">{sd.trackingNumber}</span></p>
          {isHttpsUrl(sd.trackingUrl) && (
            <p className="sm:col-span-2">
              <a href={sd.trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary-600 hover:underline break-all">
                Open tracking link <FiExternalLink />
              </a>
            </p>
          )}
          {(sd.deliveryPersonName || sd.deliveryPersonPhone) && (
            <p className="sm:col-span-2"><span className="text-gray-500">Delivery person:</span> <span className="font-semibold text-gray-800">{[sd.deliveryPersonName, sd.deliveryPersonPhone].filter(Boolean).join(' · ')}</span></p>
          )}
          <p><span className="text-gray-500">Shipped:</span> <span className="font-semibold text-gray-800">{formatDateTime(sd.shippedAt)}</span></p>
          {shipment.deliveryOtpSentAt && (
            <p><span className="text-gray-500">Delivery OTP sent:</span> <span className="font-semibold text-gray-800">{formatDateTime(shipment.deliveryOtpSentAt)}</span></p>
          )}
        </div>
      ) : (
        <p className="text-xs text-amber-800">Not shipped yet — the seller enters courier and tracking details after marking the order ready for pickup.</p>
      )}

      {sd.trackingUpdates?.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold text-amber-900">Tracking changes ({sd.trackingUpdates.length})</summary>
          <ul className="mt-1.5 space-y-1">
            {sd.trackingUpdates.map((u, i) => (
              <li key={`${u.field}-${i}`} className="text-gray-700">
                <span className="text-gray-500">{formatDateTime(u.at)}</span> — {FIELD_LABELS[u.field] || u.field}:{' '}
                <span className="line-through text-gray-400 break-all">{u.oldValue || 'empty'}</span> → <span className="font-semibold break-all">{u.newValue || 'removed'}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {confirmation?.method && (
        <div className="p-2 rounded-md bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 space-y-0.5">
          <p className="font-bold flex items-center gap-1"><FiCheckCircle /> Delivered {formatDateTime(confirmation.confirmedAt || shipment.deliveredAt)}</p>
          <p>Confirmation: {CONFIRMATION_LABELS[confirmation.method] || confirmation.method}</p>
          {confirmation.reason && <p>Reason: {confirmation.reason}</p>}
          {confirmation.proofReference && <p>Proof: {confirmation.proofReference}</p>}
        </div>
      )}

      {inTransit && !open && (
        <button type="button" onClick={() => setOpen(true)}
          className="text-xs font-bold text-amber-900 underline hover:no-underline">
          Customer OTP not possible? Confirm delivery by override…
        </button>
      )}
      {inTransit && open && (
        <form onSubmit={submit} className="space-y-2 p-2.5 bg-white rounded-md border border-amber-200">
          <p className="text-[11px] text-amber-900 flex items-start gap-1.5">
            <FiAlertTriangle className="mt-0.5 flex-shrink-0" />
            Use only when the customer&apos;s delivery OTP cannot be used. The reason and proof are saved on the shipment and in the audit log.
          </p>
          <label className="block text-xs font-semibold text-gray-700">
            Reason <span className="text-red-500">*</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} disabled={saving}
              className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-primary-500" />
          </label>
          <label className="block text-xs font-semibold text-gray-700">
            Proof / reference <span className="text-red-500">*</span>
            <input value={proofReference} onChange={(e) => setProofReference(e.target.value)} maxLength={300} disabled={saving}
              placeholder="Courier POD number, call record ID, photo link…"
              className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-primary-500" />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" disabled={saving} onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs font-semibold border border-gray-300 rounded-md">Cancel</button>
            <button type="submit" disabled={saving || reason.trim().length < 10 || proofReference.trim().length < 3}
              className="px-3 py-1.5 text-xs font-bold text-white bg-amber-700 rounded-md disabled:opacity-50">
              {saving ? 'Confirming…' : 'Confirm delivery'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default SellerDeliveryAdminCard;
