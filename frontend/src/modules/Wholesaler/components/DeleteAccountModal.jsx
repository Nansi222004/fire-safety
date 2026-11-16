import { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { FiTrash2, FiX } from "react-icons/fi";
import toast from "react-hot-toast";
import { useWholesalerAuthStore } from "../store/wholesalerAuthStore";

/**
 * Permanent wholesaler account deletion (same flow as the Vendor and customer apps).
 * The backend refuses while orders are still active; its message is shown as is.
 */
const DeleteAccountModal = ({ open, onClose }) => {
  const navigate = useNavigate();
  const deleteAccount = useWholesalerAuthStore((s) => s.deleteAccount);
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const close = () => {
    if (isDeleting) return;
    setConfirmText("");
    onClose();
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteAccount();
      toast.success("Your wholesaler account has been permanently deleted.");
      setConfirmText("");
      onClose();
      navigate("/wholesaler/login", { replace: true });
    } catch (err) {
      if (!err?.toastShown) {
        toast.error(err?.response?.data?.message || err?.message || "Failed to delete wholesaler account.");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="no-pinch-zoom fixed inset-0 z-[99999] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 bg-black/60"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-wholesaler-title"
            className="bg-white rounded-3xl p-5 sm:p-7 max-w-md w-full relative z-10 shadow-2xl border border-red-100 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center text-xl">
                  <FiTrash2 />
                </div>
                <div>
                  <h3 id="delete-wholesaler-title" className="text-base font-black text-slate-900">Delete Wholesaler Account</h3>
                  <p className="text-xs text-red-500 font-bold">Permanent Deletion</p>
                </div>
              </div>
              <button type="button" onClick={close} aria-label="Close" className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400">
                <FiX className="text-lg" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-red-50/70 border border-red-100 space-y-2">
              <p className="text-sm text-slate-800 font-bold leading-relaxed">
                Are you sure you want to permanently delete your wholesaler account?
              </p>
              <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
                <li>Your business profile and wholesale products will be removed.</li>
                <li>Deletion is blocked while you have active, unfulfilled orders.</li>
              </ul>
            </div>

            <div>
              <label htmlFor="delete-confirm" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Type <span className="text-red-600 font-black">DELETE</span> to confirm
              </label>
              <input
                id="delete-confirm"
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type DELETE"
                className="w-full px-4 py-2.5 border-2 border-slate-200 focus:border-red-500 rounded-xl text-base sm:text-sm font-semibold focus:outline-none text-slate-900"
              />
            </div>

            <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={close}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={confirmText !== "DELETE" || isDeleting}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-xs shadow-md flex items-center justify-center gap-1.5"
              >
                {isDeleting ? "Deleting..." : (<><FiTrash2 /> Delete Account</>)}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default DeleteAccountModal;
