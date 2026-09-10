import { useState, useEffect, useCallback } from 'react';
import { FiSearch, FiEye, FiX, FiBriefcase, FiPhone, FiMail, FiCalendar, FiClock, FiCheckCircle } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import DataTable from '../../components/DataTable';
import Badge from '../../../../shared/components/Badge';
import {
  getCollaborationInquiries,
  updateCollaborationInquiryStatus,
} from '../../services/adminService';
import { formatDateTime } from '../../utils/adminHelpers';

const statusVariants = {
  new: 'info',
  in_review: 'warning',
  contacted: 'success',
  closed: 'default',
};

const statusLabels = {
  new: 'New',
  in_review: 'In Review',
  contacted: 'Contacted',
  closed: 'Closed',
};

const CollaborationInquiries = () => {
  const [inquiries, setInquiries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedInquiry, setSelectedInquiry] = useState(null);
  const [updateStatus, setUpdateStatus] = useState('new');
  const [adminNotes, setAdminNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const fetchInquiries = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (typeFilter !== 'all') params.collaborationType = typeFilter;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await getCollaborationInquiries(params);
      const data = res?.data?.data?.inquiries || res?.data?.inquiries || res?.data?.data || res?.data || [];
      setInquiries(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to fetch collaboration inquiries');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, typeFilter, searchQuery]);

  useEffect(() => {
    fetchInquiries();
  }, [fetchInquiries]);

  const handleOpenDetail = (inquiry) => {
    setSelectedInquiry(inquiry);
    setUpdateStatus(inquiry.status || 'new');
    setAdminNotes(inquiry.adminNotes || '');
  };

  const handleCloseDetail = () => {
    setSelectedInquiry(null);
    setUpdateStatus('new');
    setAdminNotes('');
  };

  const handleUpdateStatus = async (e) => {
    e.preventDefault();
    if (!selectedInquiry) return;

    setIsSaving(true);
    try {
      await updateCollaborationInquiryStatus(selectedInquiry._id, {
        status: updateStatus,
        adminNotes,
      });
      toast.success(`Inquiry marked as ${statusLabels[updateStatus] || updateStatus}`);
      handleCloseDetail();
      fetchInquiries();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update inquiry status');
    } finally {
      setIsSaving(false);
    }
  };

  const columns = [
    {
      key: 'createdAt',
      label: 'Date',
      render: (val) => (
        <span className="text-xs text-gray-500 font-mono">
          {formatDateTime ? formatDateTime(val) : new Date(val).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'name',
      label: 'Requester',
      render: (_, row) => (
        <div>
          <p className="font-bold text-gray-900 text-sm">{row.name}</p>
          <div className="flex flex-col text-xs text-gray-500 gap-0.5 mt-0.5">
            <span className="flex items-center gap-1"><FiMail className="text-gray-400" /> {row.email}</span>
            <span className="flex items-center gap-1"><FiPhone className="text-gray-400" /> {row.phone}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'companyName',
      label: 'Company / Org',
      render: (val) => <span className="font-semibold text-gray-800 text-sm">{val}</span>,
    },
    {
      key: 'collaborationType',
      label: 'Type',
      render: (val) => (
        <span className="inline-block px-2.5 py-1 bg-purple-50 text-purple-700 rounded-full text-xs font-semibold">
          {val}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (val) => (
        <Badge variant={statusVariants[val] || 'default'}>
          {statusLabels[val] || val}
        </Badge>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (_, row) => (
        <button
          type="button"
          onClick={() => handleOpenDetail(row)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200"
        >
          <FiEye className="text-sm" /> View & Review
        </button>
      ),
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FiBriefcase className="text-purple-600" />
            Collaboration Requests
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Review and manage public B2B and institutional partnership proposals
          </p>
        </div>
        <button
          type="button"
          onClick={fetchInquiries}
          className="px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors shadow-sm self-start sm:self-auto"
        >
          Refresh
        </button>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-80">
          <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search name, company, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="new">New</option>
            <option value="in_review">In Review</option>
            <option value="contacted">Contacted</option>
            <option value="closed">Closed</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Types</option>
            <option value="Business Partnership">Business Partnership</option>
            <option value="Corporate Partnership">Corporate Partnership</option>
            <option value="Supplier / Manufacturer">Supplier / Manufacturer</option>
            <option value="Service Partnership">Service Partnership</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16 text-gray-400">Loading collaboration inquiries...</div>
        ) : inquiries.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <FiBriefcase className="mx-auto text-4xl text-gray-300 mb-2" />
            <p className="font-semibold">No collaboration requests found</p>
            <p className="text-xs text-gray-400 mt-1">Inquiries submitted via /support will appear here.</p>
          </div>
        ) : (
          <DataTable data={inquiries} columns={columns} />
        )}
      </div>

      {/* Detail / Status Review Modal */}
      <AnimatePresence>
        {selectedInquiry && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={handleCloseDetail}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-100"
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white">
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">Inquiry Details</h3>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">ID: {selectedInquiry._id}</p>
                </div>
                <button
                  type="button"
                  onClick={handleCloseDetail}
                  className="w-9 h-9 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center transition-colors"
                >
                  <FiX className="text-lg" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-5 flex-1">
                {/* Overview Cards */}
                <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100 text-sm">
                  <div>
                    <span className="text-xs font-bold text-gray-400 uppercase">Requester</span>
                    <p className="font-bold text-gray-900 mt-0.5">{selectedInquiry.name}</p>
                  </div>
                  <div>
                    <span className="text-xs font-bold text-gray-400 uppercase">Company</span>
                    <p className="font-bold text-gray-900 mt-0.5">{selectedInquiry.companyName}</p>
                  </div>
                  <div>
                    <span className="text-xs font-bold text-gray-400 uppercase">Email</span>
                    <p className="font-medium text-gray-800 mt-0.5 break-all">{selectedInquiry.email}</p>
                  </div>
                  <div>
                    <span className="text-xs font-bold text-gray-400 uppercase">Phone</span>
                    <p className="font-medium text-gray-800 mt-0.5">{selectedInquiry.phone}</p>
                  </div>
                  <div>
                    <span className="text-xs font-bold text-gray-400 uppercase">Type</span>
                    <p className="font-semibold text-purple-700 mt-0.5">{selectedInquiry.collaborationType}</p>
                  </div>
                  <div>
                    <span className="text-xs font-bold text-gray-400 uppercase">Submitted</span>
                    <p className="font-medium text-gray-700 mt-0.5 text-xs">
                      {new Date(selectedInquiry.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Proposal Message */}
                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Proposal Message</h4>
                  <div className="p-4 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                    {selectedInquiry.message}
                  </div>
                </div>

                {/* Review Form */}
                <form onSubmit={handleUpdateStatus} className="space-y-4 pt-2 border-t border-gray-100">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                      Update Inquiry Status
                    </label>
                    <select
                      value={updateStatus}
                      onChange={(e) => setUpdateStatus(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-blue-500 font-semibold"
                    >
                      <option value="new">New (Unreviewed)</option>
                      <option value="in_review">In Review</option>
                      <option value="contacted">Contacted</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                      Internal Admin Notes
                    </label>
                    <textarea
                      rows={3}
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder="Add private review notes or action items regarding this partnership proposal..."
                      className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 resize-none"
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleCloseDetail}
                      className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-100 transition-colors disabled:opacity-50"
                    >
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CollaborationInquiries;
