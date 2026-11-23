import Joi from 'joi';

const objectId = Joi.string().pattern(/^[0-9a-fA-F]{24}$/);

// :id is the order (Mongo id or human order id); :shipmentId must be a Mongo id.
export const sellerDeliveryParamsSchema = Joi.object({
    id: Joi.string().trim().min(1).max(64).required(),
    shipmentId: objectId.required().messages({ 'string.pattern.base': 'Invalid shipment.' }),
});

const courierName = Joi.string().trim().min(2).max(100).messages({
    'string.empty': 'Courier name is required.',
    'string.min': 'Courier name must be at least 2 characters.',
    'string.max': 'Courier name must be at most 100 characters.',
});
const trackingNumber = Joi.string().trim().min(3).max(64).pattern(/^[A-Za-z0-9][A-Za-z0-9\-_/. ]*$/).messages({
    'string.empty': 'Tracking number is required.',
    'string.min': 'Tracking number must be at least 3 characters.',
    'string.max': 'Tracking number must be at most 64 characters.',
    'string.pattern.base': 'Tracking number may contain only letters, numbers, spaces and - _ / .',
});
const trackingUrl = Joi.string().trim().max(500).uri({ scheme: ['https'] }).allow('').messages({
    'string.uri': 'Tracking link must be a valid https:// URL.',
    'string.uriCustomScheme': 'Tracking link must start with https://',
});
const deliveryPersonName = Joi.string().trim().max(100).allow('');
const deliveryPersonPhone = Joi.string().trim().pattern(/^[6-9]\d{9}$/).allow('').messages({
    'string.pattern.base': 'Delivery person phone must be a valid 10-digit Indian mobile number.',
});

export const shipSellerDeliverySchema = Joi.object({
    courierName: courierName.required(),
    trackingNumber: trackingNumber.required(),
    trackingUrl,
    deliveryPersonName,
    deliveryPersonPhone,
});

export const updateSellerDeliveryTrackingSchema = Joi.object({
    courierName,
    trackingNumber,
    trackingUrl,
    deliveryPersonName,
    deliveryPersonPhone,
}).min(1).messages({ 'object.min': 'Provide at least one tracking detail to update.' });

export const confirmSellerDeliverySchema = Joi.object({
    otp: Joi.string().trim().pattern(/^\d{4}$/).required().messages({
        'string.empty': 'Delivery OTP is required.',
        'string.pattern.base': 'Enter the 4-digit delivery OTP from the customer.',
    }),
});
