import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Vendor from '../../../models/Vendor.model.js';
import Commission from '../../../models/Commission.model.js';
import VendorDocument from '../../../models/VendorDocument.model.js';
import Notification from '../../../models/Notification.model.js';
import Product from '../../../models/Product.model.js';
import Order from '../../../models/Order.model.js';
import Shipment from '../../../models/Shipment.model.js';
import ReturnRequest from '../../../models/ReturnRequest.model.js';
import Settlement from '../../../models/Settlement.model.js';
import Withdrawal from '../../../models/Withdrawal.model.js';
import VendorWalletTransaction from '../../../models/VendorWalletTransaction.model.js';
import VendorService from '../../../models/VendorService.model.js';
import ServiceBooking from '../../../models/ServiceBooking.model.js';
import { sendEmail } from '../../../services/email.service.js';
import { createNotification } from '../../../services/notification.service.js';
import { queueVendorShiprocketPickupSync, syncVendorShiprocketPickup } from '../../../services/shiprocketPickup.service.js';

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toApiVendor = (vendorDoc) => {
    const vendor = typeof vendorDoc?.toObject === 'function'
        ? vendorDoc.toObject()
        : (vendorDoc || {});

    const normalizedId = vendor?._id ? String(vendor._id) : String(vendor?.id || '');
    const normalizedCommissionRate = Number(vendor.commissionRate);
    return {
        ...vendor,
        id: normalizedId,
        vendorCapabilities: vendor.vendorCapabilities || { sellsProducts: true, providesServices: false },
        commissionRate: Number.isFinite(normalizedCommissionRate)
            ? normalizedCommissionRate / 100
            : 0
    };
};

// GET /api/admin/vendors
export const getAllVendors = asyncHandler(async (req, res) => {
    const { status, page = 1, limit = 20, search } = req.query;
    const numericPage = Math.max(parseInt(page, 10) || 1, 1);
    const numericLimit = Math.max(parseInt(limit, 10) || 20, 1);
    const skip = (numericPage - 1) * numericLimit;
    const filter = {};

    const allowedStatuses = new Set(['pending', 'approved', 'suspended', 'rejected']);
    if (typeof status === 'string' && status !== 'all' && allowedStatuses.has(status)) {
        filter.status = status;
    }

    const trimmedSearch = String(search || '').trim();
    if (trimmedSearch) {
        const safeRegex = new RegExp(escapeRegex(trimmedSearch), 'i');
        filter.$or = [{ name: safeRegex }, { email: safeRegex }, { storeName: safeRegex }];
    }

    const [vendors, total] = await Promise.all([
        Vendor.find(filter)
            .select('-password -otp -otpExpiry')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        Vendor.countDocuments(filter),
    ]);
    res.status(200).json(
        new ApiResponse(200, {
            vendors: vendors.map(toApiVendor),
            total,
            page: numericPage,
            pages: Math.ceil(total / numericLimit)
        }, 'Vendors fetched.')
    );
});

// GET /api/admin/vendors/:id
export const getVendorDetail = asyncHandler(async (req, res) => {
    const vendor = await Vendor.findById(req.params.id)
        .select('-password -otp -otpExpiry +bankDetails.accountName +bankDetails.accountNumber +bankDetails.bankName +bankDetails.ifscCode +upiId +paypalEmail')
        .lean();
    if (!vendor) throw new ApiError(404, 'Vendor not found.');
    res.status(200).json(new ApiResponse(200, toApiVendor(vendor), 'Vendor detail fetched.'));
});

