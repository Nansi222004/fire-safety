import { FiExternalLink, FiTruck, FiPackage, FiShield, FiCheckCircle } from 'react-icons/fi';

const isHttpsUrl = (value) => {
  try {
    return new URL(String(value || '')).protocol === 'https:';
  } catch {
    return false;
  }
};

const formatDateTime = (value) => (value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : null);

const CONFIRMATION_LABELS = {
  CUSTOMER_OTP: 'Confirmed with your delivery OTP',
  RIDER_OTP: 'Confirmed with your delivery OTP',
  COURIER_WEBHOOK: 'Confirmed by the courier',
  ADMIN_OVERRIDE: 'Confirmed by SafeFire support',
};

const METHOD_ICONS = { SELLER_DELIVERY: FiPackage, SHIPROCKET: FiTruck, INTERNAL: FiShield };

/**
 * Normalized tracking view for one package. Reads `shipment.tracking` (built by the API for every delivery
 * method) and falls back to the legacy courier fields for older responses.
 */
export const getShipmentTracking = (shipment) => {
  if (!shipment) return null;
  if (shipment.tracking) return shipment.tracking;
  if (!shipment.awbCode && !shipment.trackingUrl) return null;
  return {
    method: shipment.providerId === 'shiprocket' ? 'SHIPROCKET' : null,
    methodLabel: shipment.providerId === 'shiprocket' ? 'Shiprocket courier' : 'Courier',
    courierName: shipment.courierName || null,
    trackingNumber: shipment.awbCode || null,
    trackingUrl: isHttpsUrl(shipment.trackingUrl) ? shipment.trackingUrl : null,
    deliveredAt: shipment.deliveredAt || null,
  };
};

/** Whether there is anything worth showing beyond the status timeline. */
export const hasTrackingDetails = (shipment) => {
  const t = getShipmentTracking(shipment);
  return Boolean(t && (t.method || t.trackingNumber || t.courierName));
};

const ShipmentTrackingDetails = ({ shipment, compact = false, hideDeliveryPerson = false }) => {
  const t = getShipmentTracking(shipment);
  if (!t || (!t.method && !t.trackingNumber)) return null;
  const Icon = METHOD_ICONS[t.method] || FiTruck;
  const link = isHttpsUrl(t.trackingUrl) ? t.trackingUrl : null;
  const shippedAt = formatDateTime(t.shippedAt);
  const deliveredAt = formatDateTime(t.deliveredAt);
  const isSeller = t.method === 'SELLER_DELIVERY';

  return (
    <div className={`${compact ? '' : 'mt-3 pt-3 border-t border-gray-100'} space-y-2`}>
      <div className="flex items-center gap-2">
        <span className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${isSeller ? 'bg-amber-50 text-amber-700' : 'bg-primary-50 text-primary-700'}`}>
          <Icon className="text-sm" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Delivery method</p>
          <p className="text-sm font-bold text-gray-800 truncate">
            {isSeller ? (t.courierName ? `Delivered by seller via ${t.courierName}` : 'Delivered by seller') : (t.label || t.methodLabel)}
          </p>
        </div>
      </div>

      {(t.trackingNumber || link) && (
        <div className="flex items-center justify-between gap-3">
          {t.trackingNumber && (
            <div className="min-w-0">
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-0.5">
                {t.method === 'SHIPROCKET' ? 'Tracking AWB' : 'Tracking number'}
                {t.courierName && !isSeller ? ` · ${t.courierName}` : ''}
              </p>
              <p className="text-sm font-mono font-bold text-gray-800 break-all">{t.trackingNumber}</p>
            </div>
          )}
          {link && (
            <a href={link} target="_blank" rel="noopener noreferrer"
              className="text-xs font-bold text-primary-600 bg-primary-50 px-3 py-1.5 rounded-lg border border-primary-100 flex items-center gap-1 flex-shrink-0">
              Track Package <FiExternalLink />
            </a>
          )}
        </div>
      )}

      {!hideDeliveryPerson && t.deliveryPerson && (t.deliveryPerson.name || t.deliveryPerson.phone) && (
        <div>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-0.5">Delivery person</p>
          <p className="text-sm font-semibold text-gray-800">
            {t.deliveryPerson.name}
            {t.deliveryPerson.phone && (
              <a href={`tel:${t.deliveryPerson.phone}`} className="ml-2 text-xs text-primary-600 hover:underline">{t.deliveryPerson.phone}</a>
            )}
          </p>
        </div>
      )}

      {(shippedAt || deliveredAt) && (
        <p className="text-[11px] text-gray-500">
          {shippedAt && <>Shipped {shippedAt}</>}
          {shippedAt && deliveredAt && ' · '}
          {deliveredAt && <>Delivered {deliveredAt}</>}
        </p>
      )}

      {t.confirmationMethod && CONFIRMATION_LABELS[t.confirmationMethod] && (
        <p className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
          <FiCheckCircle /> {CONFIRMATION_LABELS[t.confirmationMethod]}
        </p>
      )}
    </div>
  );
};

export default ShipmentTrackingDetails;
