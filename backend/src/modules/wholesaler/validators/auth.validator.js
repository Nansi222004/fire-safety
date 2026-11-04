import Joi from 'joi';

// 15-character Indian GSTIN: 2-digit state code + PAN + entity number + 'Z' + checksum.
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const requiredText = (label) => Joi.string().trim().min(2).required().messages({
    'any.required': `${label} is required.`,
    'string.empty': `${label} is required.`,
});

export const wholesalerRegisterSchema = Joi.object({
    name: Joi.string().trim().min(2).max(50).required(),
    email: Joi.string().email({ tlds: false }).lowercase().required(),
    password: Joi.string().min(6).required(),
    phone: Joi.string().trim().required(),
    businessName: Joi.string().trim().min(2).max(100).required(),
    gstNumber: Joi.string().trim().uppercase().pattern(GSTIN_PATTERN).required().messages({
        'any.required': 'GSTIN is required.',
        'string.empty': 'GSTIN is required.',
        'string.pattern.base': 'Enter a valid 15-character GSTIN.',
    }),
    businessType: Joi.string().trim().max(100).allow('').optional(),
    expectedMonthlyVolume: Joi.string().trim().max(100).allow('').optional(),
    description: Joi.string().trim().max(1000).allow('').optional(),
    address: Joi.object({
        street: requiredText('Street Address'),
        city: requiredText('City'),
        state: requiredText('State'),
        zipCode: requiredText('Zip Code'),
        country: requiredText('Country'),
    }).required().messages({
        'any.required': 'Business Address is required.',
    }),
    documents: Joi.object({
        license: Joi.string().allow('').optional(),
        identity: Joi.string().allow('').optional(),
    }).optional(),
});
