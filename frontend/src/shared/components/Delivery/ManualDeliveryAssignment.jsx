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
  const isInternal = shipment?.deliveryMethod === 'INTERNAL' || shipment?.providerId === 'own_fleet';
  const alreadyAssigned = Boolean(shipment?.deliveryBoyId);

  useEffect(() => {
    if (!isInternal || (alreadyAssigned && actor !== 'admin')) return;
    const endpoint = actor === 'admin'
      ? '/admin/orders/delivery-partners/available'
      : '/vendor/delivery-partners/available';
    api.get(endpoint)
      .then((response) => setPartners(unwrapList(response)))
      .catch(() => setPartners([]));
  }, [actor, alreadyAssigned, isInternal]);

  if (!isInternal) return null;

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
