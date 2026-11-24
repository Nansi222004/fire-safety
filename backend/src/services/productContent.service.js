import mongoose from 'mongoose';
import Product from '../models/Product.model.js';
import Category from '../models/Category.model.js';

/**
 * Specification names already used by active products in a category (and its sub-categories), most used
 * first. Nothing is hardcoded: suggestions grow from what sellers/Admin actually enter, so every category
 * gets its own vocabulary. Only names are returned (never values or product/seller details).
 * Names differing only in case are one suggestion, shown in their most-used spelling.
 */
export const getSpecificationSuggestions = async (categoryId, { limit = 30 } = {}) => {
    if (!mongoose.isValidObjectId(categoryId)) return [];
    const rootId = new mongoose.Types.ObjectId(String(categoryId));
    // The category plus up to two levels of children (products are stored on their leaf category).
    const level1 = await Category.find({ parentId: rootId }).select('_id').lean();
    const level2 = level1.length ? await Category.find({ parentId: { $in: level1.map((c) => c._id) } }).select('_id').lean() : [];
    const categoryIds = [rootId, ...level1.map((c) => c._id), ...level2.map((c) => c._id)];

    const rows = await Product.aggregate([
        { $match: { categoryId: { $in: categoryIds }, isActive: { $ne: false }, 'specifications.0': { $exists: true } } },
        { $unwind: '$specifications' },
        { $match: { 'specifications.label': { $type: 'string', $ne: '' } } },
        // Count each exact spelling, then fold spellings together keeping the most-used one (ties: alphabetical).
        { $group: { _id: { key: { $toLower: '$specifications.label' }, label: '$specifications.label' }, uses: { $sum: 1 } } },
        { $sort: { uses: -1, '_id.label': 1 } },
        { $group: { _id: '$_id.key', label: { $first: '$_id.label' }, uses: { $sum: '$uses' } } },
        { $sort: { uses: -1, label: 1 } },
        { $limit: Math.min(Math.max(Number(limit) || 30, 1), 50) },
    ]);
    return rows.map((row) => row.label);
};

export default getSpecificationSuggestions;
