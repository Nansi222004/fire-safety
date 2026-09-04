import crypto from 'crypto';
import mongoose from 'mongoose';
import GiftCard from '../models/GiftCard.model.js';
import GiftCardTransaction from '../models/GiftCardTransaction.model.js';
import User from '../models/User.model.js';
import { creditWallet, getWallet } from './wallet.service.js';
import { createRazorpayOrder, verifyPaymentSignature } from './payment.service.js';
import { createNotification } from './notification.service.js';
import { sendEmail } from './email.service.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';

// Configuration constants
export const ALLOWED_DENOMINATIONS = [500, 1000, 2500, 5000, 10000];
export const MIN_GIFT_CARD_AMOUNT = 100;
export const MAX_GIFT_CARD_AMOUNT = 50000;
export const DEFAULT_EXPIRY_DAYS = 365; // 1 Year validity

// Unambiguous character set (excludes 0, O, 1, I, L)
const VOUCHER_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/**
 * Generate cryptographically secure random voucher code
 * Output format: SF-GIFT-XXXX-XXXX-XXXX (12 random chars grouped in 3x4)
 */
export function generateVoucherCode() {
    const segments = [];
    for (let s = 0; s < 3; s++) {
        const bytes = crypto.randomBytes(4);
        let segment = '';
        for (let i = 0; i < 4; i++) {
            segment += VOUCHER_CHARS[bytes[i] % VOUCHER_CHARS.length];
        }
        segments.push(segment);
    }
    return `SF-GIFT-${segments.join('-')}`;
}

/**
 * Normalize voucher code and create SHA-256 hash for secure verification
 */
