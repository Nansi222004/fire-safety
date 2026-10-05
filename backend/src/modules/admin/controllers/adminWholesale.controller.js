import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Vendor from '../../../models/Vendor.model.js';
import { createNotification } from '../../../services/notification.service.js';

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const VENDOR_FIELDS = 'name storeName email phone storeLogo status vendorCapabilities serviceCapability.status wholesaleCapability createdAt';

/**
 * @desc    List vendors by wholesale capability status
 * @route   GET /api/admin/wholesale/applications?status=pending|approved|rejected|all&search=
 */
export const listWholesaleApplications = asyncHandler(async (req, res) => {
    const { status = 'pending', search = '' } = req.query;
    const allowed = new Set(['pending', 'approved', 'rejected']);

    const filter = allowed.has(status)
        ? { 'wholesaleCapability.status': status }
        : { 'wholesaleCapability.status': { $in: [...allowed] } };

    const trimmed = String(search || '').trim();
    if (trimmed) {
        const safeRegex = new RegExp(escapeRegex(trimmed), 'i');
        filter.$or = [{ name: safeRegex }, { email: safeRegex }, { storeName: safeRegex }];
    }

    const [vendors, counts] = await Promise.all([
        Vendor.find(filter).select(VENDOR_FIELDS).sort({ 'wholesaleCapability.appliedAt': -1 }).limit(200).lean(),
        Vendor.aggregate([
            { $match: { 'wholesaleCapability.status': { $in: [...allowed] } } },
            { $group: { _id: '$wholesaleCapability.status', count: { $sum: 1 } } },
        ]),
    ]);

    const stats = { pending: 0, approved: 0, rejected: 0 };
    counts.forEach((c) => { if (c._id in stats) stats[c._id] = c.count; });

    res.status(200).json(new ApiResponse(200, { vendors, stats }, 'Wholesale applications fetched.'));
});

const notifyVendor = (vendorId, title, message) =>
    createNotification({
        recipientId: vendorId,
        recipientType: 'vendor',
        title,
        message,
        type: 'system',
        data: { link: '/vendor/wholesale/products' },
    }).catch(() => null);

/**
 * @desc    Approve wholesale capability → wholesaleEnabled = true.
 *          Does NOT touch sellsProducts / providesServices / serviceCapability.
 * @route   POST /api/admin/wholesale/applications/:id/approve
 */
export const approveWholesale = asyncHandler(async (req, res) => {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) throw new ApiError(404, 'Vendor not found.');
    if (vendor.status !== 'approved') {
        throw new ApiError(400, 'Only approved vendor accounts can be granted wholesale capability.');
    }

    vendor.vendorCapabilities = vendor.vendorCapabilities || { sellsProducts: true, providesServices: false };
    vendor.vendorCapabilities.wholesaleEnabled = true;
    vendor.wholesaleCapability = vendor.wholesaleCapability || {};
    vendor.wholesaleCapability.status = 'approved';
    vendor.wholesaleCapability.reviewedBy = req.user.id;
    vendor.wholesaleCapability.reviewedAt = new Date();
    vendor.wholesaleCapability.rejectionReason = null;
    if (!vendor.wholesaleCapability.appliedAt) vendor.wholesaleCapability.appliedAt = new Date();
    await vendor.save();

    notifyVendor(
        vendor._id,
        'Wholesale/B2B Approved',
        'Your Wholesale/B2B capability is now active. Switch to Wholesale mode in your dashboard to manage wholesale products.'
    );

    res.status(200).json(new ApiResponse(200, {
        vendorCapabilities: vendor.vendorCapabilities,
        wholesaleCapability: vendor.wholesaleCapability,
    }, 'Wholesale capability approved.'));
});

/**
 * @desc    Reject a pending application, or revoke an approved wholesale capability.
 * @route   POST /api/admin/wholesale/applications/:id/reject
 */
export const rejectWholesale = asyncHandler(async (req, res) => {
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 5) throw new ApiError(400, 'A reason (at least 5 characters) is required.');

    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) throw new ApiError(404, 'Vendor not found.');
    const currentStatus = vendor.wholesaleCapability?.status || 'none';
    if (currentStatus === 'none') throw new ApiError(400, 'This vendor has not applied for wholesale capability.');

    vendor.vendorCapabilities = vendor.vendorCapabilities || { sellsProducts: true, providesServices: false };
    vendor.vendorCapabilities.wholesaleEnabled = false;
    vendor.wholesaleCapability.status = 'rejected';
    vendor.wholesaleCapability.reviewedBy = req.user.id;
    vendor.wholesaleCapability.reviewedAt = new Date();
    vendor.wholesaleCapability.rejectionReason = reason;
    await vendor.save();

    notifyVendor(
        vendor._id,
        currentStatus === 'approved' ? 'Wholesale/B2B Revoked' : 'Wholesale/B2B Application Rejected',
        `Reason: ${reason}`
    );

    res.status(200).json(new ApiResponse(200, {
        vendorCapabilities: vendor.vendorCapabilities,
        wholesaleCapability: vendor.wholesaleCapability,
    }, currentStatus === 'approved' ? 'Wholesale capability revoked.' : 'Wholesale application rejected.'));
});
