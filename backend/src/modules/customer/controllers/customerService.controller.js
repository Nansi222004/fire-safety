import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import ServiceCategory from '../../../models/ServiceCategory.model.js';
import Service from '../../../models/Service.model.js';
import VendorService from '../../../models/VendorService.model.js';
import ServiceBooking from '../../../models/ServiceBooking.model.js';
import Notification from '../../../models/Notification.model.js';
import Settings from '../../../models/Settings.model.js';
import Vendor from '../../../models/Vendor.model.js';

// Helper to create notifications safely
const createNotification = async (recipientId, recipientType, title, message, data = {}) => {
    try {
        await Notification.create({
            recipientId,
            recipientType: String(recipientType || 'vendor').toLowerCase(),
            type: 'system',
            title,
            message,
            data,
        });
    } catch (err) {
        console.error('Failed to create notification:', err.message);
    }
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
 * @route   GET /api/customer/services/:slug
 * @access  Public
 */
export const getServiceBySlug = asyncHandler(async (req, res) => {
    const { slug } = req.params;

    let service = await Service.findOne({ slug, isActive: true }).populate('categoryId', 'name slug image').lean();

    if (!service) {
        // Try matching by ObjectId if valid
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
    if (!pincode || !String(pincode).trim()) {
        throw new ApiError(400, 'Pincode is required.');
    }

    const cleanPincode = String(pincode).trim();

    const serviceMaster = await Service.findById(serviceId).populate('categoryId', 'name').lean();
    if (!serviceMaster || !serviceMaster.isActive) {
        throw new ApiError(404, 'Service Master not found or inactive.');
    }

    // Find all active VendorServices for this serviceId
    const vendorServices = await VendorService.find({
        serviceId: serviceMaster._id,
        isActive: true,
    })
        .populate({
            path: 'vendorId',
            select: 'storeName name email phone address rating logo isActive isApproved status',
        })
        .lean();

    // Filter vendors strictly matching pincode in vs.serviceAreas (no empty = all)
    let servicingVendors = vendorServices.filter((vs) => {
        if (!vs.vendorId || vs.vendorId.status === 'suspended' || vs.vendorId.status === 'rejected' || vs.vendorId.isActive === false) {
            return false;
        }
        if (!vs.serviceAreas || !Array.isArray(vs.serviceAreas) || vs.serviceAreas.length === 0) {
            return false; // Must explicitly list supported pincodes
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

    // Map vendor pricing and options
    const vendorList = servicingVendors.map((vs) => ({
        vendorServiceId: vs._id,
        vendorId: vs.vendorId._id,
        storeName: vs.vendorId.storeName || vs.vendorId.name || 'Certified Vendor',
        rating: vs.vendorId.rating || 4.8,
        price: vs.price || 0,
        variantPrices: vs.variantPrices || {},
        workingHours: vs.workingHours || { start: '09:00', end: '18:00' },
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
 * @desc    Create a new Service Booking
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

    if (!serviceId || !vendorId || !pincode || !serviceAddress || !bookingDate || !timeSlot) {
        throw new ApiError(400, 'Missing required booking details (service, vendor, pincode, address, date, timeslot).');
    }

    const cleanPincode = String(pincode).trim();

    // 1. Verify Service Master exists and is active
    const serviceMaster = await Service.findById(serviceId).populate('categoryId', 'name').lean();
    if (!serviceMaster || !serviceMaster.isActive) {
        throw new ApiError(404, 'Selected Service is inactive or not found.');
    }

    // 2. Independently verify Vendor Account exists, is approved, and active
    const resolvedVendor = await Vendor.findOne({
        _id: vendorId,
        isActive: true,
        status: 'approved',
    }).lean();

    if (!resolvedVendor) {
        throw new ApiError(400, 'Selected Service Provider is currently inactive or not approved.');
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

    // 5. Verify Capacity Protection for booking date
    const startOfDay = new Date(bookingDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(bookingDate);
    endOfDay.setHours(23, 59, 59, 999);

    const existingBookingsCount = await ServiceBooking.countDocuments({
        vendorId: resolvedVendor._id,
        bookingDate: { $gte: startOfDay, $lte: endOfDay },
        status: { $in: ['pending', 'confirmed', 'assigned', 'in_progress'] },
    });

    const dailyLimit = vendorService.dailyCapacity || 10;
    if (existingBookingsCount >= dailyLimit) {
        throw new ApiError(400, 'Selected Service Provider is fully booked for this date. Please select another date.');
    }

    // 6. Calculate Pricing & Taxes cleanly
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
    const subtotal = unitPrice * qty;
    const tax = 0; // Dynamic/configurable tax fallback per requirement
    const total = subtotal + tax;

    const bookingId = `SB-${Date.now().toString().slice(-6)}${Math.floor(100 + Math.random() * 900)}`;

    const booking = await ServiceBooking.create({
        bookingId,
        userId: req.user.id || req.user._id,
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
        bookingDate: new Date(bookingDate),
        timeSlot,
        customFields,
        pricing: {
            unitPrice,
            quantity: qty,
            subtotal,
            tax,
            total,
        },
        paymentMethod,
        paymentStatus: paymentMethod === 'cod' ? 'pending' : 'paid',
        status: 'pending',
        notes,
    });

    // Notify Vendor
    await createNotification(
        resolvedVendorId,
        'vendor',
        'New Service Booking Received!',
        `New booking #${booking.bookingId} for "${serviceMaster.name}" on ${new Date(bookingDate).toLocaleDateString()}.`,
        { bookingId: String(booking._id), bookingNumber: booking.bookingId }
    );

    res.status(201).json(
        new ApiResponse(201, { booking }, 'Service booking created successfully!')
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

    let booking = await ServiceBooking.findOne({ _id: id, userId })
        .populate('vendorId', 'storeName name email phone address rating')
        .populate('serviceId', 'name description serviceFields serviceSettings')
        .lean();

    if (!booking) {
        booking = await ServiceBooking.findOne({ bookingId: id, userId })
            .populate('vendorId', 'storeName name email phone address rating')
            .populate('serviceId', 'name description serviceFields serviceSettings')
            .lean();
    }

    if (!booking) {
        throw new ApiError(404, 'Booking not found.');
    }

    res.status(200).json(
        new ApiResponse(200, { booking }, 'Booking detail fetched successfully.')
    );
});

/**
 * @desc    Cancel Customer Service Booking
 * @route   PATCH /api/customer/bookings/:id/cancel
 * @access  Private (Customer Auth)
 */
export const cancelBooking = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason = 'Cancelled by customer' } = req.body;
    const userId = req.user.id || req.user._id;

    const booking = await ServiceBooking.findOne({ _id: id, userId });
    if (!booking) {
        throw new ApiError(404, 'Booking not found.');
    }

    if (booking.status === 'completed' || booking.status === 'cancelled') {
        throw new ApiError(400, `Cannot cancel a booking that is already ${booking.status}.`);
    }

    booking.status = 'cancelled';
    booking.cancellationReason = reason;
    await booking.save();

    // Notify Vendor of Cancellation
    await createNotification(
        booking.vendorId,
        'Vendor',
        'SERVICE_BOOKING_CANCELLED',
        'Service Booking Cancelled',
        `Booking #${booking.bookingId} for "${booking.serviceName}" has been cancelled by customer.`,
        { bookingId: booking._id }
    );

    res.status(200).json(
        new ApiResponse(200, { booking }, 'Booking cancelled successfully.')
    );
});
