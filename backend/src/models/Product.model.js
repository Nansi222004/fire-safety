import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, index: true },
        slug: { type: String, required: true, unique: true },
        description: { type: String },
        price: { type: Number, required: true, min: 0 },
        originalPrice: { type: Number },
        unit: { type: String, default: 'Piece' },
        images: [{ type: String }],
        image: { type: String }, // primary image
        categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
        brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', index: true },
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
        stock: {
            type: String,
            enum: ['in_stock', 'low_stock', 'out_of_stock'],
            default: 'in_stock',
            index: true,
        },
        stockQuantity: { type: Number, default: 0, min: 0 },
        totalAllowedQuantity: { type: Number, min: 0 },
        minimumOrderQuantity: { type: Number, min: 1, default: 1 },
        lowStockThreshold: { type: Number, default: 10 },
        variants: {
            sizes: [String],
            colors: [String],
            materials: [String],
            attributes: [{
                name: String,
                values: [String],
            }],
            prices: { type: Map, of: Number },
            stockMap: { type: Map, of: Number },
            imageMap: { type: Map, of: String },
            defaultVariant: {
                size: String,
                color: String,
            },
            defaultSelection: {
                type: Map,
                of: String,
            },
        },
        flashSale: { type: Boolean, default: false, index: true },
        isNewArrival: { type: Boolean, default: false, index: true },
        isFeatured: { type: Boolean, default: false, index: true },
        isActive: { type: Boolean, default: true, index: true },
        isVisible: { type: Boolean, default: true },
        // ─── Sales channels (B2C / B2B) ───────────────────────────────────
        // b2cAvailable: missing/true → normal retail product (existing behaviour).
        // wholesale.enabled: product is purchasable by approved wholesale buyers.
        b2cAvailable: { type: Boolean, default: true, index: true },
        wholesale: {
            enabled: { type: Boolean, default: false, index: true },
            price: { type: Number, min: 0 },
            moq: { type: Number, min: 1, default: 1 },
        },
        codAllowed: { type: Boolean, default: true },
        returnable: { type: Boolean, default: true },
        cancelable: { type: Boolean, default: true },

        // ─── Logistics / Shipping ─────────────────────────────────────────
        // SafeFire's canonical weight unit is kilograms. Provider-specific unit
        // conversion belongs only in the external provider adapter.
        weight: { type: Number, default: 0.5, min: 0.001 }, // kg
        dimensions: {
            length:  { type: Number, default: 15, min: 1 }, // cm
            breadth: { type: Number, default: 12, min: 1 }, // cm
            height:  { type: Number, default: 8,  min: 1 }, // cm
        },

        taxIncluded: { type: Boolean, default: false },
        warrantyPeriod: { type: String },
        guaranteePeriod: { type: String },
        hsnCode: { type: String },
        rating: { type: Number, default: 0, min: 0, max: 5 },
        reviewCount: { type: Number, default: 0 },
        taxRate: { type: Number, default: 18 },
        seoTitle: { type: String },
        seoDescription: { type: String },
        relatedProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
        faqs: [{ question: String, answer: String }],
        tags: [String],
    },
    { timestamps: true }
);

productSchema.index({ vendorId: 1, isActive: 1 });
productSchema.index({ categoryId: 1, isActive: 1 });
productSchema.index({ isActive: 1, createdAt: -1 });
productSchema.index({ isActive: 1, price: 1 });
productSchema.index({ isActive: 1, reviewCount: -1, rating: -1 });
productSchema.index({ isActive: 1, flashSale: 1, createdAt: -1 });
productSchema.index({ isActive: 1, isNewArrival: 1, createdAt: -1 });
productSchema.index({ name: 'text', description: 'text', tags: 'text' });

const Product = mongoose.model('Product', productSchema);
export { Product };
export default Product;
