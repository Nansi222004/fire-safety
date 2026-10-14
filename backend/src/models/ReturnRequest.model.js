import mongoose from 'mongoose';
import { isOtpDebugEnabled } from '../config/otpConfig.js';

const returnRequestSchema = new mongoose.Schema(
    {
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', index: true },
        originalShipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment', index: true },
        reverseShipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment' },
        exchangeShipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment' },
        items: [
            {
                productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
                name: String,
                quantity: Number,
                reason: String,
            },
        ],
        requestType: {
            type: String,
            enum: ['return', 'exchange'],
            default: 'return',
            required: true,
            index: true,
        },
        exchangeDetails: {
            requestedVariant: {
                size: String,
                color: String,
                variantKey: String,
            },
            newProductPrice:   { type: Number },
            oldProductPrice:   { type: Number },
            priceDelta:        { type: Number }, // positive = customer owes extra; negative = customer gets refund
            priceDeltaStatus:  { type: String, enum: ['pending', 'collected', 'refunded', 'waived'], default: 'pending' },
            exchangePaymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentAttempt' },
        },
        evidenceImages: [
            {
                url: String,
                public_id: String,
            }
        ],
        returnReason: {
            type: String,
            enum: [
                "Wrong Size",
                "Wrong Color",
                "Received Wrong Variant",
                "Defective Product",
                "Wrong Product Received",
                "Product Damaged",
                "Quality Not As Expected",
                "Missing Parts or Accessories",
                "Product Not Matching Description",
                "Changed My Mind",
                "Other"
            ],
            required: true
        },
        customReason: {
            type: String,
            default: ""
        },
        status: {
            type: String,
            enum: [
                'pending',
                'approved',
                'pickup_pending',
                'pickup_assigned',
                'picked_up',
                'delivered_to_vendor',
                'replacement_preparing',
                'replacement_ready',
                'replacement_assigned',
                'out_for_delivery',
                'completed',
                'rejected'
            ],
            default: 'pending',
            index: true,
        },
        refundAmount: Number,
        refundStatus: { type: String, enum: ['pending', 'processed', 'failed'] },
        adminNote: String,
        rejectionReason: String,
        images: [String],
        deliveryBoyId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryBoy', index: true },
        deliveryAssignmentStatus: {
            type: String,
            enum: ['pending', 'assigned', 'accepted', 'failed'],
            default: 'pending',
            index: true,
        },
        rejectedDeliveryBoys: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryBoy' }],
        returnPickupOtpHash: { type: String, default: null },
        returnPickupOtpExpiresAt: { type: Date, default: null },
        returnPickupOtpAttempts: { type: Number, default: 0 },
        returnPickupOtpDebug: { type: String, default: null },
        returnPickupOtpVerified: { type: Boolean, default: false },
        riderPickupPhotos: [
            {
                url: String,
                public_id: String,
            }
        ],
        vendorHandoffOtpHash: { type: String, default: null },
        vendorHandoffOtpExpiresAt: { type: Date, default: null },
        vendorHandoffOtpAttempts: { type: Number, default: 0 },
        vendorHandoffOtpDebug: { type: String, default: null },
        vendorHandoffOtpVerified: { type: Boolean, default: false },
        
        vendorHandoverOtpHash: { type: String, default: null },
        vendorHandoverOtpExpiresAt: { type: Date, default: null },
        vendorHandoverOtpAttempts: { type: Number, default: 0 },
        vendorHandoverOtpDebug: { type: String, default: null },
        vendorHandoverOtpVerified: { type: Boolean, default: false },

        customerDeliveryOtpHash: { type: String, default: null },
        customerDeliveryOtpExpiresAt: { type: Date, default: null },
        customerDeliveryOtpAttempts: { type: Number, default: 0 },
        customerDeliveryOtpDebug: { type: String, default: null },
        customerDeliveryOtpVerified: { type: Boolean, default: false },
        returnPickupPayoutProcessed: { type: Boolean, default: false, index: true },
        returnPickupPayoutProcessedAt: Date,
        replacementPayoutProcessed: { type: Boolean, default: false, index: true },
        replacementPayoutProcessedAt: Date,
        refundDetails: {
            method:      { type: String, enum: ['bank', 'upi', 'wallet'] },
            bankDetails: {
                accountHolder: String,
                accountNumber: String,
                ifsc:          String,
                bankName:      String,
            },
            upiId: { type: String },
        },
        refundId: { type: mongoose.Schema.Types.ObjectId, ref: 'Refund' },
        statusHistory: [
            {
                status: { type: String, required: true },
                changedAt: { type: Date, default: Date.now },
                performedByRole: { type: String, enum: ['admin', 'vendor', 'delivery_partner', 'user', 'system'], required: true },
                performedById: { 
                    type: mongoose.Schema.Types.ObjectId, 
                    required: function() {
                        return this.performedByRole !== 'system';
                    }
                },
                performedByName: { type: String, required: true },
                notes: { type: String }
            }
        ],
    },
    { timestamps: true }
);

// ── OTP exposure rules ──────────────────────────────────────────────────────────────────────────────────────
// Each return/exchange OTP is shown (as …OtpDebug) to the party who OWNS it and must hand it over; the party who
// COLLECTS it must never receive it, and OTP hashes never leave the server.
//   returnPickupOtp      owner: customer → collected by the rider at pickup
//   customerDeliveryOtp  owner: customer → collected by the rider at replacement delivery
//   vendorHandoverOtp    owner: vendor   → collected by the rider at replacement pickup
//   vendorHandoffOtp     owner: rider    → collected by the vendor when returned items arrive
const OTP_OWNERS = {
    returnPickupOtpDebug: 'customer',
    customerDeliveryOtpDebug: 'customer',
    vendorHandoverOtpDebug: 'vendor',
    vendorHandoffOtpDebug: 'rider',
};

/** Removes OTP hashes (always). Used by the default toJSON/toObject output. */
export const stripReturnOtpSecrets = (ret) => {
    if (!ret || typeof ret !== 'object') return ret;
    for (const key of Object.keys(ret)) {
        if (key.endsWith('OtpHash')) delete ret[key];
    }
    return ret;
};

/**
 * Serializes a return request for one role: 'customer' | 'vendor' | 'rider' | 'admin'.
 * Admins (support) see every plain code. With OTP debugging enabled, vendors also see the rider's handoff code
 * (for testing); riders never receive codes they have to collect.
 */
export const toReturnRequestView = (doc, role) => {
    if (!doc) return doc;
    const view = typeof doc.toObject === 'function' ? doc.toObject({ transform: false }) : { ...doc };
    stripReturnOtpSecrets(view);
    if (role === 'admin') return view;
    for (const [field, owner] of Object.entries(OTP_OWNERS)) {
        const debugShare = role === 'vendor' && field === 'vendorHandoffOtpDebug' && isOtpDebugEnabled();
        if (owner !== role && !debugShare) delete view[field];
    }
    return view;
};

export const toRiderSafeReturnRequest = (doc) => toReturnRequestView(doc, 'rider');

const otpSafeTransform = (doc, ret) => stripReturnOtpSecrets(ret);
returnRequestSchema.set('toJSON', { transform: otpSafeTransform });
returnRequestSchema.set('toObject', { transform: otpSafeTransform });

const ReturnRequest = mongoose.model('ReturnRequest', returnRequestSchema);
export { ReturnRequest };
export default ReturnRequest;
