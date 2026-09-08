import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiSearch,
  FiEye,
  FiCheckCircle,
  FiXCircle,
  FiClock,
  FiShield,
  FiMapPin,
  FiAward,
  FiFileText,
  FiX,
  FiExternalLink,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../../../shared/utils/api';
import DataTable from '../../components/DataTable';
import Badge from '../../../../shared/components/Badge';
import ConfirmModal from '../../components/ConfirmModal';

const AdminServicePartnerApplications = () => {
  const [applications, setApplications] = useState([]);
  const [stats, setStats] = useState({ pending: 0, under_review: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [selectedApp, setSelectedApp] = useState(null); // Detail modal
  const [detailLoading, setDetailLoading] = useState(false);

  // Approve modal
  const [approveModal, setApproveModal] = useState({ isOpen: false, app: null, notes: '' });
  const [approving, setApproving] = useState(false);

  // Reject modal
  const [rejectModal, setRejectModal] = useState({ isOpen: false, app: null, reason: '', notes: '' });
  const [rejecting, setRejecting] = useState(false);

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await api.get('/admin/service-partner-applications', { params });
      const data = res?.data?.data || res?.data || {};
      setApplications(Array.isArray(data.applications) ? data.applications : []);
      if (data.stats) setStats(data.stats);
    } catch (err) {
      toast.error(err.message || 'Failed to fetch service applications.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const handleOpenDetail = async (appId) => {
    setDetailLoading(true);
    try {
      const res = await api.get(`/admin/service-partner-applications/${appId}`);
      const data = res?.data?.data || res?.data;
      setSelectedApp(data);
    } catch (err) {
      toast.error(err.message || 'Failed to load application details.');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!approveModal.app) return;
    setApproving(true);
    try {
      await api.post(`/admin/service-partner-applications/${approveModal.app._id}/approve`, {
        adminNotes: approveModal.notes,
      });
      toast.success('Service Partner application approved! Vendor service capability activated.');
      setApproveModal({ isOpen: false, app: null, notes: '' });
      setSelectedApp(null);
      fetchApplications();
    } catch (err) {
      toast.error(err.message || 'Failed to approve application.');
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!rejectModal.app) return;
    const reason = rejectModal.reason.trim();
    if (reason.length < 10) {
      toast.error('Rejection reason is mandatory and must be at least 10 characters.');
      return;
    }

    setRejecting(true);
    try {
      await api.post(`/admin/service-partner-applications/${rejectModal.app._id}/reject`, {
        reason,
        adminNotes: rejectModal.notes,
      });
      toast.success('Application rejected. Feedback dispatched to vendor.');
      setRejectModal({ isOpen: false, app: null, reason: '', notes: '' });
      setSelectedApp(null);
      fetchApplications();
    } catch (err) {
      toast.error(err.message || 'Failed to reject application.');
    } finally {
      setRejecting(false);
    }
  };

  const columns = [
    {
      key: 'vendor',
      label: 'Vendor / Store',
      render: (_, row) => {
        const vendor = row.vendorId || {};
        return (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-50 text-[#FF6A00] flex items-center justify-center font-bold text-sm border border-orange-100">
              🛠️
            </div>
            <div>
              <p className="font-bold text-slate-900 text-xs sm:text-sm">
                {vendor.storeName || vendor.name || 'Unknown Store'}
              </p>
              <p className="text-[11px] text-slate-500">{vendor.email || vendor.phone}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: 'categories',
      label: 'Requested Categories',
      render: (_, row) => {
        const cats = row.applicationData?.requestedServiceCategories || [];
        return (
          <div className="flex flex-wrap gap-1 max-w-xs">
            {cats.map((c, i) => (
              <span
                key={i}
                className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-medium text-[10px]"
              >
                {typeof c === 'object' ? c.name : 'Category'}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      key: 'experience',
      label: 'Experience',
      render: (_, row) => (
        <span className="font-medium text-xs text-slate-700">
          {row.applicationData?.serviceExperienceYears || 0} Years
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (value) => {
        const map = {
          pending: { label: 'Pending Review', variant: 'warning' },
          under_review: { label: 'Under Review', variant: 'warning' },
          approved: { label: 'Approved', variant: 'success' },
          rejected: { label: 'Action Required / Rejected', variant: 'error' },
        };
        const conf = map[value] || { label: value, variant: 'neutral' };
        return <Badge variant={conf.variant}>{conf.label}</Badge>;
      },
    },
    {
      key: 'appliedAt',
      label: 'Applied Date',
      render: (value, row) => (
        <span className="text-xs text-slate-500">
          {new Date(value || row.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOpenDetail(row._id)}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 transition-colors"
            title="Review Details"
          >
            <FiEye className="w-4 h-4" />
          </button>
          {['pending', 'under_review'].includes(row.status) && (
            <>
              <button
                onClick={() => setApproveModal({ isOpen: true, app: row, notes: '' })}
                className="p-1.5 hover:bg-emerald-50 rounded-lg text-emerald-600 transition-colors"
                title="Approve"
              >
                <FiCheckCircle className="w-4 h-4" />
              </button>
              <button
                onClick={() => setRejectModal({ isOpen: true, app: row, reason: '', notes: '' })}
                className="p-1.5 hover:bg-red-50 rounded-lg text-red-600 transition-colors"
                title="Reject"
              >
                <FiXCircle className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Service Partner Applications
          </h1>
          <p className="text-xs sm:text-sm text-slate-600">
            Review and qualify vendor service capabilities before activating marketplace access.
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Pending Review', count: stats.pending, color: 'text-amber-600 bg-amber-50 border-amber-200' },
          { label: 'Under Review', count: stats.under_review, color: 'text-blue-600 bg-blue-50 border-blue-200' },
          { label: 'Approved Partners', count: stats.approved, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
          { label: 'Rejected / Changes', count: stats.rejected, color: 'text-rose-600 bg-rose-50 border-rose-200' },
        ].map((s, idx) => (
          <div key={idx} className={`p-4 rounded-2xl border ${s.color}`}>
            <span className="text-[11px] font-bold uppercase tracking-wider block opacity-80">{s.label}</span>
            <span className="text-2xl font-black">{s.count || 0}</span>
          </div>
        ))}
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200">
        <div className="flex items-center gap-1 overflow-x-auto">
          {['all', 'pending', 'under_review', 'approved', 'rejected'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap capitalize ${
                statusFilter === status
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {status.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div className="relative min-w-[240px]">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search vendor or store..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <DataTable
          columns={columns}
          data={applications}
          loading={loading}
          emptyMessage="No service partner applications found."
        />
      </div>

      {/* Application Detail Modal */}
      <AnimatePresence>
        {selectedApp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 space-y-6 shadow-2xl"
            >
              <div className="flex items-start justify-between border-b pb-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Application Details
                  </span>
                  <h2 className="text-xl font-black text-slate-900">
                    {selectedApp.vendorId?.storeName || selectedApp.vendorId?.name}
                  </h2>
                  <p className="text-xs text-slate-500">{selectedApp.vendorId?.email} • {selectedApp.vendorId?.phone}</p>
                </div>
                <button
                  onClick={() => setSelectedApp(null)}
                  className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-700"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              {/* Status Banner */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Current Status</span>
                  <span className="font-bold text-slate-900 capitalize">{selectedApp.status.replace('_', ' ')}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Experience</span>
                  <span className="font-bold text-slate-900">{selectedApp.applicationData?.serviceExperienceYears} Years</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Submitted</span>
                  <span className="font-bold text-slate-900">
                    {new Date(selectedApp.appliedAt || selectedApp.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Rejection reason if any */}
              {selectedApp.rejectionReason && (
                <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-800">
                  <span className="font-bold block mb-1">Previous Rejection Reason:</span>
                  {selectedApp.rejectionReason}
                </div>
              )}

              {/* Business Description */}
              <div className="space-y-1">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Business Description
                </h4>
                <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  {selectedApp.applicationData?.businessDescription}
                </p>
              </div>

              {/* Requested Categories */}
              <div className="space-y-1">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Requested Master Categories
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {(selectedApp.applicationData?.requestedServiceCategories || []).map((cat, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1 bg-slate-100 text-slate-800 rounded-xl font-bold text-xs"
                    >
                      {typeof cat === 'object' ? cat.name : 'Category'}
                    </span>
                  ))}
                </div>
              </div>

              {/* Service Areas */}
              <div className="space-y-1">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Service Area Pincodes
                </h4>
                <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  {(selectedApp.applicationData?.requestedServiceAreas || []).join(', ')}
                </p>
              </div>

              {/* Certifications */}
              {Array.isArray(selectedApp.applicationData?.certifications) &&
                selectedApp.applicationData.certifications.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Certifications
                    </h4>
                    <div className="space-y-2">
                      {selectedApp.applicationData.certifications.map((c, idx) => (
                        <div key={idx} className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs">
                          <span className="font-bold text-slate-900 block">{c.name}</span>
                          <span className="text-slate-500 block">
                            Issuer: {c.issuer || 'N/A'} • #{c.certificateNumber || 'N/A'}
                            {c.expiryDate && ` • Expires: ${new Date(c.expiryDate).toLocaleDateString()}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Documents */}
              {Array.isArray(selectedApp.documents) && selectedApp.documents.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Uploaded Verification Documents
                  </h4>
                  <div className="space-y-2">
                    {selectedApp.documents.map((d, idx) => (
                      <a
                        key={idx}
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-xs text-blue-600 font-medium"
                      >
                        <div className="flex items-center gap-2">
                          <FiFileText className="text-slate-500" />
                          <span>{d.name || 'Document'}</span>
                        </div>
                        <FiExternalLink />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer Actions */}
              {['pending', 'under_review'].includes(selectedApp.status) && (
                <div className="flex items-center justify-end gap-3 border-t pt-4">
                  <button
                    onClick={() => {
                      setRejectModal({ isOpen: true, app: selectedApp, reason: '', notes: '' });
                    }}
                    className="px-5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl transition-colors"
                  >
                    Reject Application
                  </button>
                  <button
                    onClick={() => {
                      setApproveModal({ isOpen: true, app: selectedApp, notes: '' });
                    }}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors shadow-sm shadow-emerald-600/20"
                  >
                    Approve Application
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Approve Confirmation Modal */}
      <ConfirmModal
        isOpen={approveModal.isOpen}
        onClose={() => setApproveModal({ isOpen: false, app: null, notes: '' })}
        onConfirm={handleApprove}
        title="Approve Service Partner Application"
        message={`Are you sure you want to approve "${approveModal.app?.vendorId?.storeName || 'this vendor'}" as an official SafeFire Service Partner? This will atomically activate their service capability and allow them to configure service offerings.`}
        confirmText={approving ? 'Approving...' : 'Approve Application'}
        type="success"
      />

      {/* Reject with Reason Modal */}
      <AnimatePresence>
        {rejectModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="font-bold text-slate-900 text-base">Reject Service Application</h3>
                <button
                  onClick={() => setRejectModal({ isOpen: false, app: null, reason: '', notes: '' })}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <FiX />
                </button>
              </div>

              <p className="text-xs text-slate-600">
                Provide a clear reason for rejecting the application. This feedback will be sent directly to the vendor so they can make required adjustments and resubmit.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows="3"
                  value={rejectModal.reason}
                  onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
                  placeholder="Explain why this application cannot be approved (minimum 10 characters)..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <span className="text-[10px] text-slate-400">
                  {rejectModal.reason.length} / 10 min characters
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Internal Admin Notes (Optional)
                </label>
                <input
                  type="text"
                  value={rejectModal.notes}
                  onChange={(e) => setRejectModal({ ...rejectModal, notes: e.target.value })}
                  placeholder="Notes for internal review history..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setRejectModal({ isOpen: false, app: null, reason: '', notes: '' })}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={rejecting}
                  className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50"
                >
                  {rejecting ? 'Rejecting...' : 'Reject Application'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminServicePartnerApplications;
