import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiGift,
  FiX,
  FiZap,
  FiCopy,
  FiCheck,
  FiMail,
  FiUser,
  FiPhone,
  FiMessageSquare,
  FiCreditCard,
  FiAlertCircle,
  FiRefreshCw,
  FiLock,
  FiArrowRight,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../../../shared/utils/api';
import { useAuthStore } from '../../../../shared/store/authStore';

const ALLOWED_DENOMINATIONS = [500, 1000, 2500, 5000, 10000];

// Dynamic Razorpay SDK loader
const loadRazorpay = () => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

const GiftCardsModal = ({ isOpen, onClose, onWalletUpdated }) => {
  const { user, fetchUserProfile } = useAuthStore();
  const [activeTab, setActiveTab] = useState('buy'); // Default to 'buy' or 'redeem'

  // Summary & Cards State
  const [summary, setSummary] = useState({ totalAvailableBalance: 0, activeCardsCount: 0 });
  const [myCards, setMyCards] = useState([]);
  const [isLoadingCards, setIsLoadingCards] = useState(false);

  // Redeem State
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemAmount, setRedeemAmount] = useState('');
  const [isPartialRedeem, setIsPartialRedeem] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);

  // Buy State
  const [selectedAmount, setSelectedAmount] = useState(1000);
  const [customAmount, setCustomAmount] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [message, setMessage] = useState('');
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchasedCard, setPurchasedCard] = useState(null);

  // Copy state
  const [copiedCode, setCopiedCode] = useState('');

  const fetchGiftCardData = useCallback(async () => {
    if (!isOpen) return;
    setIsLoadingCards(true);
    try {
      const [summaryRes, cardsRes] = await Promise.all([
        api.get('/gift-cards/summary').catch(() => null),
        api.get('/gift-cards/my-cards').catch(() => null),
      ]);

      if (summaryRes) {
        setSummary(summaryRes.data || summaryRes || { totalAvailableBalance: 0, activeCardsCount: 0 });
      }
      if (cardsRes) {
        const payload = cardsRes.data || cardsRes || {};
        setMyCards(payload.cards || []);
      }
    } catch (err) {
      console.warn('[GiftCard Modal] Failed to load data:', err.message);
    } finally {
      setIsLoadingCards(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      fetchGiftCardData();
    } else {
      setPurchasedCard(null);
    }
  }, [isOpen, fetchGiftCardData]);

  const handleCopy = (code) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success('Voucher code copied to clipboard!');
    setTimeout(() => setCopiedCode(''), 3000);
  };

  // Format voucher code input as user types
  const handleCodeChange = (e) => {
    let val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (val.startsWith('SFGIFT')) {
      val = val.substring(6);
    }
    // Group into 4-character chunks
    const chunks = [];
    for (let i = 0; i < val.length && i < 12; i += 4) {
      chunks.push(val.substring(i, i + 4));
    }
    const formatted = chunks.length > 0 ? `SF-GIFT-${chunks.join('-')}` : '';
    setRedeemCode(formatted);
  };

  // Handle Redeem
  const handleRedeem = async (e) => {
    e.preventDefault();
    if (!redeemCode.trim()) {
      toast.error('Please enter a valid voucher code');
      return;
    }

    setIsRedeeming(true);
    try {
      const payload = {
        code: redeemCode.trim(),
      };
      if (isPartialRedeem && redeemAmount) {
        payload.amountToRedeem = Number(redeemAmount);
      }

      const res = await api.post('/gift-cards/redeem', payload);
      const data = res?.data || res;
      const redeemedVal = data?.redeemedAmount || 0;

      toast.success(`🎁 Success! ₹${redeemedVal.toLocaleString('en-IN')} added to your SafeFire Wallet!`, {
        duration: 5000,
        icon: '🎉',
      });

      setRedeemCode('');
      setRedeemAmount('');
      setIsPartialRedeem(false);

      // Refresh wallet and gift cards
      fetchGiftCardData();
      if (typeof fetchUserProfile === 'function') fetchUserProfile();
      if (typeof onWalletUpdated === 'function') onWalletUpdated(data?.newWalletBalance);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to redeem voucher';
      toast.error(msg);
    } finally {
      setIsRedeeming(false);
    }
  };

  // Handle Buy
  const handleBuy = async (e) => {
    e.preventDefault();
    const finalAmount = isCustom ? Number(customAmount) : Number(selectedAmount);

    if (isNaN(finalAmount) || finalAmount < 100 || finalAmount > 50000) {
      toast.error('Gift card amount must be between ₹100 and ₹50,000');
      return;
    }

    if (!recipientEmail || !recipientEmail.includes('@')) {
      toast.error('Please enter a valid recipient email address');
      return;
    }

    setIsPurchasing(true);
    try {
      // 1. Initialize Gift Card checkout with backend
      const initRes = await api.post('/gift-cards/purchase', {
        amount: finalAmount,
        recipientName: recipientName.trim(),
        recipientEmail: recipientEmail.trim(),
        recipientPhone: recipientPhone.trim(),
        message: message.trim(),
      });

      const initData = initRes?.data || initRes;
      const { giftCard, razorpayOrder } = initData;

      if (!razorpayOrder || !razorpayOrder.id) {
        throw new Error('Failed to initialize payment gateway.');
      }

      // 2. Load Razorpay SDK
      const sdkLoaded = await loadRazorpay();
      if (!sdkLoaded || !window.Razorpay) {
        throw new Error('Razorpay SDK failed to load. Please check your network connection.');
      }

      // 3. Launch Razorpay Checkout
      const rzpOptions = {
        key: razorpayOrder.key || import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency || 'INR',
        name: 'SafeFire Shop',
        description: `SafeFire e-Gift Card of ₹${finalAmount.toLocaleString('en-IN')}`,
        order_id: razorpayOrder.id,
        prefill: {
          name: user?.name || '',
          email: user?.email || '',
          contact: user?.phone || '',
        },
        theme: {
          color: '#E31E24',
        },
        handler: async (response) => {
          try {
            // 4. Verify payment on backend
            const verifyRes = await api.post('/gift-cards/verify-payment', {
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });

            const verifyData = verifyRes?.data || verifyRes;
            const activatedCard = verifyData?.giftCard;

            toast.success('🎉 e-Gift Card purchased and activated successfully!');
            setPurchasedCard(activatedCard);
            fetchGiftCardData();

            // Reset form
            setRecipientName('');
            setRecipientEmail('');
            setRecipientPhone('');
            setMessage('');
            setCustomAmount('');
            setIsCustom(false);
          } catch (verErr) {
            toast.error(verErr.response?.data?.message || verErr.message || 'Payment verification failed');
          }
        },
        modal: {
          ondismiss: () => {
            setIsPurchasing(false);
          },
        },
      };

      const rzp = new window.Razorpay(rzpOptions);
      rzp.open();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Could not initiate purchase');
      setIsPurchasing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/65 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Click outside backdrop */}
      <div className="absolute inset-0" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="bg-white rounded-3xl w-full max-w-xl max-h-[90vh] shadow-2xl border border-gray-100 flex flex-col relative z-10 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Pinned Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-gray-100 shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-red-500/10 to-orange-500/10 text-primary-600 flex items-center justify-center font-bold text-lg shadow-sm border border-red-100/60">
              <FiGift className="text-primary-600 text-xl" />
            </div>
            <div>
              <h3 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
                Gift Cards & Vouchers
              </h3>
              <p className="text-xs text-gray-500">Redeem, send, and manage digital vouchers</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-all active:scale-95"
            aria-label="Close"
          >
            <FiX size={20} />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5 scrollbar-thin scrollbar-thumb-gray-200">
          {/* Sleek Digital Gift Card Preview Banner */}
          <div className="bg-gradient-to-br from-[#18181B] via-[#27272A] to-[#E31E24] rounded-2xl p-5 text-white shadow-xl relative overflow-hidden border border-white/10">
            {/* Background ambient lighting */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-red-500/20 to-orange-500/20 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-8 -left-8 w-36 h-36 bg-white/5 rounded-full blur-xl pointer-events-none" />

            <div className="flex items-center justify-between mb-4 relative z-10">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-amber-500 to-yellow-400 text-gray-950 flex items-center justify-center font-bold shadow-md">
                  <FiZap className="text-sm" />
                </div>
                <span className="font-extrabold text-xs tracking-wider uppercase bg-gradient-to-r from-white to-gray-200 bg-clip-text text-transparent">
                  SafeFire e-Gift Voucher
                </span>
              </div>
              <span className="text-[10px] font-bold uppercase bg-white/15 px-2.5 py-0.5 rounded-full border border-white/20 tracking-wider backdrop-blur-md">
                Official
              </span>
            </div>

            <div className="space-y-1 mb-4 relative z-10">
              <p className="text-[11px] text-gray-300 uppercase tracking-widest font-semibold">
                Available Voucher Balance
              </p>
              <p className="text-3xl sm:text-4xl font-black tracking-tight text-white flex items-baseline gap-1">
                ₹{summary.totalAvailableBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
            </div>

            <div className="flex items-center justify-between text-xs text-gray-300 border-t border-white/15 pt-3 font-mono relative z-10">
              <span className="flex items-center gap-1.5 font-sans font-medium text-xs">
                <FiGift className="text-amber-400" /> {summary.activeCardsCount} Active Card{summary.activeCardsCount !== 1 ? 's' : ''}
              </span>
              <button
                type="button"
                onClick={fetchGiftCardData}
                disabled={isLoadingCards}
                className="text-xs text-gray-200 hover:text-white flex items-center gap-1.5 transition-colors font-sans font-medium bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-lg"
              >
                <FiRefreshCw className={isLoadingCards ? 'animate-spin' : ''} size={12} /> Refresh
              </button>
            </div>
          </div>

          {/* Segmented Control Tabs */}
          <div className="flex rounded-2xl bg-gray-100/90 p-1 text-xs font-bold shadow-inner">
            <button
              type="button"
              onClick={() => { setActiveTab('buy'); setPurchasedCard(null); }}
              className={`flex-1 py-2.5 rounded-xl transition-all ${
                activeTab === 'buy'
                  ? 'bg-white text-primary-600 shadow-md font-extrabold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Send / Buy e-Card
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('redeem'); setPurchasedCard(null); }}
              className={`flex-1 py-2.5 rounded-xl transition-all ${
                activeTab === 'redeem'
                  ? 'bg-white text-primary-600 shadow-md font-extrabold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Redeem Voucher
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('mycards'); setPurchasedCard(null); }}
              className={`flex-1 py-2.5 rounded-xl transition-all ${
                activeTab === 'mycards'
                  ? 'bg-white text-primary-600 shadow-md font-extrabold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              My Cards ({myCards.length})
            </button>
          </div>

          {/* TAB: BUY / SEND E-CARD */}
          {activeTab === 'buy' && (
            <div>
              {purchasedCard ? (
                /* Purchase Success Screen */
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-4 space-y-4"
                >
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-3xl shadow-sm">
                    <FiCheck />
                  </div>
                  <div>
                    <h4 className="text-xl font-black text-gray-900">Gift Card Activated!</h4>
                    <p className="text-xs text-gray-600 mt-1">
                      ₹{purchasedCard.amount?.toLocaleString('en-IN')} SafeFire e-Gift Voucher sent to{' '}
                      <strong className="text-gray-800">{purchasedCard.recipientEmail}</strong>
                    </p>
                  </div>

                  <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-4 text-left space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                        16-Digit Voucher Code:
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(purchasedCard.code)}
                        className="text-xs font-bold text-primary-600 hover:text-primary-700 flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg shadow-sm border border-amber-100"
                      >
                        {copiedCode === purchasedCard.code ? <FiCheck /> : <FiCopy />}
                        {copiedCode === purchasedCard.code ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <p className="font-mono font-black text-base sm:text-lg text-gray-900 tracking-wider bg-white p-3 rounded-xl border border-amber-200/60 shadow-inner">
                      {purchasedCard.code}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      A copy has also been sent to your email and the recipient's email address.
                    </p>
                  </div>

                  <div className="pt-2 flex gap-3">
                    <button
                      type="button"
                      onClick={() => { setPurchasedCard(null); setSelectedAmount(1000); }}
                      className="flex-1 py-2.5 border border-gray-200 text-gray-700 font-bold rounded-xl text-xs hover:bg-gray-50 transition-colors"
                    >
                      Buy Another Card
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPurchasedCard(null); setActiveTab('mycards'); }}
                      className="flex-1 py-2.5 bg-gray-900 text-white font-bold rounded-xl text-xs hover:bg-black transition-colors flex items-center justify-center gap-1"
                    >
                      View in My Cards <FiArrowRight />
                    </button>
                  </div>
                </motion.div>
              ) : (
                /* Buy Form */
                <form onSubmit={handleBuy} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wider">
                      Select Voucher Amount
                    </label>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-2.5">
                      {ALLOWED_DENOMINATIONS.map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => { setSelectedAmount(amt); setIsCustom(false); }}
                          className={`py-2.5 rounded-xl border text-xs font-black transition-all ${
                            !isCustom && selectedAmount === amt
                              ? 'bg-red-50 border-primary-600 text-primary-600 shadow-sm ring-2 ring-primary-500/20'
                              : 'border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
                          }`}
                        >
                          ₹{amt.toLocaleString('en-IN')}
                        </button>
                      ))}
                    </div>

                    {/* Custom Amount Button & Input */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsCustom(!isCustom)}
                        className={`text-xs px-3.5 py-2 rounded-xl border font-bold transition-all ${
                          isCustom
                            ? 'bg-red-50 border-primary-600 text-primary-600 ring-2 ring-primary-500/20'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        Custom Amount
                      </button>
                      {isCustom && (
                        <div className="flex-1 relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-xs">
                            ₹
                          </span>
                          <input
                            type="number"
                            min="100"
                            max="50000"
                            value={customAmount}
                            onChange={(e) => setCustomAmount(e.target.value)}
                            placeholder="Enter ₹100 - ₹50,000"
                            required={isCustom}
                            className="w-full pl-7 pr-3 py-2 text-xs rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 font-semibold"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
                      Recipient Email Address *
                    </label>
                    <div className="relative">
                      <FiMail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="email"
                        required
                        value={recipientEmail}
                        onChange={(e) => setRecipientEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 text-sm focus:outline-none placeholder:text-gray-400"
                        placeholder="friend@company.com"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">
                        Recipient Name
                      </label>
                      <div className="relative">
                        <FiUser className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          value={recipientName}
                          onChange={(e) => setRecipientName(e.target.value)}
                          className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 text-sm focus:outline-none placeholder:text-gray-400"
                          placeholder="Full Name"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">
                        Recipient Phone (Optional)
                      </label>
                      <div className="relative">
                        <FiPhone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="tel"
                          value={recipientPhone}
                          onChange={(e) => setRecipientPhone(e.target.value)}
                          className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 text-sm focus:outline-none placeholder:text-gray-400"
                          placeholder="9876543210"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">
                      Personal Message (Optional)
                    </label>
                    <div className="relative">
                      <FiMessageSquare className="absolute left-3.5 top-3 text-gray-400" />
                      <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={2}
                        maxLength={500}
                        className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 text-sm focus:outline-none placeholder:text-gray-400 resize-none"
                        placeholder="Happy Birthday! Here's a SafeFire voucher for fire safety protection."
                      />
                    </div>
                  </div>

                  {/* Payment Button */}
                  <div className="pt-2 flex gap-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 py-3 border border-gray-200 text-gray-700 font-bold rounded-xl text-sm hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isPurchasing}
                      className="flex-1 py-3 bg-gradient-to-r from-[#E31E24] via-[#F02828] to-[#FF6A00] text-white font-extrabold rounded-xl text-sm hover:shadow-lg active:scale-98 transition-all flex items-center justify-center gap-2 shadow-md shadow-red-500/20 disabled:opacity-50"
                    >
                      <FiLock className="text-sm" />{' '}
                      {isPurchasing
                        ? 'Connecting Razorpay...'
                        : `Pay ₹${(isCustom ? Number(customAmount) || 0 : selectedAmount).toLocaleString('en-IN')} Securely`}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* TAB: REDEEM VOUCHER */}
          {activeTab === 'redeem' && (
            <form onSubmit={handleRedeem} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
                  Enter 16-Digit Gift Voucher Code
                </label>
                <div className="relative">
                  <FiGift className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={redeemCode}
                    onChange={handleCodeChange}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 text-sm uppercase font-mono tracking-wider focus:outline-none placeholder:font-sans placeholder:normal-case"
                    placeholder="e.g. SF-GIFT-XXXX-XXXX-XXXX"
                    required
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-gray-500">
                  Redeemed balances are immediately credited to your SafeFire Wallet and can be used on any purchase or service.
                </p>
              </div>

              {/* Optional Partial Redemption Toggle */}
              <div className="bg-gray-50 rounded-2xl p-3.5 border border-gray-100 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-gray-800">Partial Redemption</span>
                    <p className="text-[11px] text-gray-500">Redeem only part of this voucher amount</p>
                  </div>
                  <input
                    type="checkbox"
                    id="partialToggle"
                    checked={isPartialRedeem}
                    onChange={(e) => setIsPartialRedeem(e.target.checked)}
                    className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500 cursor-pointer"
                  />
                </div>
                {isPartialRedeem && (
                  <div className="pt-1">
                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                      Amount to redeem (₹)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-xs">
                        ₹
                      </span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={redeemAmount}
                        onChange={(e) => setRedeemAmount(e.target.value)}
                        placeholder="e.g. 500"
                        className="w-full pl-7 pr-3 py-2 text-xs rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 font-semibold"
                      />
                    </div>
                    <span className="text-[10px] text-gray-400 mt-1 block">
                      Leaves remaining balance on the voucher for future redemption.
                    </span>
                  </div>
                )}
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 border border-gray-200 text-gray-700 font-bold rounded-xl text-sm hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRedeeming || !redeemCode.trim()}
                  className="flex-1 py-3 bg-gradient-to-r from-[#E31E24] to-[#FF6A00] text-white font-extrabold rounded-xl text-sm hover:shadow-lg active:scale-98 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-md shadow-red-500/20"
                >
                  <FiZap /> {isRedeeming ? 'Redeeming...' : 'Redeem to Wallet'}
                </button>
              </div>
            </form>
          )}

          {/* TAB: MY GIFT CARDS */}
          {activeTab === 'mycards' && (
            <div className="space-y-3">
              {myCards.length === 0 ? (
                <div className="text-center py-10 space-y-3 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                  <div className="w-12 h-12 bg-red-50 text-primary-600 rounded-2xl flex items-center justify-center mx-auto text-2xl shadow-sm border border-red-100">
                    <FiGift />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-800">No Gift Cards Found</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      You have not purchased or received any gift cards yet.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('buy')}
                    className="inline-flex items-center gap-1 text-xs text-primary-600 font-bold hover:underline"
                  >
                    Buy your first gift card &rarr;
                  </button>
                </div>
              ) : (
                myCards.map((card) => (
                  <div
                    key={card.id}
                    className="bg-gray-50 hover:bg-white rounded-2xl p-4 border border-gray-200/80 shadow-sm transition-all space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-base text-gray-900">
                          ₹{card.remainingBalance?.toLocaleString('en-IN')}
                        </span>
                        {card.remainingBalance !== card.initialAmount && (
                          <span className="text-xs text-gray-400 line-through">
                            ₹{card.initialAmount?.toLocaleString('en-IN')}
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                          card.status === 'ACTIVE'
                            ? 'bg-emerald-100 text-emerald-800'
                            : card.status === 'PARTIALLY_REDEEMED'
                            ? 'bg-amber-100 text-amber-800'
                            : card.status === 'FULLY_REDEEMED'
                            ? 'bg-gray-200 text-gray-700'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {card.status.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between bg-white px-3.5 py-2 rounded-xl border border-gray-200 font-mono text-xs">
                      <span className="font-black text-gray-800 tracking-wider">
                        {card.code || card.maskedCode}
                      </span>
                      {card.code && (
                        <button
                          type="button"
                          onClick={() => handleCopy(card.code)}
                          className="text-primary-600 hover:text-primary-700 font-sans text-xs flex items-center gap-1 font-bold bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg transition-colors"
                        >
                          {copiedCode === card.code ? <FiCheck /> : <FiCopy />}
                          {copiedCode === card.code ? 'Copied' : 'Copy'}
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-gray-500 pt-0.5">
                      <span>
                        {card.isBuyer ? `Sent to: ${card.recipientEmail}` : 'Received Voucher'}
                      </span>
                      <span>
                        Valid until: {card.expiresAt ? new Date(card.expiresAt).toLocaleDateString('en-IN') : 'N/A'}
                      </span>
                    </div>

                    {card.status !== 'FULLY_REDEEMED' && card.status !== 'CANCELLED' && (
                      <button
                        type="button"
                        onClick={() => {
                          setRedeemCode(card.code);
                          setActiveTab('redeem');
                        }}
                        className="w-full py-2 text-xs bg-red-50 text-primary-600 font-bold rounded-xl hover:bg-red-100 transition-colors flex items-center justify-center gap-1"
                      >
                        <FiZap size={12} /> Redeem this voucher to wallet &rarr;
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default GiftCardsModal;
