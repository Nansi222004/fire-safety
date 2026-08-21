import Joi from 'joi';

const objectId = Joi.string().pattern(/^[0-9a-fA-F]{24}$/);

export const serviceRequestIdParamSchema = Joi.object({
    id: objectId.required(),
});

export const createServiceRequestSchema = Joi.object({
    serviceName: Joi.string().trim().min(2).max(150).required().messages({
        'string.empty': 'Service name is required',
        'string.min': 'Service name must be at least 2 characters long',
    }),
    categoryId: objectId.required().messages({
        'string.empty': 'Service Category is required',
        'string.pattern.base': 'Invalid Service Category ID',
    }),
    description: Joi.string().trim().allow('').optional(),
    shortDescription: Joi.string().trim().allow('').optional(),
    image: Joi.string().trim().allow('').optional(),
    pricingType: Joi.string().valid('FIXED', 'PER_UNIT', 'SIZE_BASED', 'CUSTOM_QUOTE').optional(),
    suggestedPrice: Joi.number().min(0).optional(),
    bookingType: Joi.string().valid('INSTANT', 'SCHEDULED', 'SITE_VISIT', 'CUSTOM_QUOTE').optional(),
    estimatedDuration: Joi.string().trim().allow('').optional(),
    additionalNotes: Joi.string().trim().allow('').optional(),
    serviceFields: Joi.array()
        .items(
            Joi.object({
                key: Joi.string().trim().required(),
                label: Joi.string().trim().required(),
                type: Joi.string()
                    .valid('TEXT', 'TEXTAREA', 'NUMBER', 'SELECT', 'MULTI_SELECT', 'RADIO', 'CHECKBOX', 'DATE', 'FILE')
                    .required(),
                required: Joi.boolean().optional(),
                placeholder: Joi.string().trim().allow('').optional(),
                options: Joi.array().items(Joi.string().trim()).optional(),
                sortOrder: Joi.number().optional(),
            })
        )
        .optional(),
});

export const rejectServiceRequestSchema = Joi.object({
    rejectionReason: Joi.string().trim().min(3).required().messages({
        'string.empty': 'Rejection reason is required',
        'string.min': 'Rejection reason must be at least 3 characters long',
    }),
});
