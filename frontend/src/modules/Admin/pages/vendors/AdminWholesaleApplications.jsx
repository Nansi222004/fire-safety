import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { FiSearch, FiCheckCircle, FiXCircle, FiBriefcase } from 'react-icons/fi';
import api from '../../../../shared/utils/api';

const STATUS_TABS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];

const STATUS_TONES = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
};

const capabilityLabels = (vendor) => {
  const caps = vendor?.vendorCapabilities || {};
  const labels = [];
  if (caps.sellsProducts) labels.push('B2C Products');
  if (caps.providesServices && vendor?.serviceCapability?.status === 'approved') labels.push('Services');
  if (caps.wholesaleEnabled) labels.push('Wholesale');
  return labels;
};

const AdminWholesaleApplications = () => {
  const [vendors, setVendors] = useState([]);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [statusFilter, setStatusFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    try {
      const params = { status: statusFilter };
      if (search.trim()) params.search = search.trim();
      const data = await api.get('/admin/wholesale/applications', { params });
      setVendors(Array.isArray(data?.vendors) ? data.vendors : []);
      if (data?.stats) setStats(data.stats);
    } catch (err) {
      toast.error(err.message || 'Failed to fetch wholesale applications.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    const handle = setTimeout(fetchApplications, 250);
    return () => clearTimeout(handle);
  }, [fetchApplications]);

  const handleApprove = async (vendor) => {
    setActingId(vendor._id);
    try {
      await api.post(`/admin/wholesale/applications/${vendor._id}/approve`);
      toast.success(`Wholesale capability enabled for ${vendor.storeName || vendor.name}.`);
      fetchApplications();
    } catch (err) {
      toast.error(err.message || 'Failed to approve.');
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    if (rejectReason.trim().length < 5) {
      toast.error('Please provide a reason (at least 5 characters).');
      return;
    }
    setActingId(rejectTarget._id);
    try {
      await api.post(`/admin/wholesale/applications/${rejectTarget._id}/reject`, { reason: rejectReason.trim() });
      toast.success(rejectTarget.wholesaleCapability?.status === 'approved' ? 'Wholesale capability revoked.' : 'Application rejected.');
      setRejectTarget(null);
      setRejectReason('');
      fetchApplications();
    } catch (err) {
      toast.error(err.message || 'Failed to update.');
    } finally {
      setActingId(null);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <FiBriefcase className="text-sky-600" /> Wholesale / B2B Applications
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Approve vendors for the Wholesale/B2B capability. This is independent of product and service capabilities.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {['pending', 'approved', 'rejected'].map((key) => (
          <div key={key} className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">{key}</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{stats[key] ?? 0}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStatusFilter(tab.value)}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold ${
                  statusFilter === tab.value ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {tab.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vendor, store or email..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500 py-8 text-center">Loading…</p>
        ) : vendors.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">No wholesale applications found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <th className="py-3 pr-3">Vendor</th>
                  <th className="py-3 px-3">Business Details</th>
                  <th className="py-3 px-3">Current Capabilities</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 pl-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((vendor) => {
                  const wc = vendor.wholesaleCapability || {};
                  const details = wc.businessDetails || {};
                  const status = wc.status || 'none';
                  return (
                    <tr key={vendor._id} className="border-b border-gray-100 last:border-0 align-top">
                      <td className="py-3 pr-3 min-w-[180px]">
                        <p className="font-semibold text-gray-800">{vendor.storeName || vendor.name}</p>
                        <p className="text-xs text-gray-500">{vendor.email}</p>
                        {vendor.status !== 'approved' && (
                          <p className="text-[11px] text-amber-600 mt-1">Vendor account: {vendor.status}</p>
                        )}
                      </td>
                      <td className="py-3 px-3 min-w-[220px] text-xs text-gray-600 space-y-0.5">
                        {details.businessType && <p><span className="font-semibold">Type:</span> {details.businessType}</p>}
                        {details.gstNumber && <p><span className="font-semibold">GST:</span> {details.gstNumber}</p>}
                        {details.expectedMonthlyVolume && <p><span className="font-semibold">Volume:</span> {details.expectedMonthlyVolume}</p>}
                        {details.description && <p className="text-gray-500 line-clamp-3">{details.description}</p>}
                        {wc.appliedAt && <p className="text-gray-400">Applied {new Date(wc.appliedAt).toLocaleDateString('en-IN')}</p>}
                        {status === 'rejected' && wc.rejectionReason && <p className="text-red-600">Reason: {wc.rejectionReason}</p>}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1">
                          {capabilityLabels(vendor).map((label) => (
                            <span key={label} className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-700">{label}</span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold border capitalize ${STATUS_TONES[status] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                          {status}
                        </span>
                      </td>
                      <td className="py-3 pl-3 text-right whitespace-nowrap">
                        {status !== 'approved' && (
                          <button
                            type="button"
                            disabled={actingId === vendor._id || vendor.status !== 'approved'}
                            onClick={() => handleApprove(vendor)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 mr-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold">
                            <FiCheckCircle /> Approve
                          </button>
                        )}
                        {status !== 'rejected' && (
                          <button
                            type="button"
                            disabled={actingId === vendor._id}
                            onClick={() => { setRejectTarget(vendor); setRejectReason(''); }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-semibold">
                            <FiXCircle /> {status === 'approved' ? 'Revoke' : 'Reject'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {rejectTarget && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setRejectTarget(null)} />
          <div className="relative bg-white rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-gray-800">
              {rejectTarget.wholesaleCapability?.status === 'approved' ? 'Revoke wholesale capability' : 'Reject wholesale application'}
            </h3>
            <p className="text-sm text-gray-600">{rejectTarget.storeName || rejectTarget.name}</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Reason (shared with the vendor)"
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRejectTarget(null)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-semibold text-gray-700">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={actingId === rejectTarget._id}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-lg text-sm font-semibold">
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default AdminWholesaleApplications;
