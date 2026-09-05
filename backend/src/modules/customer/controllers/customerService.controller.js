import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import ServiceCategory from '../../../models/ServiceCategory.model.js';
import Service from '../../../models/Service.model.js';
import VendorService from '../../../models/VendorService.model.js';
import ServiceBooking from '../../../models/ServiceBooking.model.js';
import ServiceCapacity from '../../../models/ServiceCapacity.model.js';
import ServiceReview from '../../../models/ServiceReview.model.js';
import PaymentAttempt from '../../../models/PaymentAttempt.model.js';
import Refund from '../../../models/Refund.model.js';
import Settings from '../../../models/Settings.model.js';
import Vendor from '../../../models/Vendor.model.js';
import { createNotification } from '../../../services/notification.service.js';
import { createRazorpayOrder, verifyPaymentSignature } from '../../../services/payment.service.js';
import { getWallet, debitWallet, creditWallet } from '../../../services/wallet.service.js';
import { processCapturedPayment } from '../../../services/paymentProcessor.js';
import { isPaymentMethodEnabled } from '../../../services/settingsService.js';
import mongoose from 'mongoose';

const DAYS_MAP = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Returns current Date String (YYYY-MM-DD), current minute of day, and day of week in IST.
 */
const getIstDateAndMinutes = (date = new Date()) => {
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(date.getTime() + istOffsetMs);
    const dateStr = istDate.toISOString().slice(0, 10);
    const minutes = istDate.getUTCHours() * 60 + istDate.getUTCMinutes();
    return { dateStr, minutes, dayOfWeek: DAYS_MAP[istDate.getUTCDay()] };
};

