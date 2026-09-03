import Joi from 'joi';

const objectId = Joi.string().pattern(/^[0-9a-fA-F]{24}$/);

const serviceFieldSchema = Joi.object({
    _id: objectId.optional(),
    key: Joi.string().trim().min(1).max(60).required(),
    label: Joi.string().trim().min(1).max(100).required(),
    type: Joi.string()
        .valid('TEXT', 'TEXTAREA', 'NUMBER', 'SELECT', 'MULTI_SELECT', 'RADIO', 'CHECKBOX', 'DATE', 'FILE')
        .required(),
    required: Joi.boolean().optional(),
    placeholder: Joi.string().trim().allow('').optional(),
    options: Joi.array().items(Joi.string().trim().allow('')).optional(),
    sortOrder: Joi.number().integer().min(0).optional(),
});

const serviceSettingsSchema = Joi.object({
    requiresAddress: Joi.boolean().optional(),
    requiresDate: Joi.boolean().optional(),
    requiresTimeSlot: Joi.boolean().optional(),
    requiresQuantity: Joi.boolean().optional(),
    requiresSiteVisit: Joi.boolean().optional(),
    requiresQuote: Joi.boolean().optional(),
    requiresDocuments: Joi.boolean().optional(),
    isRecurring: Joi.boolean().optional(),
}).optional();

export const serviceIdParamSchema = Joi.object({
    id: objectId.required(),
});

export const createServiceSchema = Joi.object({
    name: Joi.string().trim().min(2).max(150).required(),
    categoryId: objectId.required(),
    description: Joi.string().trim().allow('').optional(),
    shortDescription: Joi.string().trim().allow('').optional(),
    image: Joi.string().trim().allow('').optional(),
    sortOrder: Joi.number().integer().min(0).optional(),
    isActive: Joi.boolean().optional(),
    status: Joi.string().valid('ACTIVE', 'INACTIVE').optional(),
    pricingType: Joi.string()
        .valid('FIXED', 'PER_UNIT', 'SIZE_BASED', 'CUSTOM_QUOTE')
        .optional(),
    bookingType: Joi.string()
        .valid('INSTANT', 'SCHEDULED', 'SITE_VISIT', 'CUSTOM_QUOTE')
        .optional(),
    estimatedDuration: Joi.string().trim().allow('').optional(),
    serviceSettings: serviceSettingsSchema,
    serviceFields: Joi.array().items(serviceFieldSchema).optional(),
});

export const updateServiceSchema = Joi.object({
    name: Joi.string().trim().min(2).max(150).optional(),
    categoryId: objectId.optional(),
    description: Joi.string().trim().allow('').optional(),
    shortDescription: Joi.string().trim().allow('').optional(),
    image: Joi.string().trim().allow('').optional(),
    sortOrder: Joi.number().integer().min(0).optional(),
    isActive: Joi.boolean().optional(),
    status: Joi.string().valid('ACTIVE', 'INACTIVE').optional(),
    pricingType: Joi.string()
        .valid('FIXED', 'PER_UNIT', 'SIZE_BASED', 'CUSTOM_QUOTE')
        .optional(),
    bookingType: Joi.string()
        .valid('INSTANT', 'SCHEDULED', 'SITE_VISIT', 'CUSTOM_QUOTE')
        .optional(),
    estimatedDuration: Joi.string().trim().allow('').optional(),
    serviceSettings: serviceSettingsSchema,
    serviceFields: Joi.array().items(serviceFieldSchema).optional(),
}).min(1);

export const updateServiceStatusSchema = Joi.object({
    isActive: Joi.boolean().optional(),
    status: Joi.string().valid('ACTIVE', 'INACTIVE').optional(),
}).or('isActive', 'status');