// PATCH /api/admin/vendors/:id/status
export const updateVendorStatus = asyncHandler(async (req, res) => {
    const { status, reason } = req.body;
    const allowed = ['approved', 'suspended', 'rejected', 'pending'];
    if (!allowed.includes(status)) throw new ApiError(400, `Status must be one of: ${allowed.join(', ')}`);

    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) throw new ApiError(404, 'Vendor not found.');

    const currentStatus = vendor.status || 'pending';

    // 1. Prevent transitions to the same status
    if (currentStatus === status) {
        throw new ApiError(400, `Vendor is already in ${status} status.`);
    }

    // 2. Validate Allowed State Transitions
    if (currentStatus === 'pending') {
        if (status !== 'approved' && status !== 'rejected') {
            throw new ApiError(400, `Cannot transition from pending status to ${status}. Only Approved or Rejected are allowed.`);
        }
    } else if (currentStatus === 'approved') {
        if (status !== 'suspended') {
            throw new ApiError(400, `Cannot transition from approved status to ${status}. Only Suspended is allowed.`);
        }
    } else if (currentStatus === 'suspended') {
        if (status !== 'approved') {
            throw new ApiError(400, `Cannot transition from suspended status to ${status}. Only Approved (Reactivate) is allowed.`);
        }
    } else if (currentStatus === 'rejected') {
        if (status !== 'pending') {
            throw new ApiError(400, `Cannot transition from rejected status to ${status}. Only Pending (Move Back to Review) is allowed.`);
        }
    }

    // 3. Reason Validation
    const trimmedReason = String(reason || '').trim();
    if (status === 'rejected') {
        if (!trimmedReason) throw new ApiError(400, 'Rejection reason is required.');
        if (trimmedReason.length < 10) throw new ApiError(400, 'Rejection reason must be at least 10 characters long.');
        if (trimmedReason.length > 500) throw new ApiError(400, 'Rejection reason cannot exceed 500 characters.');
    } else if (status === 'suspended') {
        if (!trimmedReason) throw new ApiError(400, 'Suspension reason is required.');
        if (trimmedReason.length < 10) throw new ApiError(400, 'Suspension reason must be at least 10 characters long.');
        if (trimmedReason.length > 500) throw new ApiError(400, 'Suspension reason cannot exceed 500 characters.');
    }

    // 4. Update fields & Audit Trail logging
    const previousStatus = currentStatus;
    vendor.status = status;
    if (status === 'suspended') {
        vendor.suspensionReason = trimmedReason;
    }
    
    // Add to history
    vendor.statusHistory = vendor.statusHistory || [];
    vendor.statusHistory.push({
        previousStatus,
        newStatus: status,
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
        reason: trimmedReason || undefined,
    });

    // A Wholesale/B2B request submitted at registration is reviewed together with the
    // account: approving a new vendor also approves that pending wholesale request.
    if (status === 'approved' && previousStatus === 'pending' && vendor.wholesaleCapability?.status === 'pending') {
        vendor.vendorCapabilities.wholesaleEnabled = true;
        vendor.wholesaleCapability.status = 'approved';
        vendor.wholesaleCapability.reviewedBy = req.user.id;
        vendor.wholesaleCapability.reviewedAt = new Date();
        vendor.wholesaleCapability.rejectionReason = null;
    }

    await vendor.save();

    if (status === 'approved') {
        queueVendorShiprocketPickupSync(vendor._id);
    }

    // 5. Tailored Notification Messages
    let vendorMessage = '';
    if (status === 'approved') {
        if (previousStatus === 'suspended') {
            vendorMessage = 'Your vendor account has been reactivated. You may continue using the platform.';
        } else {
            vendorMessage = 'Your vendor account has been approved. You can now start selling on the platform.';
        }
    } else if (status === 'rejected') {
        vendorMessage = `Your vendor account has been rejected. Reason:\n${trimmedReason}`;
    } else if (status === 'suspended') {
        vendorMessage = `Your vendor account has been suspended. Reason:\n${trimmedReason}`;
    } else if (status === 'pending') {
        vendorMessage = 'Your vendor account has been moved back for review. Our team will review your updated information before making a final decision.';
    }

    await createNotification({
        recipientId: vendor._id,
        recipientType: 'vendor',
        title: 'Vendor Account Status Updated',
        message: vendorMessage,
        type: 'system',
        data: {
            status,
            reason: trimmedReason || '',
        },
    });

    try {
        await sendEmail({
            to: vendor.email,
            subject: `Vendor Account Status: ${status[0].toUpperCase()}${status.slice(1)}`,
            text: vendorMessage,
            html: `<p>${vendorMessage.replace(/\n/g, '<br/>')}</p>`,
        });
    } catch (err) {
        console.warn(`Vendor status email failed for ${vendor.email}: ${err.message}`);
    }

    res.status(200).json(new ApiResponse(200, toApiVendor(vendor), `Vendor ${status} successfully.`));
});

// PATCH /api/admin/vendors/:id
// Email and capability/status fields intentionally use their dedicated flows.
export const updateVendor = asyncHandler(async (req, res) => {
    const allowedFields = ['name', 'storeName', 'phone', 'storeDescription'];
    const updates = {};
    allowedFields.forEach((field) => {
        if (req.body[field] !== undefined) updates[field] = String(req.body[field]).trim();
    });

    const vendor = await Vendor.findByIdAndUpdate(req.params.id, { $set: updates }, {
        new: true,
        runValidators: true,
    });
    if (!vendor) throw new ApiError(404, 'Vendor not found.');

    res.status(200).json(new ApiResponse(200, toApiVendor(vendor), 'Vendor updated successfully.'));
});

