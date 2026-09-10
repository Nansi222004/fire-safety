import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  FiDollarSign,
  FiClock,
  FiCheckCircle,
  FiAlertCircle,
  FiBriefcase,
  FiArrowUpRight,
  FiGrid,
  FiX
} from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import Badge from "../../../shared/components/Badge";
import { formatPrice } from "../../../shared/utils/helpers";
import { useVendorAuthStore } from "../store/vendorAuthStore";
import api from "../../../shared/utils/api";
import toast from "react-hot-toast";

const WalletHistory = () => {
  const { vendor } = useVendorAuthStore();
  const [stats, setStats] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Withdrawal Form States
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isSubmittingWithdraw, setIsSubmittingWithdraw] = useState(false);
  const [bankDetails, setBankDetails] = useState({
    accountHolder: vendor?.bankDetails?.accountName || "",
    accountNumber: vendor?.bankDetails?.accountNumber || "",
    ifsc: vendor?.bankDetails?.ifscCode || "",
    bankName: vendor?.bankDetails?.bankName || ""
  });

  const vendorId = vendor?.id || vendor?._id;

  const fetchWalletData = async () => {
    if (!vendorId) return;
    setIsLoading(true);
    try {
      const [statsRes, historyRes] = await Promise.all([
        api.get("/vendor/wallet/stats"),
        api.get("/vendor/wallet/history")
      ]);
      setStats(statsRes.data || statsRes);
      setTransactions(historyRes.data?.transactions || historyRes.transactions || []);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load wallet stats.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWalletData();
  }, [vendorId]);

  const handleWithdrawSubmit = async (e) => {
    e.preventDefault();
    const amountNum = parseFloat(withdrawAmount);
    if (!amountNum || amountNum <= 0) {
      toast.error("Please enter a valid amount.");
      return;
    }
    if (amountNum > (stats?.walletBalance || 0)) {
      toast.error("Insufficient available balance.");
      return;
    }
    if (!bankDetails.accountNumber || !bankDetails.accountHolder || !bankDetails.ifsc || !bankDetails.bankName) {
      toast.error("Please fill all bank account details.");
      return;
    }

    setIsSubmittingWithdraw(true);
    try {
      await api.post("/vendor/wallet/withdraw", {
        amount: amountNum,
        bankDetails
      });
      toast.success("Withdrawal request submitted successfully!");
      setShowWithdrawModal(false);
      setWithdrawAmount("");
      fetchWalletData();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "Failed to request withdrawal.");
    } finally {
      setIsSubmittingWithdraw(false);
    }
  };

  const modalJSX = (
    <AnimatePresence>
      {showWithdrawModal && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowWithdrawModal(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[100000]"
          />
          <div className="fixed inset-0 z-[100001] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 max-w-md w-full max-h-[85vh] sm:max-h-[90vh] overflow-y-auto shadow-2xl space-y-4 my-auto border border-gray-100"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-extrabold text-slate-900 text-sm sm:text-base tracking-tight">Request Payout</h3>
                <button
                  onClick={() => setShowWithdrawModal(false)}
                  className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-500 transition-colors"
                >
                  <FiX size={16} />
                </button>
              </div>

              <form onSubmit={handleWithdrawSubmit} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1.5">
                    Withdrawal Amount (Available: <span className="text-emerald-600 font-mono font-black">{formatPrice(stats?.walletBalance || 0)}</span>)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Enter amount (₹)"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#024d3e] focus:outline-none text-sm font-semibold font-mono"
                  />
                </div>

                <div className="border-t border-slate-100 pt-3 space-y-3">
                  <span className="block text-[11px] font-bold text-slate-600">
                    Bank Account Details
                  </span>
                  
                  <input
                    type="text"
                    placeholder="Account Holder Name"
                    value={bankDetails.accountHolder}
                    onChange={(e) => setBankDetails({ ...bankDetails, accountHolder: e.target.value })}
                    className="w-full px-3.5 py-2 bg-gray-50 border border-slate-200 rounded-xl focus:outline-none text-xs font-semibold"
                  />
                  <input
                    type="text"
                    placeholder="Bank Name"
                    value={bankDetails.bankName}
                    onChange={(e) => setBankDetails({ ...bankDetails, bankName: e.target.value })}
                    className="w-full px-3.5 py-2 bg-gray-50 border border-slate-200 rounded-xl focus:outline-none text-xs font-semibold"
                  />
                  <input
                    type="text"
                    placeholder="Account Number"
                    value={bankDetails.accountNumber}
                    onChange={(e) => setBankDetails({ ...bankDetails, accountNumber: e.target.value })}
                    className="w-full px-3.5 py-2 bg-gray-50 border border-slate-200 rounded-xl focus:outline-none text-xs font-semibold font-mono"
                  />
                  <input
                    type="text"
                    placeholder="IFSC Code"
                    value={bankDetails.ifsc}
                    onChange={(e) => setBankDetails({ ...bankDetails, ifsc: e.target.value.toUpperCase() })}
                    className="w-full px-3.5 py-2 bg-gray-50 border border-slate-200 rounded-xl focus:outline-none text-xs font-semibold font-mono"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingWithdraw}
                  className="w-full py-3 bg-gradient-to-r from-[#024d3e] to-[#01352a] hover:from-[#01352a] hover:to-[#01251d] text-white rounded-xl font-bold uppercase text-xs tracking-wider shadow-md shadow-emerald-900/20 transition-all active:scale-98"
                >
                  {isSubmittingWithdraw ? "Requesting Payout..." : "Submit Payout Request"}
                </button>
              </form>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 sm:space-y-6 max-w-5xl mx-auto pb-6 px-1 sm:px-0"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div className="lg:hidden">
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight">
            Vendor Wallet & Payouts
          </h1>
          <p className="text-[11px] sm:text-xs text-slate-400 font-bold mt-0.5 uppercase tracking-wide">
            Manage your escrow release timeline and request payout withdrawals
          </p>
        </div>
        <button
          onClick={() => {
            setBankDetails({
              accountHolder: vendor?.bankDetails?.accountName || bankDetails.accountHolder || "",
              accountNumber: vendor?.bankDetails?.accountNumber || bankDetails.accountNumber || "",
              ifsc: vendor?.bankDetails?.ifscCode || bankDetails.ifsc || "",
              bankName: vendor?.bankDetails?.bankName || bankDetails.bankName || ""
            });
            setShowWithdrawModal(true);
          }}
          disabled={!stats?.walletBalance || stats.walletBalance <= 0}
          className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-[#024d3e] to-[#01352a] hover:from-[#01352a] hover:to-[#01251d] text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed lg:ml-auto text-center active:scale-98"
        >
          Withdraw Funds
        </button>
      </div>

      {/* Main Stats Cards (2x2 on Mobile, 2 on sm, 4 on lg) */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-white border border-slate-100 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 shadow-xs sm:shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Available</span>
            <div className="p-1 bg-emerald-50 text-emerald-600 rounded-lg">
              <FiCheckCircle className="text-xs sm:text-sm" />
            </div>
          </div>
          <p className="text-base sm:text-2xl font-black text-emerald-600 font-mono truncate">{formatPrice(stats?.walletBalance || 0)}</p>
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mt-1">Ready for payout</span>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 shadow-xs sm:shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Escrow Hold</span>
            <div className="p-1 bg-amber-50 text-amber-600 rounded-lg">
              <FiClock className="text-xs sm:text-sm" />
            </div>
          </div>
          <p className="text-base sm:text-2xl font-black text-amber-600 font-mono truncate">{formatPrice(stats?.onHoldBalance || 0)}</p>
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mt-1">7-day hold period</span>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 shadow-xs sm:shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">In Progress</span>
            <div className="p-1 bg-purple-50 text-purple-600 rounded-lg">
              <FiBriefcase className="text-xs sm:text-sm" />
            </div>
          </div>
          <p className="text-base sm:text-2xl font-black text-purple-600 font-mono truncate">{formatPrice(stats?.pendingWithdrawal || 0)}</p>
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mt-1">Processing</span>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 shadow-xs sm:shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Withdrawn</span>
            <div className="p-1 bg-blue-50 text-blue-600 rounded-lg">
              <FiDollarSign className="text-xs sm:text-sm" />
            </div>
          </div>
          <p className="text-base sm:text-2xl font-black text-blue-600 font-mono truncate">{formatPrice(stats?.totalWithdrawn || 0)}</p>
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mt-1">All-time total</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Left column: expected releases timeline & recent releases */}
        <div className="lg:col-span-1 space-y-4 sm:space-y-6">
          {/* Expected releases */}
          <div className="bg-white border border-slate-150 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-xs sm:shadow-sm space-y-3 sm:space-y-4">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <span>⌛</span>
              <span>Escrow Payout Schedule</span>
            </h3>
            <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
              {stats?.expectedReleases && stats.expectedReleases.length > 0 ? (
                stats.expectedReleases.map((rel, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-800 block">Order #{rel.orderId}</span>
                      <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">
                        Releases in {rel.daysRemaining} days
                      </span>
                    </div>
                    <span className="font-bold text-slate-700 font-mono">
                      {formatPrice(rel.amount)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-slate-400 text-xs font-bold uppercase tracking-wider">
                  No upcoming payouts scheduled.
                </div>
              )}
            </div>
          </div>

          {/* Recent releases */}
          <div className="bg-white border border-slate-150 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-xs sm:shadow-sm space-y-3 sm:space-y-4">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <span>🎉</span>
              <span>Recent Escrow Releases (30d)</span>
            </h3>
            <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
              {stats?.recentReleases && stats.recentReleases.length > 0 ? (
                stats.recentReleases.map((rel, idx) => (
                  <div key={idx} className="p-3 bg-emerald-50/40 border border-emerald-100 rounded-2xl flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-800 block">Order #{rel.orderId}</span>
                      <span className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider">
                        Released: {new Date(rel.releasedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <span className="font-bold text-emerald-700 font-mono">
                      + {formatPrice(rel.amount)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-slate-400 text-xs font-bold uppercase tracking-wider">
                  No payout releases in last 30 days.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column: Withdrawal transaction logs */}
        <div className="lg:col-span-2 bg-white border border-slate-150 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xs sm:shadow-sm space-y-4 sm:space-y-5">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <span>📜</span>
            <span>Withdrawal & Payout History</span>
          </h3>

          <div className="space-y-3">
            {transactions.length > 0 ? (
              transactions.map((tx) => {
                const statusColors = {
                  pending: "bg-amber-50 text-amber-700 border-amber-100",
                  approved: "bg-indigo-50 text-indigo-700 border-indigo-100",
                  processing: "bg-blue-50 text-blue-700 border-blue-100",
                  completed: "bg-emerald-50 text-emerald-700 border-emerald-100",
                  rejected: "bg-rose-50 text-rose-700 border-rose-100"
                };

                return (
                  <div
                    key={tx.id}
                    className="p-3.5 sm:p-4 border border-slate-100 rounded-2xl flex items-center justify-between text-xs hover:border-slate-200 transition-colors"
                  >
                    <div className="space-y-1">
                      <span className="font-bold text-slate-850 block">{tx.description}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Requested: {new Date(tx.date).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-right space-y-1.5">
                      <span className="font-bold text-slate-800 font-mono block">
                        {formatPrice(tx.amount)}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${statusColors[tx.status] || "bg-slate-50"}`}>
                        {tx.status}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12 text-slate-400 text-xs font-bold uppercase tracking-wider">
                No withdrawal records found.
              </div>
            )}
          </div>
        </div>
      </div>

      {typeof document !== "undefined" ? createPortal(modalJSX, document.body) : null}
    </motion.div>
  );
};

export default WalletHistory;
