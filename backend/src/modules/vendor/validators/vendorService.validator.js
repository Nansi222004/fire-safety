import Joi from 'joi';

const objectId = Joi.string().pattern(/^[0-9a-fA-F]{24}$/);

export const vendorServiceIdParamSchema = Joi.object({
    id: objectId.required(),
});

export const enableServiceParamSchema = Joi.object({
    serviceId: objectId.required(),
});

export const updateVendorServiceSchema = Joi.object({
    price: Joi.number().min(0).optional(),
    variantPrices: Joi.object().pattern(Joi.string(), Joi.number().min(0)).optional(),
    serviceAreas: Joi.array().items(Joi.string().trim().allow('')).optional(),
    workingHours: Joi.object({
        start: Joi.string().trim().optional(),
        end: Joi.string().trim().optional(),
    }).optional(),
    dailyCapacity: Joi.number().integer().min(0).optional(),
    vendorNotes: Joi.string().trim().allow('').optional(),
    isActive: Joi.boolean().optional(),
    status: Joi.string().valid('ACTIVE', 'INACTIVE').optional(),
}).min(1);

export const updateVendorServiceStatusSchema = Joi.object({
    isActive: Joi.boolean().optional(),
    status: Joi.string().valid('ACTIVE', 'INACTIVE').optional(),
}).or('isActive', 'status');
