import assert from 'node:assert/strict';
import { createProductSchema, updateProductSchema } from '../modules/vendor/validators/product.validator.js';

const base = {
    name: 'SafeFire Unified Product',
    price: 5000,
    categoryId: '507f1f77bcf86cd799439011',
    stockQuantity: 200,
    weight: 1,
    dimensions: { length: 30, breadth: 20, height: 15 },
};

assert.equal(createProductSchema.validate({ ...base, b2cAvailable: true }).error, undefined);
assert.equal(
    createProductSchema.validate({
        ...base,
        b2cAvailable: true,
        wholesale: { enabled: true, price: 4200, moq: 10 },
    }).error,
    undefined
);
assert.match(
    createProductSchema.validate({
        ...base,
        b2cAvailable: false,
        wholesale: { enabled: true, price: 0, moq: 10 },
    }).error?.message || '',
    /greater than 0/
);
assert.match(
    updateProductSchema.validate({ wholesale: { enabled: true, price: 4200, moq: 0 } }).error?.message || '',
    /greater than or equal to 1/
);

console.log('Unified Product validation tests passed.');
