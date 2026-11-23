import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { FiPackage, FiTruck, FiSend, FiCheckCircle, FiEdit2, FiExternalLink, FiAlertCircle, FiKey } from 'react-icons/fi';

const OTP_COOLDOWN_MS = 60 * 1000;
const PHONE_RE = /^[6-9]\d{9}$/;
const TRACKING_RE = /^[A-Za-z0-9][A-Za-z0-9\-_/. ]*$/;

const isHttpsUrl = (value) => {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch {
    return false;
  }
};

/** Same rules as the backend validator, so the seller sees problems before submitting. */
export const validateSellerTracking = (values, { requireCore = true } = {}) => {
  const errors = {};
  const courier = String(values.courierName || '').trim();
  const tracking = String(values.trackingNumber || '').trim();
  const url = String(values.trackingUrl || '').trim();
  const phone = String(values.deliveryPersonPhone || '').trim();
  if (requireCore || courier) {
    if (!courier) errors.courierName = 'Courier name is required.';
    else if (courier.length < 2 || courier.length > 100) errors.courierName = 'Courier name must be 2–100 characters.';
  }
  if (requireCore || tracking) {
    if (!tracking) errors.trackingNumber = 'Tracking number is required.';
    else if (tracking.length < 3 || tracking.length > 64) errors.trackingNumber = 'Tracking number must be 3–64 characters.';
    else if (!TRACKING_RE.test(tracking)) errors.trackingNumber = 'Use only letters, numbers, spaces and - _ / .';
  }
  if (url && !isHttpsUrl(url)) errors.trackingUrl = 'Tracking link must be a valid https:// URL.';
  if (String(values.deliveryPersonName || '').trim().length > 100) errors.deliveryPersonName = 'Name must be at most 100 characters.';
  if (phone && !PHONE_RE.test(phone)) errors.deliveryPersonPhone = 'Enter a valid 10-digit Indian mobile number.';
  return errors;
};

const apiError = (err, fallback) => err?.response?.data?.errors?.[0]?.message || err?.response?.data?.message || err?.message || fallback;

const fieldClass = (hasError) => `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-1 ${hasError
  ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
  : 'border-gray-300 focus:border-primary-500 focus:ring-primary-500'}`;

const emptyForm = (sd = {}) => ({
  courierName: sd.courierName || '',
  trackingNumber: sd.trackingNumber || '',
  trackingUrl: sd.trackingUrl || '',
  deliveryPersonName: sd.deliveryPersonName || '',
  deliveryPersonPhone: sd.deliveryPersonPhone || '',
});

const TrackingForm = ({ values, errors, onChange, disabled }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    {[
      ['courierName', 'Courier / transport company', 'e.g. BlueDart, DTDC, local transport', true],
      ['trackingNumber', 'Tracking number', 'Courier AWB / consignment number', true],
      ['trackingUrl', 'Tracking link (optional)', 'https://…', false],
      ['deliveryPersonName', 'Delivery person name (optional)', 'Name', false],
      ['deliveryPersonPhone', 'Delivery person mobile (optional)', '10-digit mobile', false],
    ].map(([name, label, placeholder, required]) => (
      <div key={name} className={name === 'trackingUrl' ? 'sm:col-span-2' : ''}>
        <label htmlFor={`sd-${name}`} className="block text-xs font-semibold text-gray-700 mb-1">
          {label}{required && <span className="text-red-500"> *</span>}
        </label>
        <input
          id={`sd-${name}`}
          type={name === 'trackingUrl' ? 'url' : name === 'deliveryPersonPhone' ? 'tel' : 'text'}
          inputMode={name === 'deliveryPersonPhone' ? 'numeric' : undefined}
          value={values[name]}
          disabled={disabled}
          maxLength={name === 'trackingUrl' ? 500 : name === 'trackingNumber' ? 64 : name === 'deliveryPersonPhone' ? 10 : 100}
          placeholder={placeholder}
          onChange={(e) => onChange(name, name === 'deliveryPersonPhone' ? e.target.value.replace(/\D/g, '').slice(0, 10) : e.target.value)}
          className={fieldClass(Boolean(errors[name]))}
        />
        {errors[name] && <p className="text-[11px] text-red-600 mt-1">{errors[name]}</p>}
      </div>
    ))}
  </div>
);