export function hashVoucherCode(code = '') {
    const normalized = String(code)
        .replace(/[^a-zA-Z0-9]/g, '')
        .toUpperCase();
    return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Mask voucher code for public/safe display
 * SF-GIFT-ABCD-EFGH-JKLM -> SF-GIFT-****-****-JKLM
 */
export function maskVoucherCode(code = '') {
    if (!code || typeof code !== 'string') return '';
    const parts = code.split('-');
    if (parts.length === 5) {
        return `${parts[0]}-${parts[1]}-****-****-${parts[4]}`;
    }
    const clean = code.trim();
    if (clean.length > 4) {
        return `SF-GIFT-****-****-${clean.slice(-4)}`;
    }
    return 'SF-GIFT-****';
}

/**
 * Check if MongoDB supports replica set transactions
 */
async function isReplicaSetSupported() {
    try {
        const adminDb = mongoose.connection.db.admin();
        const status = await adminDb.command({ replSetGetStatus: 1 }).catch(() => null);
        return Boolean(status && status.ok);
    } catch {
        return false;
    }
}

/**
 * 1. Create Gift Card Purchase Order (Razorpay Order creation)
 */
export async function createGiftCardOrder({
    userId,
    amount,
    recipientName = '',
    recipientEmail,
    recipientPhone = '',
    message = '',
    clientIp = '',
    userAgent = '',
}) {
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount < MIN_GIFT_CARD_AMOUNT || numAmount > MAX_GIFT_CARD_AMOUNT) {
        throw new ApiError(400, `Gift card amount must be between ₹${MIN_GIFT_CARD_AMOUNT} and ₹${MAX_GIFT_CARD_AMOUNT.toLocaleString('en-IN')}`);
    }

    if (!recipientEmail || typeof recipientEmail !== 'string' || !recipientEmail.includes('@')) {
        throw new ApiError(400, 'A valid recipient email address is required');
    }

    const purchaser = await User.findById(userId);
    if (!purchaser) {
        throw new ApiError(404, 'User account not found');
    }

    // Check if recipient is an existing user
    const recipientUser = await User.findOne({ email: recipientEmail.trim().toLowerCase() }).select('_id name email');

    // Generate unique code & hash
    let fullCode = '';
    let codeHash = '';
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
        fullCode = generateVoucherCode();
        codeHash = hashVoucherCode(fullCode);
        const existing = await GiftCard.findOne({ codeHash });
        if (!existing) isUnique = true;
        attempts++;
    }

    if (!isUnique) {
        throw new ApiError(500, 'Could not generate unique voucher code. Please try again.');
    }

    const maskedCode = maskVoucherCode(fullCode);

    // Create unique temporary receipt ID
    const receiptId = `gc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Create Razorpay order
    let rzpOrder;
    try {
        rzpOrder = await createRazorpayOrder(numAmount, 'INR', receiptId, {
            type: 'gift_card',
            purchasedBy: String(userId),
            recipientEmail: recipientEmail.trim().toLowerCase(),
            amount: String(numAmount),
        });
    } catch (rzpErr) {
        logger.error('[GiftCard Service] Razorpay order creation failed:', rzpErr.message);
        throw new ApiError(502, 'Payment gateway initialization failed. Please try again.');
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + DEFAULT_EXPIRY_DAYS);

    // Create pending GiftCard document
    const giftCard = await GiftCard.create({
        code: maskedCode,
        fullCode,
        codeHash,
        initialAmount: numAmount,
        remainingBalance: numAmount,
        currency: 'INR',
        status: 'PENDING_PAYMENT',
        purchasedBy: userId,
        purchasedByEmail: purchaser.email,
        recipientUserId: recipientUser ? recipientUser._id : null,
        recipientName: recipientName.trim(),
        recipientEmail: recipientEmail.trim().toLowerCase(),
        recipientPhone: recipientPhone.trim(),
        message: message.trim(),
        razorpayOrderId: rzpOrder.id,
        paymentStatus: 'pending',
        expiresAt,
    });

    // Record initial purchase audit transaction
    await GiftCardTransaction.create({
        giftCardId: giftCard._id,
        userId,
        type: 'PURCHASE',
        amount: numAmount,
        balanceBefore: 0,
        balanceAfter: numAmount,
        reference: `purchase_${giftCard._id}_${Date.now()}`,
        notes: `Gift Card checkout initiated for ₹${numAmount} (Order: ${rzpOrder.id})`,
        ipAddress: clientIp,
        userAgent,
    });

    return {
        giftCard: {
            id: giftCard._id,
            code: maskedCode,
            amount: numAmount,
            recipientEmail: giftCard.recipientEmail,
            recipientName: giftCard.recipientName,
            status: giftCard.status,
            expiresAt: giftCard.expiresAt,
        },
        razorpayOrder: {
            id: rzpOrder.id,
            amount: rzpOrder.amount,
            currency: rzpOrder.currency,
            key: process.env.RAZORPAY_KEY_ID,
        },
    };
}

/**
 * 2. Verify Razorpay Payment and Activate Gift Card (Idempotent)
 */
export async function verifyAndActivateGiftCard({
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    userId,
    clientIp = '',
    userAgent = '',
}) {
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        throw new ApiError(400, 'Missing payment verification parameters');
    }

    const giftCard = await GiftCard.findOne({ razorpayOrderId });
    if (!giftCard) {
        throw new ApiError(404, 'Gift card order not found');
    }

    // IDOR check: If userId provided, ensure purchaser matches
    if (userId && String(giftCard.purchasedBy) !== String(userId)) {
        throw new ApiError(403, 'Unauthorized access to this gift card order');
    }

    // Idempotency: If already active, return the existing active card
    if (giftCard.status === 'ACTIVE' && giftCard.paymentStatus === 'paid') {
        return {
            success: true,
            alreadyActive: true,
            giftCard: {
                id: giftCard._id,
                code: giftCard.fullCode,
                maskedCode: giftCard.code,
                amount: giftCard.initialAmount,
                remainingBalance: giftCard.remainingBalance,
                status: giftCard.status,
                recipientEmail: giftCard.recipientEmail,
                expiresAt: giftCard.expiresAt,
            },
        };
    }

    // Verify cryptographic HMAC signature
    const isValidSignature = verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!isValidSignature) {
        giftCard.paymentStatus = 'failed';
        await giftCard.save();
        throw new ApiError(400, 'Invalid payment signature. Payment verification failed.');
    }

    // Activate Gift Card
    const now = new Date();
    const expiresAt = new Date(now.getTime() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    giftCard.status = 'ACTIVE';
    giftCard.paymentStatus = 'paid';
    giftCard.razorpayPaymentId = razorpayPaymentId;
    giftCard.razorpaySignature = razorpaySignature;
    giftCard.activatedAt = now;
    giftCard.issuedAt = now;
    giftCard.expiresAt = expiresAt;

    // Check if recipient email matches an existing user
    if (!giftCard.recipientUserId) {
        const recipientUser = await User.findOne({ email: giftCard.recipientEmail }).select('_id');
        if (recipientUser) {
            giftCard.recipientUserId = recipientUser._id;
        }
    }

    await giftCard.save();

    // Create ACTIVATION audit transaction
    await GiftCardTransaction.create({
        giftCardId: giftCard._id,
        userId: giftCard.purchasedBy,
        type: 'ACTIVATION',
        amount: giftCard.initialAmount,
        balanceBefore: giftCard.initialAmount,
        balanceAfter: giftCard.initialAmount,
        reference: `activate_${giftCard._id}_${Date.now()}`,
        notes: `Payment verified via Razorpay (${razorpayPaymentId}). Gift Card activated.`,
        ipAddress: clientIp,
        userAgent,
    });

    // Send notifications to Purchaser & Recipient
    try {
        // Notification to Buyer (uses masked code for push notification safety)
        await createNotification({
            recipientId: giftCard.purchasedBy,
            recipientType: 'user',
            title: '🎁 SafeFire Gift Card Activated',
            message: `Your ₹${giftCard.initialAmount.toLocaleString('en-IN')} e-Gift Card has been sent to ${giftCard.recipientEmail}. Voucher Code: ${giftCard.code}`,
            type: 'system',
            data: {
                giftCardId: String(giftCard._id),
                amount: String(giftCard.initialAmount),
                code: giftCard.code,
                link: '/profile',
            },
        });

        // Email to Buyer (secure delivery of full code)
        sendEmail({
            to: giftCard.purchasedByEmail,
            subject: '🎁 Your SafeFire e-Gift Card Purchase Confirmation',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #E31E24, #1F1F1F); padding: 24px; color: white; text-align: center;">
                        <h1 style="margin: 0; font-size: 24px;">SafeFire e-Gift Card</h1>
                        <p style="margin: 4px 0 0 0; opacity: 0.9;">Purchase Confirmed</p>
                    </div>
                    <div style="padding: 24px; background: #fafafa;">
                        <p>Hello,</p>
                        <p>Your SafeFire e-Gift Card of <strong>₹${giftCard.initialAmount.toLocaleString('en-IN')}</strong> has been activated and sent to <strong>${giftCard.recipientEmail}</strong>.</p>
                        <div style="background: #ffffff; border: 2px dashed #E31E24; border-radius: 8px; padding: 16px; text-align: center; margin: 20px 0;">
                            <span style="font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 1px;">Voucher Code</span><br/>
                            <strong style="font-size: 20px; font-family: monospace; color: #E31E24; letter-spacing: 2px;">${giftCard.fullCode}</strong>
                        </div>
                        <p style="font-size: 13px; color: #777;">Valid until: ${expiresAt.toLocaleDateString('en-IN')}</p>
                    </div>
                </div>
            `,
            text: `Your SafeFire Gift Card of ₹${giftCard.initialAmount} is active. Voucher code: ${giftCard.fullCode}. Sent to ${giftCard.recipientEmail}.`,
        }).catch((err) => logger.warn('[GiftCard Email Buyer Error]', err.message));

        // If recipient user exists, send in-app/push notification (uses masked code for push privacy)
        if (giftCard.recipientUserId) {
            await createNotification({
                recipientId: giftCard.recipientUserId,
                recipientType: 'user',
                title: '🎁 You Received a SafeFire Gift Card!',
                message: `You received a ₹${giftCard.initialAmount.toLocaleString('en-IN')} SafeFire Gift Card from ${giftCard.purchasedByEmail}! Voucher Code: ${giftCard.code}`,
                type: 'system',
                data: {
                    giftCardId: String(giftCard._id),
                    amount: String(giftCard.initialAmount),
                    code: giftCard.code,
                    link: '/profile',
                },
            });
        }

        // Email to Recipient
        sendEmail({
            to: giftCard.recipientEmail,
            subject: `🎁 You received a ₹${giftCard.initialAmount.toLocaleString('en-IN')} SafeFire Gift Card!`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #E31E24, #FF6A00); padding: 24px; color: white; text-align: center;">
                        <h1 style="margin: 0; font-size: 24px;">SafeFire e-Gift Card</h1>
                        <p style="margin: 4px 0 0 0; opacity: 0.9;">A special gift for you</p>
                    </div>
                    <div style="padding: 24px; background: #fafafa;">
                        <p>Hi ${giftCard.recipientName || 'there'},</p>
                        <p><strong>${giftCard.purchasedByEmail}</strong> has sent you a SafeFire e-Gift Card worth <strong>₹${giftCard.initialAmount.toLocaleString('en-IN')}</strong>!</p>
                        ${giftCard.message ? `<blockquote style="background: #fff3e0; border-left: 4px solid #FF6A00; padding: 12px; margin: 16px 0; font-style: italic;">"${giftCard.message}"</blockquote>` : ''}
                        <div style="background: #ffffff; border: 2px dashed #E31E24; border-radius: 8px; padding: 16px; text-align: center; margin: 20px 0;">
                            <span style="font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 1px;">Your 16-Digit Voucher Code</span><br/>
                            <strong style="font-size: 20px; font-family: monospace; color: #E31E24; letter-spacing: 2px;">${giftCard.fullCode}</strong>
                        </div>
                        <p>To redeem: Log in to your SafeFire account, go to <strong>Profile &rarr; Gift Cards & Vouchers</strong>, enter your voucher code, and click <strong>Redeem to Wallet</strong>.</p>
                        <p style="font-size: 13px; color: #777;">Valid until: ${expiresAt.toLocaleDateString('en-IN')}</p>
                    </div>
                </div>
            `,
            text: `You received a ₹${giftCard.initialAmount} SafeFire Gift Card from ${giftCard.purchasedByEmail}. Code: ${giftCard.fullCode}. Redeem it to your wallet at SafeFire!`,
        }).catch((err) => logger.warn('[GiftCard Email Recipient Error]', err.message));
    } catch (notifErr) {
        logger.error('[GiftCard Activation Notification Error]', notifErr.message);
    }

    return {
        success: true,
        giftCard: {
            id: giftCard._id,
            code: giftCard.fullCode,
            maskedCode: giftCard.code,
            amount: giftCard.initialAmount,
            remainingBalance: giftCard.remainingBalance,
            status: giftCard.status,
            recipientEmail: giftCard.recipientEmail,
            expiresAt: giftCard.expiresAt,
        },
    };
}

/**
 * 3. Redeem Gift Card to User Wallet (Atomic & Concurrency-Safe)
 */
export async function redeemGiftCard({
    userId,
    code,
    amountToRedeem,
    clientIp = '',
    userAgent = '',
}) {
    if (!userId) {
        throw new ApiError(401, 'Authentication required to redeem a gift card.');
    }

    if (!code || typeof code !== 'string' || code.trim().length < 8) {
        throw new ApiError(400, 'A valid gift card / voucher code is required.');
    }

    const codeHash = hashVoucherCode(code);
    const user = await User.findById(userId);
    if (!user) {
        throw new ApiError(404, 'User account not found.');
    }

    // Query card by codeHash
    const card = await GiftCard.findOne({ codeHash });
    if (!card) {
        throw new ApiError(404, 'Invalid gift voucher code. Please check and try again.');
    }

    // Expiry check (with atomic state transition & EXPIRY audit transaction)
    if (card.expiresAt && new Date(card.expiresAt) < new Date()) {
        if (card.status !== 'EXPIRED') {
            const balanceBefore = card.remainingBalance;
            const updated = await GiftCard.findOneAndUpdate(
                { _id: card._id, status: { $ne: 'EXPIRED' } },
                { $set: { status: 'EXPIRED' } },
                { new: true }
            );
            if (updated) {
                await GiftCardTransaction.create({
                    giftCardId: card._id,
                    userId,
                    type: 'EXPIRY',
                    amount: balanceBefore,
                    balanceBefore,
                    balanceAfter: balanceBefore,
                    reference: `lazy_expire_${card._id}_${Date.now()}`,
                    notes: `Gift Card expired on redemption attempt (${card.expiresAt.toISOString()})`,
                    ipAddress: clientIp,
                    userAgent,
                }).catch((e) => logger.warn('[GiftCard Lazy Expiry Audit Error]', e.message));
            }
        }
        throw new ApiError(400, 'This gift voucher has expired and is no longer valid.');
    }

    // Status check
    if (card.status === 'PENDING_PAYMENT') {
        throw new ApiError(400, 'This gift card payment has not been completed or activated yet.');
    }

    if (card.status === 'FULLY_REDEEMED' || card.remainingBalance <= 0) {
        throw new ApiError(400, 'This gift voucher has already been fully redeemed.');
    }

    if (card.status === 'CANCELLED') {
        throw new ApiError(400, 'This gift voucher has been cancelled and cannot be redeemed.');
    }

    if (card.status !== 'ACTIVE' && card.status !== 'PARTIALLY_REDEEMED') {
        throw new ApiError(400, `Gift voucher is not in a redeemable status (${card.status}).`);
    }

    // Calculate redemption amount (support full or partial)
    let redeemAmount = card.remainingBalance;
    if (amountToRedeem !== undefined && amountToRedeem !== null && amountToRedeem !== '') {
        const parsed = Number(amountToRedeem);
        if (isNaN(parsed) || parsed <= 0) {
            throw new ApiError(400, 'Redemption amount must be greater than zero.');
        }
        if (parsed > card.remainingBalance) {
            throw new ApiError(400, `Requested amount (₹${parsed}) exceeds available voucher balance (₹${card.remainingBalance}).`);
        }
        redeemAmount = parsed;
    }
    redeemAmount = Number(redeemAmount.toFixed(2));

    const reference = `gc_redeem_${card._id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const hasReplicaSet = await isReplicaSetSupported();

    let updatedCard;
    let walletResult;

    if (hasReplicaSet) {
        // Multi-document MongoDB Transaction Session
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                // Atomic conditional findOneAndUpdate within session
                const atomicCard = await GiftCard.findOneAndUpdate(
                    {
                        _id: card._id,
                        status: { $in: ['ACTIVE', 'PARTIALLY_REDEEMED'] },
                        remainingBalance: { $gte: redeemAmount },
                        expiresAt: { $gt: new Date() },
                    },
                    [
                        {
                            $set: {
                                remainingBalance: { $round: [{ $subtract: ['$remainingBalance', redeemAmount] }, 2] },
                                lastUsedAt: new Date(),
                                redeemedBy: userId,
                                status: {
                                    $cond: {
                                        if: { $eq: [{ $round: [{ $subtract: ['$remainingBalance', redeemAmount] }, 2] }, 0] },
                                        then: 'FULLY_REDEEMED',
                                        else: 'PARTIALLY_REDEEMED',
                                    },
                                },
                            },
                        },
                    ],
                    { session, new: true }
                );

                if (!atomicCard) {
                    throw new ApiError(409, 'Voucher balance changed or was redeemed by another request. Please retry.');
                }

                updatedCard = atomicCard;

                // Credit UserWallet
                walletResult = await creditWallet(
                    userId,
                    redeemAmount,
                    'gift_card_redemption',
                    {
                        reference,
                        giftCardId: card._id,
                        description: `Redeemed Gift Voucher ${card.code}`,
                    },
                    session
                );

                // Create GiftCardTransaction audit
                await GiftCardTransaction.create(
                    [
                        {
                            giftCardId: card._id,
                            userId,
                            type: updatedCard.status === 'FULLY_REDEEMED' ? 'REDEMPTION' : 'PARTIAL_REDEMPTION',
                            amount: redeemAmount,
                            balanceBefore: card.remainingBalance,
                            balanceAfter: updatedCard.remainingBalance,
                            walletTransactionId: walletResult.transaction?._id,
                            reference,
                            notes: `Redeemed ₹${redeemAmount} to wallet. Remaining balance: ₹${updatedCard.remainingBalance}`,
                            ipAddress: clientIp,
                            userAgent,
                        },
                    ],
                    { session }
                );
            });
        } finally {
            await session.endSession();
        }
    } else {
        // Atomic Conditional Document Update (guaranteed single-document atomic in Standalone Mongo)
        const atomicCard = await GiftCard.findOneAndUpdate(
            {
                _id: card._id,
                status: { $in: ['ACTIVE', 'PARTIALLY_REDEEMED'] },
                remainingBalance: { $gte: redeemAmount },
                expiresAt: { $gt: new Date() },
            },
            [
                {
                    $set: {
                        remainingBalance: { $round: [{ $subtract: ['$remainingBalance', redeemAmount] }, 2] },
                        lastUsedAt: new Date(),
                        redeemedBy: userId,
                        status: {
                            $cond: {
                                if: { $eq: [{ $round: [{ $subtract: ['$remainingBalance', redeemAmount] }, 2] }, 0] },
                                then: 'FULLY_REDEEMED',
                                else: 'PARTIALLY_REDEEMED',
                            },
                        },
                    },
                },
            ],
            { new: true }
        );

        if (!atomicCard) {
            throw new ApiError(409, 'Voucher balance changed or was redeemed concurrently. Please try again.');
        }

        updatedCard = atomicCard;

        try {
            // Credit UserWallet
            walletResult = await creditWallet(
                userId,
                redeemAmount,
                'gift_card_redemption',
                {
                    reference,
                    giftCardId: card._id,
                    description: `Redeemed Gift Voucher ${card.code}`,
                }
            );

            // Create GiftCardTransaction audit
            await GiftCardTransaction.create({
                giftCardId: card._id,
                userId,
                type: updatedCard.status === 'FULLY_REDEEMED' ? 'REDEMPTION' : 'PARTIAL_REDEMPTION',
                amount: redeemAmount,
                balanceBefore: card.remainingBalance,
                balanceAfter: updatedCard.remainingBalance,
                walletTransactionId: walletResult.transaction?._id,
                reference,
                notes: `Redeemed ₹${redeemAmount} to wallet. Remaining balance: ₹${updatedCard.remainingBalance}`,
                ipAddress: clientIp,
                userAgent,
            });
        } catch (creditErr) {
            // Compensating rollback on standalone MongoDB in case wallet credit fails
            logger.error('[GiftCard Standalone Compensating Rollback]', creditErr.message);
            await GiftCard.findByIdAndUpdate(card._id, {
                remainingBalance: card.remainingBalance,
                status: card.status,
            });
            throw creditErr;
        }
    }

    // Trigger in-app notification
    createNotification({
        recipientId: userId,
        recipientType: 'user',
        title: '🎁 Gift Voucher Redeemed!',
        message: `₹${redeemAmount.toLocaleString('en-IN')} has been added to your SafeFire Wallet balance. Voucher: ${card.code}`,
        type: 'payment',
        data: {
            giftCardId: String(card._id),
            amount: String(redeemAmount),
            link: '/wallet',
        },
    }).catch((err) => logger.warn('[GiftCard Redeem Notification Error]', err.message));

    return {
        success: true,
        redeemedAmount: redeemAmount,
        remainingBalance: updatedCard.remainingBalance,
        status: updatedCard.status,
        newWalletBalance: walletResult?.wallet?.balance || 0,
        transactionId: walletResult?.transaction?._id,
    };
}

