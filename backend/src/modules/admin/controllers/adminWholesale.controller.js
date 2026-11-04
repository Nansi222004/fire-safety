import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Vendor from '../../../models/Vendor.model.js';
import { createNotification } from '../../../services/notification.service.js';
import { queueVendorShiprocketPickupSync } from '../../../services/shiprocketPickup.service.js';

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const WHOLESALER_FIELDS = 'name storeName email phone storeLogo status isVerified address documents wholesaleCapability createdAt';

const findWholesaler = async (id) => {
    const wholesaler = await Vendor.findOne({ _id: id, accountType: 'wholesaler' });
    if (!wholesaler) throw new ApiError(404, 'Wholesaler not found.');
    return wholesaler;
};

const recordStatusChange = (wholesaler, newStatus, adminId, reason) => {
    if (wholesaler.status === newStatus) return;
    wholesaler.statusHistory = wholesaler.statusHistory || [];
    wholesaler.statusHistory.push({
        previousStatus: wholesaler.status,
        newStatus,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        reason: reason || undefined,
    });
    wholesaler.status = newStatus;
};

/**
 * @desc    List Wholesaler accounts by wholesale review status
 * @route   GET /api/admin/wholesale/applications?status=pending|approved|rejected|all&search=
 */
export const listWholesaleApplications = asyncHandler(async (req, res) => {
    const { status = 'pending', search = '' } = req.query;
    const allowed = new Set(['pending', 'approved', 'rejected']);

    const filter = allowed.has(status)
        ? { accountType: 'wholesaler', 'wholesaleCapability.status': status }
        : { accountType: 'wholesaler', 'wholesaleCapability.status': { $in: [...allowed] } };

    const trimmed = String(search || '').trim();
    if (trimmed) {
        const safeRegex = new RegExp(escapeRegex(trimmed), 'i');
        filter.$or = [
            { name: safeRegex },
            { email: safeRegex },
            { storeName: safeRegex },
            { 'wholesaleCapability.businessDetails.gstNumber': safeRegex },
        ];
    }

    const [vendors, counts] = await Promise.all([
        Vendor.find(filter).select(WHOLESALER_FIELDS).sort({ 'wholesaleCapability.appliedAt': -1 }).limit(200).lean(),
        Vendor.aggregate([
            { $match: { accountType: 'wholesaler', 'wholesaleCapability.status': { $in: [...allowed] } } },
            { $group: { _id: '$wholesaleCapability.status', count: { $sum: 1 } } },
        ]),
    ]);

    const stats = { pending: 0, approved: 0, rejected: 0 };
    counts.forEach((c) => { if (c._id in stats) stats[c._id] = c.count; });

    res.status(200).json(new ApiResponse(200, { vendors, stats }, 'Wholesaler applications fetched.'));
});

const notifyWholesaler = (wholesalerId, title, message) =>
    createNotification({
        recipientId: wholesalerId,
        recipientType: 'vendor',
        title,
        message,
        type: 'system',
        data: { link: '/wholesaler/dashboard' },
    }).catch(() => null);

/**
 * @desc    Approve a Wholesaler: activates the account (if still pending) and wholesale access together.
 * @route   POST /api/admin/wholesale/applications/:id/approve
 */
export const approveWholesale = asyncHandler(async (req, res) => {
    const wholesaler = await findWholesaler(req.params.id);
    if (wholesaler.status === 'suspended') {
        throw new ApiError(400, 'This wholesaler is suspended. Reactivate the account from the wholesaler details page first.');
    }

    const wasPending = wholesaler.status !== 'approved';
    recordStatusChange(wholesaler, 'approved', req.user.id);
    wholesaler.vendorCapabilities = { sellsProducts: false, providesServices: false, wholesaleEnabled: true };
    wholesaler.wholesaleCapability.status = 'approved';
    wholesaler.wholesaleCapability.reviewedBy = req.user.id;
    wholesaler.wholesaleCapability.reviewedAt = new Date();
    wholesaler.wholesaleCapability.rejectionReason = null;
    if (!wholesaler.wholesaleCapability.appliedAt) wholesaler.wholesaleCapability.appliedAt = new Date();
    await wholesaler.save();

    if (wasPending) queueVendorShiprocketPickupSync(wholesaler._id);

    notifyWholesaler(
        wholesaler._id,
        'Wholesaler Account Approved',
        'Your Wholesaler account is active. Add wholesale products from the Wholesaler portal, and use the same login on the SafeFire app to buy wholesale.'
    );

    res.status(200).json(new ApiResponse(200, {
        status: wholesaler.status,
        vendorCapabilities: wholesaler.vendorCapabilities,
        wholesaleCapability: wholesaler.wholesaleCapability,
    }, 'Wholesaler approved.'));
});

/**
 * @desc    Reject a pending Wholesaler application, or revoke wholesale access of an approved one.
 * @route   POST /api/admin/wholesale/applications/:id/reject
 */
export const rejectWholesale = asyncHandler(async (req, res) => {
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 5) throw new ApiError(400, 'A reason (at least 5 characters) is required.');

    const wholesaler = await findWholesaler(req.params.id);
    const wasApproved = wholesaler.wholesaleCapability?.status === 'approved';

    // A pending application is rejected as a whole; an approved account keeps its record but loses access.
    if (wholesaler.status === 'pending') recordStatusChange(wholesaler, 'rejected', req.user.id, reason);
    wholesaler.vendorCapabilities = { sellsProducts: false, providesServices: false, wholesaleEnabled: false };
    wholesaler.wholesaleCapability.status = 'rejected';
    wholesaler.wholesaleCapability.reviewedBy = req.user.id;
    wholesaler.wholesaleCapability.reviewedAt = new Date();
    wholesaler.wholesaleCapability.rejectionReason = reason;
    // Revoking access also ends the current portal session.
    wholesaler.refreshTokenHash = undefined;
    wholesaler.refreshTokenExpiresAt = undefined;
    await wholesaler.save();

    notifyWholesaler(
        wholesaler._id,
        wasApproved ? 'Wholesale Access Revoked' : 'Wholesaler Application Rejected',
        `Reason: ${reason}`
    );

    res.status(200).json(new ApiResponse(200, {
        status: wholesaler.status,
        vendorCapabilities: wholesaler.vendorCapabilities,
        wholesaleCapability: wholesaler.wholesaleCapability,
    }, wasApproved ? 'Wholesale access revoked.' : 'Wholesaler application rejected.'));
});
