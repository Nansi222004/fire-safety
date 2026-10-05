import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FiPlus } from 'react-icons/fi';
import api from '../../../../shared/utils/api';
import { ConditionBadge, IssueStatusBadge } from '../../../../shared/components/FireSafety/FsBadge';
import { EQUIPMENT_TYPE_LABELS, CONDITION_LABELS, formatFsDate, formatFsLocation } from '../../../../shared/constants/fireSafety';
import { PageHeader, Card, Modal, Field, EmptyRow, CustomerPicker, inputClass, btnPrimary } from './FsShared';

const emptyForm = {
  equipmentType: 'fire_extinguisher', name: '', addressId: '',
  location: { label: '', address: '', city: '', state: '', zipCode: '' },
  details: { brand: '', model: '', capacity: '', serialNumber: '', placement: '', installedOn: '', expiresOn: '' },
};

const FsEquipment = () => {
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', type: '' });
  const [filterCustomer, setFilterCustomer] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);

  const fetchEquipment = useCallback(() => {
    setLoading(true);
    const params = { ...(filters.status && { status: filters.status }), ...(filters.type && { type: filters.type }), ...(filterCustomer && { userId: filterCustomer._id }) };
    api.get('/admin/fire-safety/equipment', { params })
      .then((d) => setEquipment(d?.equipment || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filters, filterCustomer]);

  useEffect(() => { fetchEquipment(); }, [fetchEquipment]);

  useEffect(() => {
    setAddresses([]);
    if (!customer) return;
    api.get(`/admin/fire-safety/customers/${customer._id}/addresses`).then((d) => setAddresses(d?.addresses || [])).catch(() => {});
  }, [customer]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!customer) return toast.error('Select a customer.');
    setSaving(true);
    try {
      await api.post('/admin/fire-safety/equipment', {
        userId: customer._id,
        equipmentType: form.equipmentType,
        name: form.name,
        ...(form.addressId ? { addressId: form.addressId, location: { label: form.location.label } } : { location: form.location }),
        details: form.details,
      });
      toast.success('Equipment added.');
      setShowCreate(false);
      setForm(emptyForm);
      fetchEquipment();
    } catch { /* toast shown */ } finally { setSaving(false); }
  };

  const openDetail = async (id) => {
    try { setDetail(await api.get(`/admin/fire-safety/equipment/${id}`)); } catch { /* toast shown */ }
  };

  const setLoc = (key) => (e) => setForm((f) => ({ ...f, location: { ...f.location, [key]: e.target.value } }));
  const setDet = (key) => (e) => setForm((f) => ({ ...f, details: { ...f.details, [key]: e.target.value } }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Equipment"
        subtitle="Fire-safety equipment installed at customer sites (separate from product orders)."
        action={<button type="button" className={btnPrimary} onClick={() => { setCustomer(null); setForm(emptyForm); setShowCreate(true); }}><FiPlus /> Add Equipment</button>}
      />
      <Card>
        <div className="grid sm:grid-cols-3 gap-3 mb-4">
          <CustomerPicker value={filterCustomer} onChange={setFilterCustomer} />
          <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} className={inputClass}>
            <option value="">All types</option>
            {Object.entries(EQUIPMENT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className={inputClass}>
            <option value="">All statuses</option>
            {Object.entries(CONDITION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                <th className="py-3 pr-3">Equipment</th><th className="py-3 px-3">Customer</th><th className="py-3 px-3">Location</th>
                <th className="py-3 px-3">Status</th><th className="py-3 pl-3">Last Inspection</th>
              </tr>
            </thead>
            <tbody>
              {equipment.length === 0 ? <EmptyRow loading={loading} colSpan={5} text="No equipment recorded." /> : equipment.map((e) => (
                <tr key={e._id} onClick={() => openDetail(e._id)} className="border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50">
                  <td className="py-3 pr-3"><p className="font-semibold text-gray-800">{e.name}</p><p className="text-xs text-gray-500">{EQUIPMENT_TYPE_LABELS[e.equipmentType]}</p></td>
                  <td className="py-3 px-3">{e.userId?.name}</td>
                  <td className="py-3 px-3 text-xs text-gray-600 max-w-[240px] truncate">{formatFsLocation(e.location)}</td>
                  <td className="py-3 px-3"><ConditionBadge value={e.currentStatus} /></td>
                  <td className="py-3 pl-3 text-xs text-gray-500">{formatFsDate(e.lastInspectedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {showCreate && (
        <Modal wide title="Add Customer Equipment" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <Field label="Customer *"><CustomerPicker value={customer} onChange={setCustomer} /></Field>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Equipment type *">
                <select value={form.equipmentType} onChange={(e) => setForm({ ...form, equipmentType: e.target.value })} className={inputClass}>
                  {Object.entries(EQUIPMENT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
              <Field label="Name *"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="5 KG Fire Extinguisher" className={inputClass} /></Field>
            </div>
            <Field label="Location">
              <select value={form.addressId} onChange={(e) => setForm({ ...form, addressId: e.target.value })} className={inputClass} disabled={!customer}>
                <option value="">Enter a site address manually</option>
                {addresses.map((a) => <option key={a._id} value={a._id}>{a.name} — {a.address}, {a.city}</option>)}
              </select>
            </Field>
            <Field label="Site label"><input value={form.location.label} onChange={setLoc('label')} placeholder="ABC Industries – Plant 1" className={inputClass} /></Field>
            {!form.addressId && (
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Address *"><input required value={form.location.address} onChange={setLoc('address')} className={inputClass} /></Field>
                <Field label="City *"><input required value={form.location.city} onChange={setLoc('city')} className={inputClass} /></Field>
                <Field label="State"><input value={form.location.state} onChange={setLoc('state')} className={inputClass} /></Field>
                <Field label="PIN code"><input value={form.location.zipCode} onChange={setLoc('zipCode')} className={inputClass} /></Field>
              </div>
            )}
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Brand"><input value={form.details.brand} onChange={setDet('brand')} className={inputClass} /></Field>
              <Field label="Model"><input value={form.details.model} onChange={setDet('model')} className={inputClass} /></Field>
              <Field label="Capacity"><input value={form.details.capacity} onChange={setDet('capacity')} placeholder="5 KG" className={inputClass} /></Field>
              <Field label="Serial number"><input value={form.details.serialNumber} onChange={setDet('serialNumber')} className={inputClass} /></Field>
              <Field label="Installed on"><input type="date" value={form.details.installedOn} onChange={setDet('installedOn')} className={inputClass} /></Field>
              <Field label="Expires on"><input type="date" value={form.details.expiresOn} onChange={setDet('expiresOn')} className={inputClass} /></Field>
            </div>
            <Field label="Placement"><input value={form.details.placement} onChange={setDet('placement')} placeholder="Ground floor, near exit" className={inputClass} /></Field>
            <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Saving…' : 'Add Equipment'}</button>
          </form>
        </Modal>
      )}

      {detail && (
        <Modal wide title={detail.equipment.name} onClose={() => setDetail(null)}>
          <div className="text-sm text-gray-700 space-y-1">
            <p>{EQUIPMENT_TYPE_LABELS[detail.equipment.equipmentType]} · <ConditionBadge value={detail.equipment.currentStatus} /></p>
            <p>Customer: {detail.equipment.userId?.name} ({detail.equipment.userId?.email})</p>
            <p>Location: {formatFsLocation(detail.equipment.location)}</p>
          </div>
          <h4 className="font-bold text-gray-800">Inspection history</h4>
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {detail.history.length === 0 && <li className="p-3 text-sm text-gray-500">No inspections yet.</li>}
            {detail.history.map((h) => (
              <li key={h.reportId} className="p-3 text-sm space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span>{formatFsDate(h.inspectedAt, true)} · {h.reportNumber} · {h.worker?.name}</span>
                  <ConditionBadge value={h.condition} />
                </div>
                {h.observations && <p className="text-xs text-gray-500">{h.observations}</p>}
                {h.photos.length > 0 && <div className="flex gap-2">{h.photos.map((p) => <a key={p} href={p} target="_blank" rel="noreferrer"><img src={p} alt="" className="w-12 h-12 rounded object-cover" /></a>)}</div>}
              </li>
            ))}
          </ul>
          <h4 className="font-bold text-gray-800">Issues</h4>
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {detail.issues.length === 0 && <li className="p-3 text-sm text-gray-500">No issues.</li>}
            {detail.issues.map((i) => (
              <li key={i._id} className="p-3 text-sm flex items-center justify-between gap-2"><span>{i.issueNumber} · {i.title}</span><IssueStatusBadge value={i.status} /></li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
};

export default FsEquipment;