/**
 * 4. Get Customer's Gift Cards (Purchased & Received)
 */
export async function getMyGiftCards({ userId, page = 1, limit = 20 }) {
    if (!userId) {
        throw new ApiError(401, 'Authentication required');
    }

    const user = await User.findById(userId).select('email');
    if (!user) {
        throw new ApiError(404, 'User account not found');
    }

    const query = {
        $or: [
            { purchasedBy: userId },
            { recipientUserId: userId },
            { recipientEmail: user.email.toLowerCase() },
        ],
        status: { $ne: 'PENDING_PAYMENT' },
    };

    const skip = (page - 1) * limit;

    const [cards, total] = await Promise.all([
        GiftCard.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('purchasedBy', 'name email')
            .lean(),
        GiftCard.countDocuments(query),
    ]);

    // Format cards: show fullCode only to authorized purchaser or recipient
    const formatted = cards.map((c) => {
        const isBuyer = String(c.purchasedBy?._id || c.purchasedBy) === String(userId);
        const isRecipient =
            String(c.recipientUserId) === String(userId) ||
            c.recipientEmail?.toLowerCase() === user.email.toLowerCase();

        return {
            id: c._id,
            code: isBuyer || isRecipient ? c.fullCode : c.code,
            maskedCode: c.code,
            initialAmount: c.initialAmount,
            remainingBalance: c.remainingBalance,
            currency: c.currency,
            status: c.status,
            recipientName: c.recipientName,
            recipientEmail: c.recipientEmail,
            message: c.message,
            expiresAt: c.expiresAt,
            issuedAt: c.issuedAt || c.createdAt,
            isBuyer,
            isRecipient,
        };
    });

    return {
        cards: formatted,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
    };
}