const parseHHMM = (str) => {
    const m = String(str || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const mins = parseInt(m[2], 10);
    const p = m[3] ? m[3].toUpperCase() : null;
    if (p === 'PM' && h < 12) h += 12;
    if (p === 'AM' && h === 12) h = 0;
    return h * 60 + mins;
};

/**
 * @desc    Get active Service Categories and Service Masters for Customer Browsing
 * @route   GET /api/customer/services/catalog
 * @access  Public
 */
export const getServiceCatalog = asyncHandler(async (req, res) => {
    const { categoryId, search } = req.query;

    const categoryFilter = { isActive: true };
    const categories = await ServiceCategory.find(categoryFilter).sort({ sortOrder: 1, name: 1 }).lean();

    const serviceFilter = { isActive: true };
    if (categoryId) {
        serviceFilter.categoryId = categoryId;
    }
    if (search && search.trim()) {
        serviceFilter.$or = [
            { name: { $regex: search.trim(), $options: 'i' } },
            { description: { $regex: search.trim(), $options: 'i' } },
            { shortDescription: { $regex: search.trim(), $options: 'i' } },
        ];
    }

    const services = await Service.find(serviceFilter)
        .populate('categoryId', 'name slug image')
        .sort({ sortOrder: 1, name: 1 })
        .lean();

    res.status(200).json(
        new ApiResponse(200, { categories, services }, 'Service catalog fetched successfully.')
    );
});

/**
 * @desc    Get single Service Master by Slug or ID
 * @route   GET /api/customer/services/detail/:slug
 * @access  Public
 */
export const getServiceBySlug = asyncHandler(async (req, res) => {
    const { slug } = req.params;

    let service = await Service.findOne({ slug, isActive: true }).populate('categoryId', 'name slug image').lean();

    if (!service) {
        if (slug.match(/^[0-9a-fA-F]{24}$/)) {
            service = await Service.findOne({ _id: slug, isActive: true }).populate('categoryId', 'name slug image').lean();
        }
    }

    if (!service) {
        throw new ApiError(404, 'Requested service not found or is currently inactive.');
    }

    res.status(200).json(
        new ApiResponse(200, { service }, 'Service details fetched successfully.')
    );
});

/**
 * @desc    Check Pincode Serviceability & Fetch Available Vendors with Pricing
 * @route   POST /api/customer/services/check-serviceability
 * @access  Public
 */
export const checkServiceability = asyncHandler(async (req, res) => {
    const { serviceId, pincode } = req.body;

    if (!serviceId) {
        throw new ApiError(400, 'Service ID is required.');
    }
    if (!pincode || !/^\d{6}$/.test(String(pincode).trim())) {
        throw new ApiError(400, 'A valid 6-digit postal pincode is required.');
    }

    const cleanPincode = String(pincode).trim();

    const serviceMaster = await Service.findById(serviceId).populate('categoryId', 'name').lean();
    if (!serviceMaster || !serviceMaster.isActive) {
        throw new ApiError(404, 'Service Master not found or inactive.');
    }

    const vendorServices = await VendorService.find({
        serviceId: serviceMaster._id,
        isActive: true,
    })
        .populate({
            path: 'vendorId',
            select: 'storeName name email phone address rating logo isActive isApproved status vendorCapabilities',
        })
        .lean();

    let servicingVendors = vendorServices.filter((vs) => {
        if (!vs.vendorId || vs.vendorId.status !== 'approved' || vs.vendorId.isActive === false) {
            return false;
        }
        if (vs.vendorId.vendorCapabilities?.providesServices === false) {
            return false;
        }
        if (!vs.serviceAreas || !Array.isArray(vs.serviceAreas) || vs.serviceAreas.length === 0) {
            return false;
        }
        return vs.serviceAreas.some((a) => String(a).trim() === cleanPincode);
    });

    if (servicingVendors.length === 0) {
        const generalSettingsDoc = await Settings.findOne({ key: 'general' }).lean();
        const generalSettings = generalSettingsDoc?.value || {};
        const supportPhone = generalSettings.supportPhone || generalSettings.contactPhone || '+91 1800-123-4567';

        return res.status(200).json(
            new ApiResponse(
                200,
                {
                    available: false,
                    pincode: cleanPincode,
                    service: serviceMaster,
                    message: `Service is currently not available in pincode ${cleanPincode}. Please call customer support for custom assistance.`,
                    supportPhone,
                    vendors: [],
                },
                'Service not available in this area.'
            )
        );
    }

    const vendorList = servicingVendors.map((vs) => ({
        vendorServiceId: vs._id,
        vendorId: vs.vendorId._id,
        storeName: vs.vendorId.storeName || vs.vendorId.name || 'Certified Vendor',
        rating: vs.rating || vs.vendorId.rating || 4.8,
        reviewCount: vs.reviewCount || 0,
        price: vs.price || 0,
        variantPrices: vs.variantPrices || {},
        workingHours: vs.workingHours || { start: '09:00', end: '18:00' },
        workingSchedule: vs.workingSchedule || undefined,
        dailyCapacity: vs.dailyCapacity || 10,
        vendorNotes: vs.vendorNotes || '',
    }));

    res.status(200).json(
        new ApiResponse(
            200,
            {
                available: true,
                pincode: cleanPincode,
                service: serviceMaster,
                vendors: vendorList,
            },
            `Service is available in pincode ${cleanPincode}!`
        )
    );
});

/**
 * @desc    Create a new Service Booking with server-side pricing, working schedule & capacity checks
 * @route   POST /api/customer/bookings
 * @access  Private (Customer Auth)
 */
export const createBooking = asyncHandler(async (req, res) => {
    const {
        serviceId,
        vendorId,
        variant,
        quantity = 1,
        pincode,
        serviceAddress,
        bookingDate,
        timeSlot,
        customFields = {},
        paymentMethod = 'cod',
        notes = '',
    } = req.body;

    const userId = req.user.id || req.user._id;

    if (!serviceId || !vendorId || !pincode || !serviceAddress || !bookingDate || !timeSlot) {
        throw new ApiError(400, 'Missing required booking details (service, vendor, pincode, address, date, timeslot).');
    }

    const cleanPincode = String(pincode).trim();

    // 1. Verify Service Master exists and is active
    const serviceMaster = await Service.findById(serviceId).populate('categoryId', 'name').lean();
    if (!serviceMaster || !serviceMaster.isActive) {
        throw new ApiError(404, 'Selected Service is inactive or not found.');
    }

    // 2. Independently verify Vendor Account exists, is approved, and provides services capability
    const resolvedVendor = await Vendor.findOne({
        _id: vendorId,
        status: 'approved',
    }).lean();

    if (!resolvedVendor || resolvedVendor.vendorCapabilities?.providesServices === false) {
        throw new ApiError(400, 'Selected Service Provider is currently inactive, not approved, or does not provide services.');
    }

    // 3. Verify VendorService configuration exists for vendorId + serviceId and is active
    const vendorService = await VendorService.findOne({
        serviceId: serviceMaster._id,
        vendorId: resolvedVendor._id,
        isActive: true,
    }).lean();

    if (!vendorService) {
        throw new ApiError(400, 'Selected Service Provider does not offer this service.');
    }

    // 4. Verify VendorService strictly covers the requested Pincode
    const isPincodeCovered = vendorService.serviceAreas &&
        Array.isArray(vendorService.serviceAreas) &&
        vendorService.serviceAreas.some((a) => String(a).trim() === cleanPincode);

    if (!isPincodeCovered) {
        throw new ApiError(400, `Selected Service Provider does not service pincode ${cleanPincode}.`);
    }

    // 5. Working Hours & Weekly Schedule Validation
    const nowIst = getIstDateAndMinutes(new Date());
    const bookingDateObj = new Date(bookingDate);
    if (isNaN(bookingDateObj.getTime())) {
        throw new ApiError(400, 'Invalid booking date provided.');
    }
    const bookingIst = getIstDateAndMinutes(bookingDateObj);

    // Check closed day of week
    const dayConfig = vendorService.workingSchedule?.[bookingIst.dayOfWeek];
    if (dayConfig && dayConfig.enabled === false) {
        throw new ApiError(
            400,
            `Selected Service Provider is closed on ${bookingIst.dayOfWeek.toUpperCase()}s. Please choose an open date.`
        );
    }

    const startStr = dayConfig?.start || vendorService.workingHours?.start || '09:00';
    const endStr = dayConfig?.end || vendorService.workingHours?.end || '18:00';
    const startMins = parseHHMM(startStr) ?? 540;
    const endMins = parseHHMM(endStr) ?? 1080;

    const slotMinutes = parseHHMM(timeSlot);
    if (slotMinutes !== null) {
        if (slotMinutes < startMins || slotMinutes >= endMins) {
            throw new ApiError(
                400,
                `Selected time slot (${timeSlot}) is outside vendor working hours (${startStr} - ${endStr}).`
            );
        }

        // Same-day past time slot protection (IST)
        if (bookingIst.dateStr === nowIst.dateStr) {
            if (slotMinutes <= nowIst.minutes) {
                throw new ApiError(400, 'Selected time slot has already passed for today. Please choose a future time slot.');
            }
        } else if (bookingIst.dateStr < nowIst.dateStr) {
            throw new ApiError(400, 'Cannot book a service for a past date.');
        }
    }

    // 6. Concurrency-Safe Daily Capacity Reservation
    const dailyLimit = vendorService.dailyCapacity || 10;
    const dateStr = bookingIst.dateStr;

    await ServiceCapacity.updateOne(
        { vendorServiceId: vendorService._id, dateStr },
        {
            $setOnInsert: {
                vendorId: resolvedVendor._id,
                dateStr,
                bookedCount: 0,
                dailyCapacity: dailyLimit,
            },
        },
        { upsert: true }
    );

    const reservation = await ServiceCapacity.findOneAndUpdate(
        {
            vendorServiceId: vendorService._id,
            dateStr,
            bookedCount: { $lt: dailyLimit },
        },
        { $inc: { bookedCount: 1 } },
        { new: true }
    );

    if (!reservation) {
        throw new ApiError(400, 'Selected Service Provider is fully booked for this date. Please select another date.');
    }

    // Helper to release capacity reservation on failure
    const rollbackCapacity = async () => {
        try {
            await ServiceCapacity.updateOne(
                { vendorServiceId: vendorService._id, dateStr, bookedCount: { $gt: 0 } },
                { $inc: { bookedCount: -1 } }
            );
        } catch (_) {}
    };

    // 7. Authoritative Server-Side Price Calculation
    let unitPrice = vendorService.price || 0;
    if (variant && variant.key && vendorService.variantPrices) {
        let vPrice = null;
        if (typeof vendorService.variantPrices.get === 'function') {
            vPrice = vendorService.variantPrices.get(variant.key);
        } else if (typeof vendorService.variantPrices === 'object') {
            vPrice = vendorService.variantPrices[variant.key];
        }
        if (typeof vPrice === 'number' && vPrice > 0) unitPrice = vPrice;
    } else if (variant && typeof variant.price === 'number' && variant.price > 0) {
        unitPrice = variant.price;
    }

    const qty = Math.max(1, Number(quantity) || 1);
    const subtotal = Math.round(unitPrice * qty * 100) / 100;
    const tax = 0;
    const total = Math.round((subtotal + tax) * 100) / 100;

    const bookingId = `SRV-${Date.now().toString().slice(-6)}${Math.floor(100 + Math.random() * 900)}`;

    const normalizedMethod = String(paymentMethod || 'cod').toLowerCase();

    // 8. Handle Payment Methods
    if (normalizedMethod === 'cod') {
        const booking = await ServiceBooking.create({
            bookingId,
            userId,
            serviceId: serviceMaster._id,
            vendorId: resolvedVendor._id,
            vendorServiceId: vendorService._id,
            serviceName: serviceMaster.name,
            categoryName: serviceMaster.categoryId?.name || 'Fire Safety',
            serviceImage: serviceMaster.image || '',
            variant: variant || {},
            quantity: qty,
            pincode: cleanPincode,
            serviceAddress,
            bookingDate: bookingDateObj,
            timeSlot,
            customFields,
            pricing: { unitPrice, quantity: qty, subtotal, tax, total },
            paymentMethod: 'cod',
            paymentStatus: 'pending',
            status: 'pending',
            notes,
        });

        await createNotification({
            recipientId: resolvedVendor._id,
            recipientType: 'vendor',
            title: 'New Service Booking Received!',
            message: `New COD booking #${booking.bookingId} for "${serviceMaster.name}" on ${bookingDateObj.toLocaleDateString()}.`,
            type: 'service',
            data: { bookingId: String(booking._id), bookingNumber: booking.bookingId },
        });

        return res.status(201).json(
            new ApiResponse(201, { booking }, 'Service booking created successfully!')
        );
    }

    if (normalizedMethod === 'wallet') {
        const wallet = await getWallet(userId);
        if (wallet.balance < total) {
            await rollbackCapacity();
            throw new ApiError(400, `Insufficient wallet balance. Available: ₹${wallet.balance}, Required: ₹${total}.`);
        }

        const booking = await ServiceBooking.create({
            bookingId,
            userId,
            serviceId: serviceMaster._id,
            vendorId: resolvedVendor._id,
            vendorServiceId: vendorService._id,
            serviceName: serviceMaster.name,
            categoryName: serviceMaster.categoryId?.name || 'Fire Safety',
            serviceImage: serviceMaster.image || '',
            variant: variant || {},
            quantity: qty,
            pincode: cleanPincode,
            serviceAddress,
            bookingDate: bookingDateObj,
            timeSlot,
            customFields,
            pricing: { unitPrice, quantity: qty, subtotal, tax, total },
            paymentMethod: 'wallet',
            paymentStatus: 'paid',
            status: 'confirmed',
            notes,
            statusHistory: [{
                previousStatus: 'pending',
                newStatus: 'confirmed',
                changedByRole: 'system',
                note: `Paid ₹${total} via SafeFire Wallet`,
                changedAt: new Date(),
            }],
        });

        try {
            await debitWallet(userId, total, 'wallet_payment', {
                serviceBookingId: booking._id,
                description: `Paid ₹${total} via wallet for Service Booking #${booking.bookingId}`,
                reference: `SERVICE_WALLET_${booking._id}`,
            });
        } catch (debitErr) {
            await rollbackCapacity();
            await ServiceBooking.findByIdAndDelete(booking._id);
            throw debitErr;
        }

        await createNotification({
            recipientId: userId,
            recipientType: 'user',
            title: 'Booking Confirmed!',
            message: `Your booking #${booking.bookingId} for "${serviceMaster.name}" is confirmed and paid via wallet.`,
            type: 'service',
            data: { bookingId: String(booking._id), bookingNumber: booking.bookingId },
        });

        await createNotification({
            recipientId: resolvedVendor._id,
            recipientType: 'vendor',
            title: 'New Paid Booking Received!',
            message: `New paid booking #${booking.bookingId} for "${serviceMaster.name}" on ${bookingDateObj.toLocaleDateString()}.`,
            type: 'service',
            data: { bookingId: String(booking._id), bookingNumber: booking.bookingId },
        });

        return res.status(201).json(
            new ApiResponse(201, { booking }, 'Service booking created and paid via wallet!')
        );
    }

    // Online Payment via Razorpay
    const booking = await ServiceBooking.create({
        bookingId,
        userId,
        serviceId: serviceMaster._id,
        vendorId: resolvedVendor._id,
        vendorServiceId: vendorService._id,
        serviceName: serviceMaster.name,
        categoryName: serviceMaster.categoryId?.name || 'Fire Safety',
        serviceImage: serviceMaster.image || '',
        variant: variant || {},
        quantity: qty,
        pincode: cleanPincode,
        serviceAddress,
        bookingDate: bookingDateObj,
        timeSlot,
        customFields,
        pricing: { unitPrice, quantity: qty, subtotal, tax, total },
        paymentMethod: normalizedMethod,
        paymentStatus: 'pending',
        status: 'pending',
        notes,
    });

    let rzpOrder;
    try {
        rzpOrder = await createRazorpayOrder(total, 'INR', booking.bookingId, {
            serviceBookingId: String(booking._id),
            userId: String(userId),
        });
    } catch (gatewayErr) {
        await rollbackCapacity();
        await ServiceBooking.findByIdAndDelete(booking._id);
        throw new ApiError(502, 'Payment gateway initialization failed. Please try again.');
    }

    await PaymentAttempt.create({
        serviceBookingId: booking._id,
        razorpayOrderId: rzpOrder.id,
        purpose: 'SERVICE_BOOKING',
        status: 'created',
        attemptNumber: 1,
    });

    return res.status(201).json(
        new ApiResponse(201, {
            booking,
            razorpayOrderId: rzpOrder.id,
            amount: total,
            currency: 'INR',
            key: process.env.RAZORPAY_KEY_ID,
        }, 'Service booking created. Complete online payment to confirm.')
    );
});

/**
 * @desc    Verify Razorpay Payment Signature for Service Booking
 * @route   POST /api/customer/bookings/verify-payment
 * @access  Private (Customer Auth)
 */
export const verifyServicePayment = asyncHandler(async (req, res) => {
    const { bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
    const userId = req.user.id || req.user._id;

    if (!bookingId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        throw new ApiError(400, 'Missing payment verification details.');
    }

    const isValid = verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!isValid) {
        throw new ApiError(400, 'Invalid payment signature. Cryptographic verification failed.');
    }

    const booking = await ServiceBooking.findOne({
        $or: [{ _id: mongoose.Types.ObjectId.isValid(bookingId) ? bookingId : null }, { bookingId }],
        userId,
    });

    if (!booking) {
        throw new ApiError(404, 'Service booking not found or unauthorized.');
    }

    await processCapturedPayment({
        razorpayOrderId,
        razorpayPaymentId,
        method: booking.paymentMethod || 'online',
        payload: { source: 'service_verify_payment', body: req.body },
    });

    const updatedBooking = await ServiceBooking.findById(booking._id).lean();

    res.status(200).json(
        new ApiResponse(200, { booking: updatedBooking }, 'Service payment verified and booking confirmed successfully.')
    );
});

/**
 * @desc    Get Customer's Service Bookings
 * @route   GET /api/customer/bookings
 * @access  Private (Customer Auth)
 */
export const getCustomerBookings = asyncHandler(async (req, res) => {
    const userId = req.user.id || req.user._id;
    const bookings = await ServiceBooking.find({ userId })
        .populate('vendorId', 'storeName name email phone')
        .sort({ createdAt: -1 })
        .lean();

    res.status(200).json(
        new ApiResponse(200, { bookings }, 'Customer bookings fetched successfully.')
    );
});

/**
 * @desc    Get Customer Booking Detail by ID
 * @route   GET /api/customer/bookings/:id
 * @access  Private (Customer Auth)
 */
export const getBookingById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id || req.user._id;

    const query = mongoose.Types.ObjectId.isValid(id)
        ? { _id: id, userId }
        : { bookingId: id, userId };

    let booking = await ServiceBooking.findOne(query)
        .populate('vendorId', 'storeName name email phone address rating')
        .populate('serviceId', 'name description serviceFields serviceSettings')
        .lean();

    if (!booking) {
        throw new ApiError(404, 'Booking not found.');
    }

    res.status(200).json(
        new ApiResponse(200, { booking }, 'Booking detail fetched successfully.')
    );
});