const formatDateTime = (value) => (value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/**
 * Seller Delivery workflow for one package (seller's own courier):
 *   ready for pickup → enter courier + tracking → shipped → send customer OTP → enter OTP → delivered.
 * Every action is enforced server-side; this panel only shows the controls valid for the current status.
 */
const SellerDeliveryPanel = ({ shipment, orderId, onChanged }) => {
  const sd = shipment?.sellerDelivery || {};
  const status = shipment?.status;
  const base = `/vendor/orders/${orderId}/shipments/${shipment?._id}/seller-delivery`;
  const [form, setForm] = useState(emptyForm(sd));
  const [errors, setErrors] = useState({});
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState('');
  const [otp, setOtp] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setForm(emptyForm(shipment?.sellerDelivery));
    setErrors({});
    setEditing(false);
  }, [shipment?._id, shipment?.sellerDelivery?.lastUpdatedAt, status]);

  const otpSentAt = shipment?.deliveryOtpSentAt ? new Date(shipment.deliveryOtpSentAt).getTime() : 0;
  // `now` only drives the 1-second re-render; the remaining time is always taken from the current clock.
  const cooldownLeft = Math.min(OTP_COOLDOWN_MS / 1000, Math.max(0, Math.ceil((otpSentAt + OTP_COOLDOWN_MS - Math.max(now, Date.now())) / 1000)));
  useEffect(() => {
    if (!otpSentAt || cooldownLeft <= 0) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [otpSentAt, cooldownLeft]);

  const inTransit = ['shipped', 'out_for_delivery'].includes(status);
  const trackingLink = useMemo(() => (isHttpsUrl(sd.trackingUrl) ? sd.trackingUrl : null), [sd.trackingUrl]);
  const setField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const run = async (key, request, successMessage) => {
    if (busy) return false;
    setBusy(key);
    try {
      await request();
      toast.success(successMessage);
      await onChanged?.();
      return true;
    } catch (err) {
      toast.error(apiError(err, 'Something went wrong. Please try again.'));
      return false;
    } finally {
      setBusy('');
    }
  };

  const ship = async (e) => {
    e.preventDefault();
    const found = validateSellerTracking(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    await run('ship', () => api.post(`${base}/ship`, form, { skipErrorToast: true }), 'Package marked shipped with your courier details.');
  };

  const saveTracking = async (e) => {
    e.preventDefault();
    const found = validateSellerTracking(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    const changes = Object.fromEntries(Object.entries(form).filter(([k, v]) => String(v || '').trim() !== String(sd[k] || '').trim()));
    if (!Object.keys(changes).length) {
      setEditing(false);
      return;
    }
    const ok = await run('tracking', () => api.patch(`${base}/tracking`, changes, { skipErrorToast: true }), 'Tracking details updated.');
    if (ok) setEditing(false);
  };

  const sendOtp = () => run('otp', () => api.post(`${base}/send-otp`, {}, { skipErrorToast: true }),
    'Delivery OTP sent. The customer can see it on their order tracking page.');

  const confirm = async (e) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(otp)) return toast.error('Enter the 4-digit delivery OTP from the customer.');
    const ok = await run('confirm', () => api.post(`${base}/confirm`, { otp }, { skipErrorToast: true }), 'Delivery confirmed.');
    if (ok) setOtp('');
    return ok;
  };

  return (
    <div className="mt-3.5 rounded-xl border border-amber-200 bg-amber-50/40 p-3.5 sm:p-4 text-left">
      <div className="flex items-center gap-2 pb-2.5 border-b border-amber-100">
        <span className="p-1.5 bg-amber-100 text-amber-800 rounded-lg"><FiPackage /></span>
        <div>
          <h4 className="text-xs sm:text-sm font-bold text-gray-900">Seller Delivery — your courier</h4>
          <p className="text-[11px] text-gray-600">No SafeFire rider is involved. The customer confirms delivery with an OTP.</p>
        </div>
      </div>

      {/* Before dispatch */}
      {['pending', 'processing', 'confirmed'].includes(status) && (
        <p className="mt-3 text-xs text-gray-600">Mark the order <strong>Ready for Pickup</strong>, then enter your courier and tracking details to ship it.</p>
      )}

      {status === 'ready_for_pickup' && (
        <form onSubmit={ship} className="mt-3 space-y-3" noValidate>
          <p className="text-xs text-gray-700">Enter the courier details for this package. The customer will see them on their tracking page.</p>
          <TrackingForm values={form} errors={errors} onChange={setField} disabled={Boolean(busy)} />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={Boolean(busy)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white rounded-xl text-xs font-bold shadow-md shadow-primary-500/20 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <FiTruck /> {busy === 'ship' ? 'Shipping…' : 'Mark Shipped'}
            </button>
          </div>
        </form>
      )}

      {/* Saved courier details */}
      {(inTransit || status === 'delivered') && sd.courierName && !editing && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div><span className="text-gray-500">Courier:</span> <span className="font-semibold text-gray-900">{sd.courierName}</span></div>
          <div><span className="text-gray-500">Tracking no.:</span> <span className="font-mono font-semibold text-gray-900 break-all">{sd.trackingNumber}</span></div>
          {trackingLink && (
            <div className="sm:col-span-2">
              <a href={trackingLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary-600 hover:underline break-all">
                Open tracking link <FiExternalLink />
              </a>
            </div>
          )}
          {(sd.deliveryPersonName || sd.deliveryPersonPhone) && (
            <div className="sm:col-span-2"><span className="text-gray-500">Delivery person:</span> <span className="font-semibold text-gray-900">{[sd.deliveryPersonName, sd.deliveryPersonPhone].filter(Boolean).join(' · ')}</span></div>
          )}
          <div><span className="text-gray-500">Shipped:</span> <span className="font-semibold text-gray-900">{formatDateTime(sd.shippedAt)}</span></div>
          {sd.lastUpdatedAt && sd.trackingUpdates?.length > 0 && (
            <div><span className="text-gray-500">Last updated:</span> <span className="font-semibold text-gray-900">{formatDateTime(sd.lastUpdatedAt)}</span></div>
          )}
        </div>
      )}

      {/* In transit: edit tracking, send OTP, confirm */}
      {inTransit && (
        <div className="mt-3 space-y-3">
          {editing ? (
            <form onSubmit={saveTracking} className="space-y-3" noValidate>
              <TrackingForm values={form} errors={errors} onChange={setField} disabled={Boolean(busy)} />
              <div className="flex justify-end gap-2">
                <button type="button" disabled={Boolean(busy)} onClick={() => { setEditing(false); setForm(emptyForm(sd)); setErrors({}); }}
                  className="px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 rounded-xl text-xs font-semibold">
                  Cancel
                </button>
                <button type="submit" disabled={Boolean(busy)}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-bold disabled:opacity-60 disabled:cursor-not-allowed">
                  {busy === 'tracking' ? 'Saving…' : 'Save tracking'}
                </button>
              </div>
            </form>
          ) : (
            <div className="flex justify-end">
              <button type="button" onClick={() => setEditing(true)} disabled={Boolean(busy)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 rounded-lg border border-gray-300 disabled:opacity-60">
                <FiEdit2 /> Update tracking
              </button>
            </div>
          )}

          <div className="p-3 rounded-lg border border-primary-100 bg-white">
            <p className="text-xs font-bold text-gray-900 flex items-center gap-1.5"><FiKey /> Confirm delivery with the customer OTP</p>
            <p className="text-[11px] text-gray-600 mt-1">
              When the package is about to reach the customer, send the OTP. The customer sees it on their order tracking page and shares it with
              the delivery person after receiving the package. The OTP expires in 10 minutes.
            </p>
            <div className="mt-2.5 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={sendOtp}
                disabled={Boolean(busy) || cooldownLeft > 0}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-200 rounded-lg disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <FiSend />
                {busy === 'otp' ? 'Sending…' : cooldownLeft > 0 ? `Resend in ${cooldownLeft}s` : otpSentAt ? 'Resend delivery OTP' : 'Send delivery OTP'}
              </button>
              {otpSentAt > 0 && (
                <form onSubmit={confirm} className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    aria-label="Customer delivery OTP"
                    maxLength={4}
                    value={otp}
                    disabled={Boolean(busy)}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="4-digit OTP"
                    className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm text-center font-mono font-bold tracking-widest focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  />
                  <button
                    type="submit"
                    disabled={Boolean(busy) || otp.length !== 4}
                    className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-xl text-xs font-bold active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {busy === 'confirm' ? 'Confirming…' : 'Confirm delivery'}
                  </button>
                </form>
              )}
            </div>
            {otpSentAt > 0 && (
              <p className="text-[11px] text-gray-500 mt-2">OTP last sent {formatDateTime(shipment.deliveryOtpSentAt)}. If it expired, resend it.</p>
            )}
          </div>
        </div>
      )}

      {status === 'delivered' && (
        <div className="mt-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-start gap-2">
          <FiCheckCircle className="mt-0.5 flex-shrink-0" />
          <p>
            Delivered {formatDateTime(shipment.deliveredAt)}
            {shipment.deliveryConfirmation?.method === 'CUSTOMER_OTP' && ' — confirmed with the customer OTP.'}
            {shipment.deliveryConfirmation?.method === 'ADMIN_OVERRIDE' && ' — confirmed by Admin.'}
            {' '}Your earnings follow the normal return-window hold.
          </p>
        </div>
      )}

      {['cancelled', 'failed', 'returned'].includes(status) && (
        <div className="mt-3 p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700 flex items-start gap-2">
          <FiAlertCircle className="mt-0.5 flex-shrink-0" />
          <p>This package is {status}. No further delivery actions are available.</p>
        </div>
      )}
    </div>
  );
};

export default SellerDeliveryPanel;