/**
 * 5. Get Customer's Available Voucher Balance Summary
 */
export async function getGiftCardSummary({ userId }) {
    if (!userId) {
        throw new ApiError(401, 'Authentication required');
    }

    const user = await User.findById(userId).select('email');
    if (!user) {
        throw new ApiError(404, 'User account not found');
    }

    const activeCards = await GiftCard.find({
        $or: [
            { purchasedBy: userId },
            { recipientUserId: userId },
            { recipientEmail: user.email.toLowerCase() },
        ],
        status: { $in: ['ACTIVE', 'PARTIALLY_REDEEMED'] },
        expiresAt: { $gt: new Date() },
    }).lean();

    const totalAvailableBalance = activeCards.reduce((sum, c) => sum + (c.remainingBalance || 0), 0);

    return {
        totalAvailableBalance: Number(totalAvailableBalance.toFixed(2)),
        activeCardsCount: activeCards.length,
    };
}

/**
 * 6. Admin: List All Gift Cards with Search, Filter & Pagination
 */
export async function getAdminGiftCards({
    page = 1,
    limit = 20,
    status,
    search,
    startDate,
    endDate,
}) {
    const query = {};

    if (status && status !== 'ALL') {
        query.status = status;
    }

    if (search && search.trim()) {
        const s = search.trim();
        query.$or = [
            { code: { $regex: s, $options: 'i' } },
            { fullCode: { $regex: s, $options: 'i' } },
            { purchasedByEmail: { $regex: s, $options: 'i' } },
            { recipientEmail: { $regex: s, $options: 'i' } },
            { recipientName: { $regex: s, $options: 'i' } },
            { razorpayOrderId: { $regex: s, $options: 'i' } },
            { razorpayPaymentId: { $regex: s, $options: 'i' } },
        ];
    }

    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    const skip = (page - 1) * limit;

    const [cards, total, metrics] = await Promise.all([
        GiftCard.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('purchasedBy', 'name email phone')
            .populate('redeemedBy', 'name email')
            .lean(),
        GiftCard.countDocuments(query),
        GiftCard.aggregate([
            {
                $group: {
                    _id: null,
                    totalIssuedAmount: {
                        $sum: { $cond: [{ $ne: ['$status', 'PENDING_PAYMENT'] }, '$initialAmount', 0] },
                    },
                    totalRemainingActiveBalance: {
                        $sum: {
                            $cond: [{ $in: ['$status', ['ACTIVE', 'PARTIALLY_REDEEMED']] }, '$remainingBalance', 0],
                        },
                    },
                    totalRedeemedAmount: {
                        $sum: {
                            $cond: [
                                { $in: ['$status', ['ACTIVE', 'PARTIALLY_REDEEMED', 'FULLY_REDEEMED']] },
                                { $subtract: ['$initialAmount', '$remainingBalance'] },
                                0,
                            ],
                        },
                    },
                    totalCards: { $sum: 1 },
                    activeCards: {
                        $sum: { $cond: [{ $in: ['$status', ['ACTIVE', 'PARTIALLY_REDEEMED']] }, 1, 0] },
                    },
                    fullyRedeemedCards: {
                        $sum: { $cond: [{ $eq: ['$status', 'FULLY_REDEEMED'] }, 1, 0] },
                    },
                    expiredCards: {
                        $sum: { $cond: [{ $eq: ['$status', 'EXPIRED'] }, 1, 0] },
                    },
                },
            },
        ]),
    ]);

    const stats = metrics[0] || {
        totalIssuedAmount: 0,
        totalRemainingActiveBalance: 0,
        totalRedeemedAmount: 0,
        totalCards: 0,
        activeCards: 0,
        fullyRedeemedCards: 0,
        expiredCards: 0,
    };

    return {
        cards,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        metrics: stats,
    };
}