/**
 * @desc    Cancel Customer Service Booking with automated wallet refund
 * @route   PATCH /api/customer/bookings/:id/cancel
 * @access  Private (Customer Auth)
 */
export const cancelBooking = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason = 'Cancelled by customer' } = req.body;
    const userId = req.user.id || req.user._id;

    const query = mongoose.Types.ObjectId.isValid(id)
        ? { _id: id, userId }
        : { bookingId: id, userId };

    const booking = await ServiceBooking.findOne(query);
    if (!booking) {
        throw new ApiError(404, 'Booking not found.');
    }

    if (booking.status === 'completed' || booking.status === 'cancelled') {
        throw new ApiError(400, `Cannot cancel a booking that is already ${booking.status}.`);
    }

    let refundAmount = 0;
    const refundRef = `SERVICE_CANCEL_REFUND_${booking._id}`;

    if (booking.paymentStatus === 'paid') {
        refundAmount = Number(booking.pricing.total || 0);

        // Check idempotency against duplicate refund
        const existingRefund = await Refund.findOne({ referenceId: refundRef });
        if (!existingRefund && refundAmount > 0) {
            await creditWallet(
                userId,
                refundAmount,
                'cancel_refund',
                {
                    serviceBookingId: booking._id,
                    description: `Refund ₹${refundAmount} to wallet for cancelled Service Booking #${booking.bookingId}`,
                    reference: refundRef,
                }
            );

            await Refund.create({
                serviceBookingId: booking._id,
                userId,
                amount: refundAmount,
                referenceId: refundRef,
                method: 'wallet_credit',
                destination: 'wallet',
                status: 'completed',
                notes: `Refund for cancelled Service Booking #${booking.bookingId}`,
            });
        }
        booking.paymentStatus = 'refunded';
        booking.refundStatus = 'refunded';
    }

    // Release capacity reservation
    const dateStr = getIstDateAndMinutes(new Date(booking.bookingDate)).dateStr;
    await ServiceCapacity.updateOne(
        { vendorServiceId: booking.vendorServiceId, dateStr, bookedCount: { $gt: 0 } },
        { $inc: { bookedCount: -1 } }
    );

    booking.status = 'cancelled';
    booking.cancellationReason = reason;
    booking.cancelledAt = new Date();
    booking.cancelledBy = userId;
    booking.cancelledByRole = 'customer';
    booking.statusHistory.push({
        previousStatus: booking.status,
        newStatus: 'cancelled',
        changedByRole: 'customer',
        note: reason,
        changedAt: new Date(),
    });

    await booking.save();

    // Expire any pending payment attempts
    await PaymentAttempt.updateMany(
        { serviceBookingId: booking._id, status: 'created' },
        { $set: { status: 'failed' } }
    );

    // Notifications
    await createNotification({
        recipientId: booking.vendorId,
        recipientType: 'vendor',
        title: 'Service Booking Cancelled',
        message: `Booking #${booking.bookingId} for "${booking.serviceName}" has been cancelled by customer.`,
        type: 'service',
        data: { bookingId: String(booking._id), bookingNumber: booking.bookingId },
    });

    if (refundAmount > 0) {
        await createNotification({
            recipientId: userId,
            recipientType: 'user',
            title: 'Booking Cancelled & Refunded',
            message: `Booking #${booking.bookingId} cancelled. ₹${refundAmount} has been refunded to your SafeFire Wallet.`,
            type: 'refund',
            data: { bookingId: String(booking._id), bookingNumber: booking.bookingId, refundAmount },
        });
    }

    res.status(200).json(
        new ApiResponse(
            200,
            { booking, refundAmount },
            `Booking cancelled successfully.${refundAmount > 0 ? ` ₹${refundAmount} refunded to your wallet.` : ''}`
        )
    );
});

