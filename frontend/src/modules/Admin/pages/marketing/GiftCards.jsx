import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  FiGift, 
  FiSearch, 
  FiRefreshCw, 
  FiCopy, 
  FiCheck, 
  FiEye, 
  FiXCircle, 
  FiClock, 
  FiCreditCard, 
  FiUser, 
  FiMail, 
  FiPhone, 
  FiDollarSign, 
  FiActivity, 
  FiAlertCircle, 
  FiShield, 
  FiArrowRight, 
  FiCheckCircle, 
  FiX
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import DataTable from '../../components/DataTable';
import ExportButton from '../../components/ExportButton';
import ConfirmModal from '../../components/ConfirmModal';
import AnimatedSelect from '../../components/AnimatedSelect';
import { formatCurrency, formatDateTime } from '../../utils/adminHelpers';
import api from '../../../../shared/utils/api';
import toast from 'react-hot-toast';

const STATUS_CONFIG = {
  ACTIVE: { label: 'Active', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  PARTIALLY_REDEEMED: { label: 'Partially Redeemed', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  FULLY_REDEEMED: { label: 'Fully Redeemed', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  EXPIRED: { label: 'Expired', bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' },
  CANCELLED: { label: 'Cancelled', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  PENDING_PAYMENT: { label: 'Pending Payment', bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
};

const GiftCards = () => {
  const [giftCards, setGiftCards] = useState([]);
  const [summary, setSummary] = useState({
    totalCards: 0,
    totalIssuedAmount: 0,
    activeBalance: 0,
    totalRedeemedAmount: 0,
    expiredAmount: 0,
    cancelledAmount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(null);
  const [cardsError, setCardsError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [copiedCode, setCopiedCode] = useState(null);
  
  // Selected Card for Details Modal
  const [selectedCard, setSelectedCard] = useState(null);
  const [cardTransactions, setCardTransactions] = useState([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Cancellation Modal
  const [cancelModal, setCancelModal] = useState({ isOpen: false, cardId: null, reason: '' });
  const [isCancelling, setIsCancelling] = useState(false);

  // Fetch summary metrics
  const fetchSummary = useCallback(async () => {
    try {
      setIsSummaryLoading(true);
      setSummaryError(null);
      const res = await api.get('/admin/gift-cards/summary');
      const stats = res?.metrics || res;
      if (stats) {
        setSummary({
          totalCards: stats.totalCards || 0,
          totalIssuedAmount: stats.totalIssuedAmount || 0,
          activeBalance: stats.activeBalance ?? stats.totalRemainingActiveBalance ?? 0,
          totalRedeemedAmount: stats.totalRedeemedAmount || 0,
          expiredAmount: stats.expiredAmount || 0,
          cancelledAmount: stats.cancelledAmount || 0,
        });
      }
    } catch (err) {
      console.error('Failed to fetch gift card summary:', err);
      setSummaryError(err.message || 'Unable to load gift card summary.');
    } finally {
      setIsSummaryLoading(false);
    }
  }, []);

  // Fetch gift cards list
  const fetchGiftCards = useCallback(async () => {
    try {
      setIsLoading(true);
      setCardsError(null);
      const params = { limit: 100 };
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await api.get('/admin/gift-cards', { params });
      const list = res?.cards || res?.giftCards || (Array.isArray(res) ? res : []);
      setGiftCards(list);
    } catch (err) {
      setCardsError(err.message || 'Unable to load gift cards.');
      toast.error(err.message || 'Failed to load gift cards');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchGiftCards();
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [fetchGiftCards]);

  // Copy code to clipboard
  const handleCopy = (code, e) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success('Voucher code copied!');
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Open details & audit history modal
  const handleViewDetails = async (card) => {
    setSelectedCard(card);
    setIsLoadingDetails(true);
    try {
      const res = await api.get(`/admin/gift-cards/${card._id}`);
      if (res) {
        setSelectedCard(res.giftCard || res);
        setCardTransactions(res.transactions || []);
      }
    } catch (err) {
      toast.error(err.message || 'Failed to load voucher details');
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Handle Card Cancellation
  const handleConfirmCancel = async () => {
    if (!cancelModal.cardId) return;
    setIsCancelling(true);
    try {
      await api.post(`/admin/gift-cards/${cancelModal.cardId}/cancel`, {
        reason: cancelModal.reason || 'Admin cancelled gift card',
      });
      toast.success('Gift card cancelled successfully');
      setCancelModal({ isOpen: false, cardId: null, reason: '' });
      if (selectedCard && selectedCard._id === cancelModal.cardId) {
        handleViewDetails({ _id: cancelModal.cardId });
      }
      fetchGiftCards();
      fetchSummary();
    } catch (err) {
      toast.error(err.message || 'Failed to cancel gift card');
    } finally {
      setIsCancelling(false);
    }
  };

  // Status Filter Options
  const statusOptions = [
    { value: 'ALL', label: 'All Statuses' },
    { value: 'ACTIVE', label: 'Active' },
    { value: 'PARTIALLY_REDEEMED', label: 'Partially Redeemed' },
    { value: 'FULLY_REDEEMED', label: 'Fully Redeemed' },
    { value: 'EXPIRED', label: 'Expired' },
    { value: 'CANCELLED', label: 'Cancelled' },
    { value: 'PENDING_PAYMENT', label: 'Pending Payment' },
  ];

  // Export Headers
  const exportHeaders = [
    { label: 'Voucher Code', key: 'code' },
    { label: 'Original Amount (INR)', key: 'initialAmount' },
    { label: 'Remaining Balance (INR)', key: 'remainingBalance' },
    { label: 'Status', key: 'status' },
    { label: 'Buyer Email', key: 'purchasedByEmail' },
    { label: 'Recipient Name', key: 'recipientName' },
    { label: 'Recipient Email', key: 'recipientEmail' },
    { label: 'Payment ID', key: 'razorpayPaymentId' },
    { label: 'Created At', key: 'createdAt' },
    { label: 'Expires At', key: 'expiresAt' },
  ];

  // Table Columns
  const columns = [
    {
      key: 'code',
      label: 'Voucher Code',
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-gray-900 bg-gray-100 px-2.5 py-1 rounded-lg text-xs tracking-wider border border-gray-200">
            {row.code}
          </span>
          <button
            type="button"
            onClick={(e) => handleCopy(row.code, e)}
            className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-700 transition-colors"
            title="Copy Code"
          >
            {copiedCode === row.code ? <FiCheck className="text-emerald-600" size={14} /> : <FiCopy size={14} />}
          </button>
        </div>
      ),
    },
    {
      key: 'purchasedBy',
      label: 'Buyer',
      render: (_, row) => (
        <div className="space-y-0.5">
          <p className="font-medium text-gray-900 text-sm">{row.purchasedBy?.name || 'Customer'}</p>
          <p className="text-xs text-gray-500 font-mono">{row.purchasedByEmail || row.purchasedBy?.email || '—'}</p>
        </div>
      ),
    },
    {
      key: 'recipient',
      label: 'Recipient',
      render: (_, row) => (
        <div className="space-y-0.5">
          <p className="font-medium text-gray-900 text-sm">{row.recipientName || 'Self / Unassigned'}</p>
          <p className="text-xs text-gray-500 font-mono">{row.recipientEmail || '—'}</p>
        </div>
      ),
    },
    {
      key: 'amount',
      label: 'Amount / Balance',
      render: (_, row) => (
        <div>
          <div className="flex items-center gap-1.5 font-bold text-gray-900 text-sm">
            <span>{formatCurrency(row.remainingBalance)}</span>
            <span className="text-xs font-normal text-gray-400">/ {formatCurrency(row.initialAmount)}</span>
          </div>
          {row.remainingBalance < row.initialAmount && (
            <div className="w-24 bg-gray-100 h-1.5 rounded-full overflow-hidden mt-1">
              <div
                className="bg-emerald-500 h-full rounded-full"
                style={{ width: `${Math.max(0, (row.remainingBalance / row.initialAmount) * 100)}%` }}
              />
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => {
        const cfg = STATUS_CONFIG[row.status] || { label: row.status, bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' };
        return (
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
            {cfg.label}
          </span>
        );
      },
    },
    {
      key: 'payment',
      label: 'Payment',
      render: (_, row) => (
        <div>
          <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium uppercase ${
            row.paymentStatus === 'paid' ? 'bg-emerald-100 text-emerald-800' :
            row.paymentStatus === 'failed' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
          }`}>
            {row.paymentStatus || 'pending'}
          </span>
          {row.razorpayPaymentId && (
            <p className="text-[10px] text-gray-400 font-mono mt-0.5 truncate max-w-[110px]" title={row.razorpayPaymentId}>
              {row.razorpayPaymentId}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'createdAt',
      label: 'Issued / Expires',
      render: (_, row) => (
        <div className="text-xs text-gray-600 space-y-0.5">
          <p>{formatDateTime(row.createdAt)}</p>
          {row.expiresAt && (
            <p className="text-[11px] text-gray-400">Exp: {new Date(row.expiresAt).toLocaleDateString('en-IN')}</p>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleViewDetails(row)}
            className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            title="View Details & Audit Log"
          >
            <FiEye size={16} />
          </button>
          {['ACTIVE', 'PENDING_PAYMENT'].includes(row.status) && row.remainingBalance === row.initialAmount && (
            <button
              type="button"
              onClick={() => setCancelModal({ isOpen: true, cardId: row._id, reason: '' })}
              className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
              title="Cancel Gift Card"
            >
              <FiXCircle size={16} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-red-50 text-[#E31E24] flex items-center justify-center font-bold shadow-sm">
              <FiGift size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Gift Cards & Vouchers</h1>
              <p className="text-sm text-gray-500">Manage issued customer vouchers, monitor redemptions, and inspect financial audits</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ExportButton data={giftCards} headers={exportHeaders} filename="safefire-gift-cards" />
          <button
            onClick={() => { fetchGiftCards(); fetchSummary(); }}
            className="flex items-center gap-1.5 px-3.5 py-2 border border-gray-200 text-gray-700 bg-white rounded-xl text-sm font-medium hover:bg-gray-50 shadow-sm transition-colors"
          >
            <FiRefreshCw className={isLoading ? 'animate-spin' : ''} size={15} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Summary Error Alert */}
      {summaryError && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-red-700 text-sm font-semibold">
            <FiAlertCircle className="text-lg flex-shrink-0" />
            <span>{summaryError}</span>
          </div>
          <button
            type="button"
            onClick={fetchSummary}
            className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm shrink-0"
          >
            Retry Summary
          </button>
        </div>
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Total Issued</span>
            <div className="w-8 h-8 rounded-lg bg-red-50 text-[#E31E24] flex items-center justify-center">
              <FiGift size={16} />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-black text-gray-900 mt-2">
            {formatCurrency(summary.totalIssuedAmount || 0)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{summary.totalCards || 0} cards generated</p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Active Balance</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <FiDollarSign size={16} />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-black text-emerald-600 mt-2">
            {formatCurrency(summary.activeBalance || 0)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">Available for redemption</p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Total Redeemed</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <FiCheckCircle size={16} />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-black text-blue-600 mt-2">
            {formatCurrency(summary.totalRedeemedAmount || 0)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">Credited to customer wallets</p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Expired Value</span>
            <div className="w-8 h-8 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center">
              <FiClock size={16} />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-black text-gray-700 mt-2">
            {formatCurrency(summary.expiredAmount || 0)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">Unclaimed after 1 year</p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Cancelled Value</span>
            <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
              <FiXCircle size={16} />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-black text-red-600 mt-2">
            {formatCurrency(summary.cancelledAmount || 0)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">Admin voided cards</p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search code, email, buyer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-[#E31E24] transition-all"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="w-full sm:w-56">
            <AnimatedSelect
              options={statusOptions}
              value={statusFilter}
              onChange={(val) => setStatusFilter(val)}
              placeholder="Filter by Status"
            />
          </div>
        </div>
      </div>

      {/* Main Data Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <div className="w-10 h-10 border-3 border-[#E31E24] border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm text-gray-500 font-medium">Loading gift cards & vouchers...</p>
          </div>
        ) : cardsError ? (
          <div className="py-16 px-4 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto text-xl">
              <FiAlertCircle />
            </div>
            <h4 className="text-sm font-bold text-gray-800">Unable to load gift cards</h4>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">{cardsError}</p>
            <button
              type="button"
              onClick={fetchGiftCards}
              className="px-4 py-2 bg-[#E31E24] hover:bg-red-700 active:scale-95 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
            >
              Retry
            </button>
          </div>
        ) : giftCards.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 bg-gray-50 text-gray-400 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <FiGift size={28} />
            </div>
            <h3 className="text-base font-bold text-gray-800">No Gift Cards Found</h3>
            <p className="text-sm text-gray-500 max-w-sm mx-auto mt-1">
              {searchQuery || statusFilter !== 'ALL'
                ? 'Try adjusting your search criteria or status filter.'
                : 'No gift cards have been purchased yet.'}
            </p>
          </div>
        ) : (
          <DataTable
            data={giftCards}
            columns={columns}
            itemsPerPage={10}
            sortable={true}
            onRowClick={(row) => handleViewDetails(row)}
          />
        )}
      </div>

      {/* Details & Audit Trail Modal */}
      <AnimatePresence>
        {selectedCard && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl border border-gray-100 overflow-hidden my-8"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="bg-[#1F1F1F] text-white p-6 relative">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/10 text-red-400 flex items-center justify-center">
                      <FiGift size={22} />
                    </div>
                    <div>
                      <span className="text-xs text-gray-400 font-mono uppercase tracking-widest">SafeFire E-Voucher</span>
                      <h2 className="text-xl font-bold tracking-wide font-mono mt-0.5">{selectedCard.code}</h2>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedCard(null)}
                    className="p-2 text-gray-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
                  >
                    <FiX size={20} />
                  </button>
                </div>

                <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-white/5 p-3.5 rounded-2xl border border-white/10">
                  <div>
                    <span className="text-gray-400 block mb-0.5">Original Amount</span>
                    <span className="font-bold text-base text-white">{formatCurrency(selectedCard.initialAmount)}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block mb-0.5">Remaining Balance</span>
                    <span className="font-bold text-base text-emerald-400">{formatCurrency(selectedCard.remainingBalance)}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block mb-0.5">Status</span>
                    <span className="font-semibold text-white uppercase">{selectedCard.status}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block mb-0.5">Payment</span>
                    <span className="font-semibold text-emerald-400 uppercase">{selectedCard.paymentStatus}</span>
                  </div>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-6 max-h-[65vh] overflow-y-auto">
                {isLoadingDetails ? (
                  <div className="py-12 text-center text-gray-400">Loading audit history...</div>
                ) : (
                  <>
                    {/* Buyer & Recipient Info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
                          <FiUser size={14} /> Buyer Information
                        </span>
                        <p className="font-semibold text-gray-900 text-sm">{selectedCard.purchasedBy?.name || 'Customer'}</p>
                        <p className="text-xs text-gray-500 font-mono mt-0.5">{selectedCard.purchasedByEmail || selectedCard.purchasedBy?.email || '—'}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{selectedCard.purchasedBy?.phone || 'No phone'}</p>
                      </div>

                      <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
                          <FiMail size={14} /> Recipient Information
                        </span>
                        <p className="font-semibold text-gray-900 text-sm">{selectedCard.recipientName || 'Self / Unassigned'}</p>
                        <p className="text-xs text-gray-500 font-mono mt-0.5">{selectedCard.recipientEmail || '—'}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{selectedCard.recipientPhone || 'No phone'}</p>
                      </div>
                    </div>

                    {/* Personal Message */}
                    {selectedCard.message && (
                      <div className="p-4 bg-amber-50/50 rounded-2xl border border-amber-200/60 text-xs">
                        <span className="font-bold text-amber-800 uppercase tracking-wider block mb-1">Attached Message:</span>
                        <p className="text-gray-700 italic">"{selectedCard.message}"</p>
                      </div>
                    )}

                    {/* Payment & Security Reference */}
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
                        <FiCreditCard size={14} /> Payment & Security
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                        <div>
                          <span className="text-gray-400">Razorpay Order ID: </span>
                          <span className="text-gray-800">{selectedCard.razorpayOrderId || '—'}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">Razorpay Payment ID: </span>
                          <span className="text-gray-800">{selectedCard.razorpayPaymentId || '—'}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">Code Hash (SHA256): </span>
                          <span className="text-gray-800 truncate block max-w-[280px]" title={selectedCard.codeHash}>
                            {selectedCard.codeHash || '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">Expires At: </span>
                          <span className="text-gray-800">{selectedCard.expiresAt ? formatDateTime(selectedCard.expiresAt) : '—'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Lifecycle & Audit Transactions */}
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5">
                        <FiActivity size={14} /> Transaction Audit Trail ({cardTransactions.length})
                      </h4>

                      {cardTransactions.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">No transaction records found.</p>
                      ) : (
                        <div className="space-y-2">
                          {cardTransactions.map((tx) => (
                            <div key={tx._id} className="p-3.5 bg-gray-50 rounded-xl border border-gray-200/80 flex items-center justify-between text-xs">
                              <div className="flex items-center gap-3">
                                <span className={`w-2 h-2 rounded-full ${
                                  tx.type === 'ACTIVATION' ? 'bg-emerald-500' :
                                  tx.type === 'REDEMPTION' ? 'bg-blue-500' :
                                  tx.type === 'PARTIAL_REDEMPTION' ? 'bg-amber-500' :
                                  tx.type === 'CANCELLATION' ? 'bg-red-500' : 'bg-gray-400'
                                }`} />
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-gray-900">{tx.type}</span>
                                    <span className="font-mono text-gray-500">₹{tx.amount?.toLocaleString('en-IN')}</span>
                                  </div>
                                  <p className="text-gray-500 text-[11px] mt-0.5">
                                    {tx.notes || tx.reference || 'Audit event'} • Bal: ₹{tx.balanceBefore} → ₹{tx.balanceAfter}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right text-[11px] text-gray-400 font-mono">
                                <p>{formatDateTime(tx.createdAt)}</p>
                                {tx.walletTransactionId && (
                                  <p className="text-emerald-600 font-medium mt-0.5">Wallet Ref Linked</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <div>
                  {['ACTIVE', 'PENDING_PAYMENT'].includes(selectedCard.status) && selectedCard.remainingBalance === selectedCard.initialAmount && (
                    <button
                      type="button"
                      onClick={() => setCancelModal({ isOpen: true, cardId: selectedCard._id, reason: '' })}
                      className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5"
                    >
                      <FiXCircle size={15} /> Cancel This Gift Card
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCard(null)}
                  className="px-5 py-2 bg-gray-900 text-white font-bold rounded-xl text-xs hover:bg-black transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal for Cancellation */}
      <ConfirmModal
        isOpen={cancelModal.isOpen}
        onClose={() => setCancelModal({ isOpen: false, cardId: null, reason: '' })}
        onConfirm={handleConfirmCancel}
        title="Cancel Gift Card"
        message="Are you sure you want to cancel this gift card? Once cancelled, it can no longer be redeemed. This action creates an audit trail and cannot be undone."
        confirmText={isCancelling ? 'Cancelling...' : 'Confirm Cancel'}
        type="danger"
      />
    </div>
  );
};

export default GiftCards;