/**
 * 6b. Admin: Get Aggregate Gift Card Metrics Summary
 */
export async function getAdminMetricsSummary() {
    const metrics = await GiftCard.aggregate([
        {
            $group: {
                _id: null,
                totalIssuedAmount: {
                    $sum: { $cond: [{ $ne: ['$status', 'PENDING_PAYMENT'] }, '$initialAmount', 0] },
                },
                activeBalance: {
                    $sum: {
                        $cond: [{ $in: ['$status', ['ACTIVE', 'PARTIALLY_REDEEMED']] }, '$remainingBalance', 0],
                    },
                },
                totalRemainingActiveBalance: {
                    $sum: {
                        $cond: [{ $in: ['$status', ['ACTIVE', 'PARTIALLY_REDEEMED']] }, '$remainingBalance', 0],
                    },
                },
                totalRedeemedAmount: {
                    $sum: {
                        $cond: [
                            { $in: ['$status', ['ACTIVE', 'PARTIALLY_REDEEMED', 'FULLY_REDEEMED']] },
                            { $subtract: ['$initialAmount', '$remainingBalance'] },
                            0,
                        ],
                    },
                },
                expiredAmount: {
                    $sum: { $cond: [{ $eq: ['$status', 'EXPIRED'] }, '$initialAmount', 0] },
                },
                cancelledAmount: {
                    $sum: { $cond: [{ $eq: ['$status', 'CANCELLED'] }, '$initialAmount', 0] },
                },
                totalCards: { $sum: 1 },
                activeCards: {
                    $sum: { $cond: [{ $in: ['$status', ['ACTIVE', 'PARTIALLY_REDEEMED']] }, 1, 0] },
                },
                fullyRedeemedCards: {
                    $sum: { $cond: [{ $eq: ['$status', 'FULLY_REDEEMED'] }, 1, 0] },
                },
                expiredCards: {
                    $sum: { $cond: [{ $eq: ['$status', 'EXPIRED'] }, 1, 0] },
                },
                cancelledCards: {
                    $sum: { $cond: [{ $eq: ['$status', 'CANCELLED'] }, 1, 0] },
                },
            },
        },
    ]);

    const stats = metrics[0] || {
        totalIssuedAmount: 0,
        activeBalance: 0,
        totalRemainingActiveBalance: 0,
        totalRedeemedAmount: 0,
        expiredAmount: 0,
        cancelledAmount: 0,
        totalCards: 0,
        activeCards: 0,
        fullyRedeemedCards: 0,
        expiredCards: 0,
        cancelledCards: 0,
    };

    return {
        metrics: stats,
    };
}

