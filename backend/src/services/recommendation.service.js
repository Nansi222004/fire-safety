import mongoose from 'mongoose';
import Product from '../models/Product.model.js';

export class RecommendationService {
    static async getProducts({ source, categories = [], brands = [], averagePrice, excludeProductIds = [], limit = 12 }) {
        const excludeList = (excludeProductIds || [])
            .map(id => (id && typeof id === 'object' ? id._id || id.id : id))
            .filter(id => id && mongoose.Types.ObjectId.isValid(String(id)))
            .map(id => String(id));

        const validCategories = (categories || [])
            .map(c => (c && typeof c === 'object' ? c._id || c.id : c))
            .filter(c => c && mongoose.Types.ObjectId.isValid(String(c)))
            .map(c => String(c));

        const validBrands = (brands || [])
            .map(b => (b && typeof b === 'object' ? b._id || b.id : b))
            .filter(b => b && mongoose.Types.ObjectId.isValid(String(b)))
            .map(b => String(b));

        const baseQuery = {
            isActive: true,
            b2cAvailable: { $ne: false },
            _id: { $nin: excludeList }
        };

        let matchingProducts = [];

        // 1. Same Category
        if (validCategories.length > 0) {
            const catMatches = await Product.find({
                ...baseQuery,
                categoryId: { $in: validCategories }
            })
            .limit(limit)
            .lean();
            matchingProducts = [...catMatches];
        }

        // 2. Same Brand
        if (matchingProducts.length < limit && validBrands.length > 0) {
            const currentIds = matchingProducts.map(p => String(p._id));
            const remainingLimit = limit - matchingProducts.length;
            const brandMatches = await Product.find({
                ...baseQuery,
                _id: { $nin: [...excludeList, ...currentIds] },
                brandId: { $in: validBrands }
            })
            .limit(remainingLimit)
            .lean();
            matchingProducts = [...matchingProducts, ...brandMatches];
        }

        // 3. Similar Price Range (+/- 20% of averagePrice)
        if (matchingProducts.length < limit && averagePrice > 0) {
            const currentIds = matchingProducts.map(p => String(p._id));
            const remainingLimit = limit - matchingProducts.length;
            const minPrice = averagePrice * 0.8;
            const maxPrice = averagePrice * 1.2;
            const priceMatches = await Product.find({
                ...baseQuery,
                _id: { $nin: [...excludeList, ...currentIds] },
                price: { $gte: minPrice, $lte: maxPrice }
            })
            .limit(remainingLimit)
            .lean();
            matchingProducts = [...matchingProducts, ...priceMatches];
        }

        // 4. Fallback (Trending/Best Sellers/Newest)
        if (matchingProducts.length < limit) {
            const currentIds = matchingProducts.map(p => String(p._id));
            const remainingLimit = limit - matchingProducts.length;
            const fallbacks = await Product.find({
                ...baseQuery,
                _id: { $nin: [...excludeList, ...currentIds] }
            })
            .sort({ rating: -1, reviewCount: -1, createdAt: -1 })
            .limit(remainingLimit)
            .lean();
            matchingProducts = [...matchingProducts, ...fallbacks];
        }

        // Standardize IDs for frontend mapping
        return matchingProducts.slice(0, limit).map(p => ({
            ...p,
            id: String(p._id)
        }));
    }
}

export default RecommendationService;
