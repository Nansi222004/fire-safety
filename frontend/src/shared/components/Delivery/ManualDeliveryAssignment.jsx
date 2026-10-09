import { useEffect, useState } from 'react';
import api from '../../utils/api';
import toast from 'react-hot-toast';

const unwrapList = (response) => {
  const payload = response?.data ?? response;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.deliveryBoys)) return payload.deliveryBoys;
  return [];
};

const ManualDeliveryAssignment = ({ shipment, orderId, actor, onAssigned }) => {
  const [partners, setPartners] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [reassign, setReassign] = useState(false);
  const [loading, setLoading] = useState(false);
  // Manual Delivery shipments (plus legacy own-fleet shipments and admin override on open shipments).
  const isLegacyOwnFleet = !shipment?.deliveryMethod && !shipment?.allowedDeliveryMethods?.length && shipment?.providerId === 'own_fleet';
  const isInternal = shipment?.deliveryMethod === 'INTERNAL' || isLegacyOwnFleet || (actor === 'admin' && shipment?.providerId !== 'shiprocket');
  const isClosed = ['delivered', 'cancelled', 'returned', 'failed', 'return_initiated'].includes(shipment?.status);
  const alreadyAssigned = Boolean(shipment?.deliveryBoyId);

  useEffect(() => {
    if (!isInternal || isClosed || (alreadyAssigned && actor !== 'admin')) return;
    const endpoint = actor === 'admin'
      ? '/admin/orders/delivery-partners/available'
      : '/vendor/delivery-partners/available';
    // Shipment-specific eligibility (capacity + COD limit) — same rules the assign API enforces.
    api.get(endpoint, { params: { shipmentId: shipment?._id } })
      .then((response) => setPartners(unwrapList(response)))
      .catch(() => setPartners([]));
  }, [actor, alreadyAssigned, isInternal, isClosed, shipment?._id]);

  if (!isInternal || isClosed) return null;

  const assign = async () => {
    if (!selectedId) return toast.error('Select a delivery partner');
    if (alreadyAssigned && actor === 'admin' && !reassign) {
      return toast.error('Enable explicit reassignment before changing the partner');
    }
    setLoading(true);
    try {
      const base = actor === 'admin' ? '/admin' : '/vendor';
      await api.post(`${base}/orders/${orderId}/shipments/${shipment._id}/assign-delivery`, {
        deliveryBoyId: selectedId,
        ...(actor === 'admin' ? { reassign } : {}),
      });
      toast.success(alreadyAssigned ? 'Delivery partner reassigned' : 'Delivery partner assigned');
      setSelectedId('');
      setReassign(false);
      onAssigned?.();
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Assignment failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-left">
      <p className="text-xs font-bold text-amber-900">Delivery Method: Internal / Manual Delivery</p>
      <p className="mt-1 text-xs text-amber-800">
        <span className="font-semibold">Reason:</span>{' '}
        {shipment.deliveryRoutingDetails || shipment.deliveryRoutingReason?.replaceAll('_', ' ') || 'Manual handling required.'}
      </p>

      {(!alreadyAssigned || actor === 'admin') && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs"
          >
            <option value="">Select available delivery partner</option>
            {partners.map((partner) => (
              <option key={partner._id} value={partner._id}>
                {partner.name} — {partner.vehicleType || 'vehicle'} {partner.vehicleNumber ? `(${partner.vehicleNumber})` : ''}
                {typeof partner.activeShipments === 'number' ? ` · ${partner.activeShipments}/${partner.maxActiveOrders ?? 3} active` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={assign}
            disabled={loading || !selectedId || (alreadyAssigned && actor === 'admin' && !reassign)}
            className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {loading ? 'Assigning…' : alreadyAssigned ? 'Reassign' : 'Assign'}
          </button>
        </div>
      )}

      {(!alreadyAssigned || actor === 'admin') && partners.length === 0 && (
        <p className="mt-2 text-[11px] text-amber-700">
          No eligible delivery partners right now (partners must be online, under their active-delivery limit, and within the COD cash limit).
        </p>
      )}

      {alreadyAssigned && actor === 'admin' && (
        <label className="mt-2 flex items-center gap-2 text-xs font-medium text-amber-900">
          <input type="checkbox" checked={reassign} onChange={(event) => setReassign(event.target.checked)} />
          Explicitly authorize reassignment from {shipment.deliveryBoyId?.name || 'current partner'}
        </label>
      )}
      {alreadyAssigned && actor === 'vendor' && (
        <p className="mt-2 text-[11px] text-amber-700">Already assigned. Admin must explicitly authorize any reassignment.</p>
      )}
    </div>
  );
};

export default ManualDeliveryAssignment;