/**
 * 7. Admin: Get Single Gift Card Details with Full Audit Timeline
 */
export async function getAdminGiftCardById(cardId) {
    if (!mongoose.Types.ObjectId.isValid(cardId)) {
        throw new ApiError(400, 'Invalid gift card ID format');
    }

    const card = await GiftCard.findById(cardId)
        .populate('purchasedBy', 'name email phone avatar')
        .populate('redeemedBy', 'name email phone')
        .populate('recipientUserId', 'name email phone')
        .lean();

    if (!card) {
        throw new ApiError(404, 'Gift card not found');
    }

    const transactions = await GiftCardTransaction.find({ giftCardId: cardId })
        .sort({ createdAt: -1 })
        .populate('userId', 'name email')
        .populate('walletTransactionId')
        .lean();

    return {
        ...card,
        transactions,
    };
}

/**
 * 8. Admin: Cancel an Unredeemed Active Gift Card
 */
export async function cancelGiftCard({ cardId, adminId, reason = '', clientIp = '', userAgent = '' }) {
    if (!mongoose.Types.ObjectId.isValid(cardId)) {
        throw new ApiError(400, 'Invalid gift card ID format');
    }

    const card = await GiftCard.findById(cardId);
    if (!card) {
        throw new ApiError(404, 'Gift card not found');
    }

    if (card.status === 'FULLY_REDEEMED') {
        throw new ApiError(400, 'Cannot cancel a gift card that has already been fully redeemed');
    }

    if (card.status === 'CANCELLED') {
        throw new ApiError(400, 'This gift card is already cancelled');
    }

    const balanceBefore = card.remainingBalance;
    card.status = 'CANCELLED';
    card.remainingBalance = 0;
    await card.save();

    await GiftCardTransaction.create({
        giftCardId: card._id,
        userId: adminId,
        type: 'CANCELLATION',
        amount: balanceBefore,
        balanceBefore,
        balanceAfter: 0,
        reference: `cancel_${card._id}_${Date.now()}`,
        notes: `Admin cancellation. Reason: ${reason || 'Administrative action'}`,
        ipAddress: clientIp,
        userAgent,
    });

    return {
        success: true,
        message: 'Gift card cancelled successfully',
        giftCard: card,
    };
}

