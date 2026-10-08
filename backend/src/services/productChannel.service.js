import ApiError from '../utils/ApiError.js';

const toPositiveMoney = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
};

const toPositiveInteger = (value) => {
    const number = Number(value);
    return Number.isInteger(number) && number >= 1 ? number : null;
};

/**
 * Resolve and authorize the canonical Product sales-channel fields.
 * Wholesale is part of Product, never a separate product entity.
 */
export const resolveProductSalesChannels = ({
    body = {},
    currentProduct = null,
    vendorCapabilities = {},
    wholesaleCapability = {},
}) => {
    const currentB2c = currentProduct ? currentProduct.b2cAvailable !== false : true;
    const currentWholesale = currentProduct?.wholesale || {};
    const submittedWholesale = body.wholesale && typeof body.wholesale === 'object'
        ? body.wholesale
        : {};

    const b2cAvailable = body.b2cAvailable !== undefined
        ? Boolean(body.b2cAvailable)
        : currentB2c;
    const wholesaleEnabled = submittedWholesale.enabled !== undefined
        ? Boolean(submittedWholesale.enabled)
        : currentWholesale.enabled === true;

    if (!b2cAvailable && !wholesaleEnabled) {
        throw new ApiError(400, 'A product must be available on at least one sales channel (B2C or B2B).');
    }
    if (b2cAvailable && vendorCapabilities.sellsProducts !== true) {
        throw new ApiError(403, 'Retail (B2C) availability requires the Product Seller capability.');
    }
    if (
        wholesaleEnabled
        && (vendorCapabilities.wholesaleEnabled !== true || wholesaleCapability.status !== 'approved')
    ) {
        throw new ApiError(403, 'Approved Wholesale/B2B capability is required for B2B product availability.');
    }

    const wholesalePrice = submittedWholesale.price !== undefined
        ? toPositiveMoney(submittedWholesale.price)
        : toPositiveMoney(currentWholesale.price);
    const wholesaleMoq = submittedWholesale.moq !== undefined
        ? toPositiveInteger(submittedWholesale.moq)
        : (toPositiveInteger(currentWholesale.moq) || 1);

    if (wholesaleEnabled && wholesalePrice === null) {
        throw new ApiError(400, 'Wholesale price must be greater than 0 when B2B is enabled.');
    }
    if (wholesaleEnabled && wholesaleMoq === null) {
        throw new ApiError(400, 'Wholesale MOQ must be a whole number of at least 1.');
    }

    return {
        b2cAvailable,
        wholesale: {
            enabled: wholesaleEnabled,
            ...(wholesalePrice !== null ? { price: wholesalePrice } : {}),
            moq: wholesaleMoq || 1,
        },
    };
};