/**
 * @desc    Submit Review and Rating for a Completed Service Booking
 * @route   POST /api/customer/bookings/:id/review
 * @access  Private (Customer Auth)
 */
export const addServiceReview = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { rating, title = '', comment = '', images = [] } = req.body;
    const userId = req.user.id || req.user._id;

    const numRating = Number(rating);
    if (!Number.isFinite(numRating) || numRating < 1 || numRating > 5) {
        throw new ApiError(400, 'Rating must be an integer between 1 and 5.');
    }

    const query = mongoose.Types.ObjectId.isValid(id)
        ? { _id: id, userId }
        : { bookingId: id, userId };

    const booking = await ServiceBooking.findOne(query);
    if (!booking) {
        throw new ApiError(404, 'Service booking not found or unauthorized.');
    }

    if (booking.status !== 'completed') {
        throw new ApiError(400, 'Only completed service bookings can be reviewed.');
    }

    const existingReview = await ServiceReview.findOne({ serviceBookingId: booking._id });
    if (existingReview) {
        throw new ApiError(409, 'You have already reviewed this service booking.');
    }

    const review = await ServiceReview.create({
        serviceBookingId: booking._id,
        serviceId: booking.serviceId,
        vendorServiceId: booking.vendorServiceId,
        vendorId: booking.vendorId,
        userId,
        rating: numRating,
        title: String(title || '').trim(),
        comment: String(comment || '').trim(),
        images: Array.isArray(images) ? images : [],
        isApproved: true,
    });

    booking.isReviewed = true;
    await booking.save();

    // Aggregate rating updates for Service and VendorService
    const serviceReviews = await ServiceReview.find({ serviceId: booking.serviceId, isApproved: true }).select('rating').lean();
    if (serviceReviews.length > 0) {
        const avg = serviceReviews.reduce((sum, r) => sum + r.rating, 0) / serviceReviews.length;
        await Service.findByIdAndUpdate(booking.serviceId, {
            rating: parseFloat(avg.toFixed(1)),
            reviewCount: serviceReviews.length,
        });
    }

    const vsReviews = await ServiceReview.find({ vendorServiceId: booking.vendorServiceId, isApproved: true }).select('rating').lean();
    if (vsReviews.length > 0) {
        const avgVs = vsReviews.reduce((sum, r) => sum + r.rating, 0) / vsReviews.length;
        await VendorService.findByIdAndUpdate(booking.vendorServiceId, {
            rating: parseFloat(avgVs.toFixed(1)),
            reviewCount: vsReviews.length,
        });
    }

    // Notify vendor
    await createNotification({
        recipientId: booking.vendorId,
        recipientType: 'vendor',
        title: 'New Service Review Received!',
        message: `Customer left a ${numRating}-star review for booking #${booking.bookingId}.`,
        type: 'service',
        data: { bookingId: String(booking._id), reviewId: String(review._id) },
    });

    res.status(201).json(
        new ApiResponse(201, { review }, 'Review submitted successfully!')
    );
});

/**
 * @desc    Get Reviews for a Service Master
 * @route   GET /api/customer/services/:slug/reviews
 * @access  Public
 */
export const getServiceReviews = asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const { page = 1, limit = 10 } = req.query;

    let service = await Service.findOne({ slug, isActive: true }).select('_id name rating reviewCount').lean();
    if (!service && slug.match(/^[0-9a-fA-F]{24}$/)) {
        service = await Service.findOne({ _id: slug, isActive: true }).select('_id name rating reviewCount').lean();
    }

    if (!service) {
        throw new ApiError(404, 'Service not found.');
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 10);
    const skip = (pageNum - 1) * limitNum;

    const query = { serviceId: service._id, isApproved: true };
    const [reviews, total] = await Promise.all([
        ServiceReview.find(query)
            .populate('userId', 'name avatar')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean(),
        ServiceReview.countDocuments(query),
    ]);

    res.status(200).json(
        new ApiResponse(200, {
            reviews,
            total,
            page: pageNum,
            pages: Math.ceil(total / limitNum) || 1,
            averageRating: service.rating || 0,
            reviewCount: service.reviewCount || 0,
        }, 'Service reviews fetched successfully.')
    );
});