// DELETE /api/admin/vendors/:id
// Hard deletion is allowed only for an unused account. Historical commerce,
// logistics, service and wallet records are never cascaded or removed.
export const deleteVendor = asyncHandler(async (req, res) => {
    const vendor = await Vendor.findById(req.params.id).select('_id email storeName');
    if (!vendor) throw new ApiError(404, 'Vendor not found.');

    const dependencyChecks = await Promise.all([
        Product.exists({ vendorId: vendor._id }),
        Order.exists({ $or: [{ 'vendorItems.vendorId': vendor._id }, { 'items.vendorId': vendor._id }] }),
        Shipment.exists({ vendorId: vendor._id }),
        ReturnRequest.exists({ vendorId: vendor._id }),
        Commission.exists({ vendorId: vendor._id }),
        Settlement.exists({ vendorId: vendor._id }),
        Withdrawal.exists({ vendorId: vendor._id }),
        VendorWalletTransaction.exists({ vendorId: vendor._id }),
        VendorService.exists({ vendorId: vendor._id }),
        ServiceBooking.exists({ vendorId: vendor._id }),
    ]);
    const dependencyNames = [
        'products', 'orders', 'shipments', 'returns', 'commissions',
        'settlements', 'withdrawals', 'wallet transactions', 'services', 'service bookings',
    ];
    const foundDependencies = dependencyNames.filter((_, index) => Boolean(dependencyChecks[index]));

    if (foundDependencies.length) {
        throw new ApiError(
            409,
            `Vendor has historical or business records (${foundDependencies.join(', ')}) and cannot be deleted. Suspend the vendor instead.`
        );
    }

    await Promise.all([
        VendorDocument.deleteMany({ vendorId: vendor._id }),
        Notification.deleteMany({ recipientId: vendor._id, recipientType: 'vendor' }),
    ]);
    await Vendor.deleteOne({ _id: vendor._id });

    res.status(200).json(new ApiResponse(200, { id: String(vendor._id) }, 'Vendor deleted successfully.'));
});

export const syncShiprocketPickup = asyncHandler(async (req, res) => {
    const result = await syncVendorShiprocketPickup(req.params.id);
    const responseStatus = result.success ? 200 : 202;
    res.status(responseStatus).json(new ApiResponse(responseStatus, result, result.success
        ? 'Shiprocket pickup location synchronized.'
        : 'Pickup synchronization recorded for retry/review.'));
});

