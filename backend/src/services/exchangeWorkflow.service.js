import ReturnRequest from '../models/ReturnRequest.model.js';
import ApiError from '../utils/ApiError.js';
import {
    reserveReplacementStock,
    restoreReservedStockOnRejection,
    restoreReturnedStock,
    generateReturnPickupOtp
} from './exchange.service.js';
import EventDispatcher from './eventDispatcher.service.js';

/**
 * Helper to push an entry to statusHistory array
 */
const pushStatusHistory = (request, status, actor, notes = '') => {
    if (!request.statusHistory) {
        request.statusHistory = [];
    }
    request.statusHistory.push({
        status,
        changedAt: new Date(),
        performedByRole: actor.role,
        performedById: actor.id,
        performedByName: actor.name,
        notes: notes || `Status updated to ${status}`
    });
};

/**
 * An upgrade exchange (replacement costs more) may only be dispatched or completed once the customer has
 * paid the difference. Before this guard nothing checked it, so the pricier replacement shipped for free
 * (and in COD-only mode the difference can't be paid online at all).
 */
const PRICE_DIFFERENCE_SETTLED = {
    $or: [
        { requestType: { $ne: 'exchange' } },
        { 'exchangeDetails.priceDelta': { $not: { $gt: 0 } } },
        { 'exchangeDetails.priceDeltaStatus': { $in: ['collected', 'waived'] } },
    ],
};

const lockWithPriceGuard = async (requestId, expectedStatus, nextStatus, session) => {
    const request = await ReturnRequest.findOneAndUpdate(
        { _id: requestId, status: expectedStatus, ...PRICE_DIFFERENCE_SETTLED },
        { $set: { status: nextStatus } },
        { new: true, session }
    );
    if (request) return request;
    const unpaid = await ReturnRequest.findOne({ _id: requestId, status: expectedStatus }).session(session).lean();
    if (unpaid) {
        throw new ApiError(402, `The customer must pay the exchange price difference of ₹${unpaid.exchangeDetails?.priceDelta} before the replacement can be dispatched.`);
    }
    throw new ApiError(409, `Conflict: Return request was not found or has already transitioned from state '${expectedStatus}'.`);
};

/**
 * Approve a return or exchange request
 * Expected status: 'pending' -> Transitions to 'pickup_pending'
 */
export const approve = async (requestId, expectedStatus, actor, session) => {
    // 1. Concurrency lock: update status atomically
    const request = await ReturnRequest.findOneAndUpdate(
        { _id: requestId, status: expectedStatus },
        { 
            $set: { 
                status: 'pickup_pending',
                refundStatus: 'pending'
            } 
        },
        { new: true, session }
    );

    if (!request) {
        throw new ApiError(409, `Conflict: Return request was not found or has already transitioned from state '${expectedStatus}'.`);
    }

    // 2. Business logic on approval
    if (request.requestType === 'exchange') {
        // Reserve stock for replacement variant
        await reserveReplacementStock(request, session);
        // Generate pickup OTP
        generateReturnPickupOtp(request);
        await request.save({ session });
    } else {
        // For returns: generate pickup OTP as well
        generateReturnPickupOtp(request);
        await request.save({ session });
    }

    // 3. Log history
    pushStatusHistory(request, 'approved', actor, 'Request approved.');
    await request.save({ session });

    return request;
};

/**
 * Reject a return or exchange request
 */
export const reject = async (requestId, expectedStatus, rejectionReason, actor, session) => {
    // 1. Fetch document with session lock
    const request = await ReturnRequest.findOne({ _id: requestId, status: expectedStatus }).session(session);
    if (!request) {
        throw new ApiError(409, `Conflict: Return request was not found or has already transitioned from state '${expectedStatus}'.`);
    }

    // 2. Restore stock if it was an exchange and was already approved (reserved stock)
    if (request.requestType === 'exchange' && expectedStatus !== 'pending') {
        await restoreReservedStockOnRejection(request, session);
    }

    // 3. Perform rejection updates
    request.status = 'rejected';
    request.refundStatus = 'failed';
    request.rejectionReason = rejectionReason || '';
    
    // Log history
    pushStatusHistory(request, 'rejected', actor, rejectionReason || 'Request rejected.');
    await request.save({ session });

    return request;
};

/**
 * Prepare replacement (receipt of old product confirmed)
 * Expected status: 'delivered_to_vendor' -> Transitions to 'replacement_preparing'
 */
export const prepareReplacement = async (requestId, expectedStatus, order, actor, session) => {
    // 1. Concurrency lock
    const request = await ReturnRequest.findOneAndUpdate(
        { _id: requestId, status: expectedStatus },
        { $set: { status: 'replacement_preparing' } },
        { new: true, session }
    );

    if (!request) {
        throw new ApiError(409, `Conflict: Return request was not found or has already transitioned from state '${expectedStatus}'.`);
    }

    // 2. Restore stock of returned (old) variant
    await restoreReturnedStock(request, order, session);

    // 3. Log history
    pushStatusHistory(request, 'replacement_preparing', actor, 'Vendor received returned item. Replacement preparation started.');
    await request.save({ session });

    return request;
};

/**
 * Mark replacement ready for courier dispatch
 * Expected status: 'replacement_preparing' -> Transitions to 'replacement_ready'
 */
export const markReplacementReady = async (requestId, expectedStatus, actor, session) => {
    // 1. Concurrency lock (+ upgrade price difference must be paid before dispatch)
    const request = await lockWithPriceGuard(requestId, expectedStatus, 'replacement_ready', session);

    // 2. Log history
    pushStatusHistory(request, 'replacement_ready', actor, 'Replacement marked ready for rider pickup.');
    await request.save({ session });

    return request;
};

/**
 * Complete the exchange flow (operational only)
 * Expected status: 'out_for_delivery' -> Transitions to 'completed'
 */
export const completeExchange = async (requestId, expectedStatus, actor, session) => {
    // 1. Concurrency lock (+ upgrade price difference must be paid)
    const request = await lockWithPriceGuard(requestId, expectedStatus, 'completed', session);

    // 2. Log history
    pushStatusHistory(request, 'completed', actor, 'Exchange delivery completed successfully.');
    await request.save({ session });

    return request;
};

/**
 * Generic transition method for intermediate statuses (e.g. rider updates)
 */
export const transition = async (requestId, expectedStatus, nextStatus, actor, notes = '', session) => {
    // 1. Concurrency lock
    const request = await ReturnRequest.findOneAndUpdate(
        { _id: requestId, status: expectedStatus },
        { $set: { status: nextStatus } },
        { new: true, session }
    );

    if (!request) {
        throw new ApiError(409, `Conflict: Return request was not found or has already transitioned from state '${expectedStatus}'.`);
    }

    // 2. Log history
    pushStatusHistory(request, nextStatus, actor, notes);
    await request.save({ session });

    return request;
};

// ─── Post-save Trigger Operations ─────────────────────────────────────────────

export const handlePostSaveApproval = (requestId) => {
    try {
        EventDispatcher.dispatch('RETURN_APPROVED', { returnRequestId: requestId });
    } catch (err) {
        console.error(`[POST_SAVE_TRIGGER] Failed to auto assign return pickup for request ${requestId}:`, err);
    }
};

export const handlePostSaveReplacementReady = (requestId) => {
    try {
        EventDispatcher.dispatch('REPLACEMENT_READY', { returnRequestId: requestId });
    } catch (err) {
        console.error(`[POST_SAVE_TRIGGER] Failed to auto assign replacement delivery for request ${requestId}:`, err);
    }
};
