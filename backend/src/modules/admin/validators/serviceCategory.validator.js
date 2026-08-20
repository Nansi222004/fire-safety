import Joi from 'joi';

const objectId = Joi.string().pattern(/^[0-9a-fA-F]{24}$/);

export const serviceCategoryIdParamSchema = Joi.object({
    id: objectId.required(),
});

export const createServiceCategorySchema = Joi.object({
    name: Joi.string().trim().min(2).max(120).required(),
    description: Joi.string().trim().allow('').optional(),
    image: Joi.string().trim().allow('').optional(),
    sortOrder: Joi.number().integer().min(0).optional(),
    isActive: Joi.boolean().optional(),
    status: Joi.string().valid('ACTIVE', 'INACTIVE').optional(),
});

export const updateServiceCategorySchema = Joi.object({
    name: Joi.string().trim().min(2).max(120).optional(),
    description: Joi.string().trim().allow('').optional(),
    image: Joi.string().trim().allow('').optional(),
    sortOrder: Joi.number().integer().min(0).optional(),
    isActive: Joi.boolean().optional(),
    status: Joi.string().valid('ACTIVE', 'INACTIVE').optional(),
}).min(1);

export const updateServiceCategoryStatusSchema = Joi.object({
    isActive: Joi.boolean().optional(),
    status: Joi.string().valid('ACTIVE', 'INACTIVE').optional(),
}).or('isActive', 'status');
