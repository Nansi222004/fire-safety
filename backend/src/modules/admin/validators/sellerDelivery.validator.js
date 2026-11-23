import Joi from 'joi';

export const adminSellerDeliveryParamsSchema = Joi.object({
    id: Joi.string().trim().min(1).max(64).required(),
    shipmentId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required().messages({ 'string.pattern.base': 'Invalid shipment.' }),
});

// Admin delivery override: both a reason and a proof/reference are mandatory.
export const adminConfirmSellerDeliverySchema = Joi.object({
    reason: Joi.string().trim().min(10).max(500).required().messages({
        'string.empty': 'A reason is required for a delivery override.',
        'any.required': 'A reason is required for a delivery override.',
        'string.min': 'Describe the reason in at least 10 characters.',
    }),
    proofReference: Joi.string().trim().min(3).max(300).required().messages({
        'string.empty': 'Proof or reference (e.g. courier POD number, call record, photo link) is required.',
        'any.required': 'Proof or reference (e.g. courier POD number, call record, photo link) is required.',
        'string.min': 'Proof or reference must be at least 3 characters.',
    }),
});