// PATCH /api/admin/vendors/:id/commission
export const updateCommissionRate = asyncHandler(async (req, res) => {
    const { commissionRate } = req.body;
    const parsedRate = Number(commissionRate);
    if (Number.isNaN(parsedRate) || parsedRate < 0) {
        throw new ApiError(400, 'Commission rate must be a valid non-negative number.');
    }
    const dbCommissionRate = parsedRate <= 1 ? parsedRate * 100 : parsedRate;
    if (dbCommissionRate > 100) throw new ApiError(400, 'Commission rate must be between 0 and 100.');

    const vendor = await Vendor.findByIdAndUpdate(req.params.id, { commissionRate: dbCommissionRate }, { new: true });
    if (!vendor) throw new ApiError(404, 'Vendor not found.');

    const formattedRate = `${dbCommissionRate.toFixed(1)}%`;
    const vendorMessage = `Your store's commission rate has been updated to ${formattedRate} by Admin.`;

    // 1. In-app notification with clickable route to profile settings
    await createNotification({
        recipientId: vendor._id,
        recipientType: 'vendor',
        title: 'Commission Rate Updated',
        message: vendorMessage,
        type: 'system',
        data: {
            actionUrl: '/vendor/profile',
            link: '/vendor/profile',
            type: 'commission_update',
            commissionRate: formattedRate,
        },
    });

    // 2. Send email notification
    try {
        await sendEmail({
            to: vendor.email,
            subject: 'Store Commission Rate Updated',
            text: vendorMessage,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: #4F46E5;">Commission Rate Update</h2>
                    <p>Dear ${vendor.storeName || vendor.name || 'Vendor'},</p>
                    <p>${vendorMessage}</p>
                    <p>You can review your updated rate anytime in your Vendor Profile Settings.</p>
                </div>
            `,
        });
    } catch (err) {
        console.warn(`Commission update email failed for ${vendor.email}: ${err.message}`);
    }

    res.status(200).json(new ApiResponse(200, toApiVendor(vendor), 'Commission rate updated.'));
});

// GET /api/admin/vendors/:id/commissions
export const getVendorCommissions = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { page = 1, limit = 20, status = 'all' } = req.query;

    const vendor = await Vendor.findById(id).select('_id');
    if (!vendor) throw new ApiError(404, 'Vendor not found.');

    const numericPage = Math.max(parseInt(page, 10) || 1, 1);
    const numericLimit = Math.max(parseInt(limit, 10) || 20, 1);
    const skip = (numericPage - 1) * numericLimit;

    const filter = { vendorId: vendor._id };
    if (status && status !== 'all') {
        filter.status = status;
    }

    const [commissions, total] = await Promise.all([
        Commission.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        Commission.countDocuments(filter),
    ]);

    res.status(200).json(
        new ApiResponse(
            200,
            {
                commissions,
                total,
                page: numericPage,
                pages: Math.ceil(total / numericLimit),
            },
            'Vendor commissions fetched.'
        )
    );
});

// GET /api/admin/vendors/:id/documents
export const getVendorDocuments = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const documents = await VendorDocument.find({ vendorId: id })
        .sort({ uploadedAt: -1, createdAt: -1 })
        .populate('reviewedBy', 'name email');
    res.status(200).json(new ApiResponse(200, documents, 'Vendor documents fetched.'));
});

// PATCH /api/admin/vendors/:id/documents/:docId/status
export const updateVendorDocumentStatus = asyncHandler(async (req, res) => {
    const { id: vendorId, docId } = req.params;
    const { status, remarks, confirmForce } = req.body;

    const allowed = ['approved', 'rejected'];
    if (!allowed.includes(status)) {
        throw new ApiError(400, `Status must be one of: ${allowed.join(', ')}`);
    }

    if (status === 'rejected') {
        const trimmedRemarks = String(remarks || '').trim();
        if (!trimmedRemarks) {
            throw new ApiError(400, 'Rejection remarks/reason is required.');
        }
        if (trimmedRemarks.length < 10) {
            throw new ApiError(400, 'Rejection remarks must be at least 10 characters long.');
        }
    }

    const document = await VendorDocument.findOne({ _id: docId, vendorId });
    if (!document) {
        throw new ApiError(404, 'Document not found for this vendor.');
    }

    // Protection against accidental status changes if already approved/rejected
    if (document.status !== 'pending' && !confirmForce) {
        return res.status(409).json({
            success: false,
            message: `This document is already marked as ${document.status}. Please confirm if you wish to override this status.`,
            requiresConfirmation: true
        });
    }

    document.status = status;
    document.remarks = remarks || '';
    document.reviewedBy = req.user.id;
    document.reviewedAt = new Date();
    await document.save();

    // Send a notification to the vendor
    let title = 'Document Status Updated';
    let message = '';
    if (status === 'approved') {
        message = `${document.name} has been approved. Your account verification is progressing.`;
    } else {
        message = `${document.name} was rejected. Reason: ${remarks}. Please upload a clearer copy.`;
    }

    await createNotification({
        recipientId: vendorId,
        recipientType: 'vendor',
        title,
        message,
        type: 'system',
        data: {
            documentId: String(document._id),
            status,
        },
    });

    res.status(200).json(new ApiResponse(200, document, `Document status updated to ${status}.`));
});

// POST /api/admin/vendors/:id/documents/bulk-status
export const bulkUpdateVendorDocumentStatus = asyncHandler(async (req, res) => {
    const { id: vendorId } = req.params;
    const { docIds, status, remarks } = req.body;

    if (!Array.isArray(docIds) || docIds.length === 0) {
        throw new ApiError(400, 'docIds array is required and cannot be empty.');
    }

    const allowed = ['approved', 'rejected'];
    if (!allowed.includes(status)) {
        throw new ApiError(400, `Status must be one of: ${allowed.join(', ')}`);
    }

    if (status === 'rejected') {
        const trimmedRemarks = String(remarks || '').trim();
        if (!trimmedRemarks) {
            throw new ApiError(400, 'Rejection remarks/reason is required for bulk rejection.');
        }
        if (trimmedRemarks.length < 10) {
            throw new ApiError(400, 'Rejection remarks must be at least 10 characters long.');
        }
    }

    const documents = await VendorDocument.find({ _id: { $in: docIds }, vendorId });
    if (documents.length === 0) {
        throw new ApiError(404, 'No matching documents found for this vendor.');
    }

    const updatedDocuments = [];

    for (const doc of documents) {
        doc.status = status;
        doc.remarks = remarks || '';
        doc.reviewedBy = req.user.id;
        doc.reviewedAt = new Date();
        await doc.save();

        let message = '';
        if (status === 'approved') {
            message = `${doc.name} has been approved. Your account verification is progressing.`;
        } else {
            message = `${doc.name} was rejected. Reason: ${remarks}. Please upload a clearer copy.`;
        }

        await createNotification({
            recipientId: vendorId,
            recipientType: 'vendor',
            title: 'Document Status Updated (Bulk)',
            message,
            type: 'system',
            data: {
                documentId: String(doc._id),
                status,
            },
        });

        updatedDocuments.push(doc);
    }

    res.status(200).json(new ApiResponse(200, updatedDocuments, `Successfully updated ${updatedDocuments.length} documents to ${status}.`));
});