/**
 * 9. Scheduled / Cron: Expire Overdue Gift Cards
 */
export async function expireOverdueGiftCards() {
    const now = new Date();
    const overdueCards = await GiftCard.find({
        status: { $in: ['ACTIVE', 'PARTIALLY_REDEEMED'] },
        expiresAt: { $lt: now },
    });

    let expiredCount = 0;
    for (const card of overdueCards) {
        const balanceBefore = card.remainingBalance;
        card.status = 'EXPIRED';
        await card.save();

        await GiftCardTransaction.create({
            giftCardId: card._id,
            type: 'EXPIRY',
            amount: balanceBefore,
            balanceBefore,
            balanceAfter: balanceBefore,
            reference: `expire_${card._id}_${Date.now()}`,
            notes: `Gift Card expired on ${now.toISOString()}`,
        });
        expiredCount++;
    }

    if (expiredCount > 0) {
        logger.info(`[GiftCard Expiry Scanner] Marked ${expiredCount} overdue gift card(s) as EXPIRED.`);
    }

    return expiredCount;
}

export default {
    ALLOWED_DENOMINATIONS,
    MIN_GIFT_CARD_AMOUNT,
    MAX_GIFT_CARD_AMOUNT,
    generateVoucherCode,
    hashVoucherCode,
    maskVoucherCode,
    createGiftCardOrder,
    verifyAndActivateGiftCard,
    redeemGiftCard,
    getMyGiftCards,
    getGiftCardSummary,
    getAdminGiftCards,
    getAdminMetricsSummary,
    getAdminGiftCardById,
    cancelGiftCard,
    expireOverdueGiftCards,
};
