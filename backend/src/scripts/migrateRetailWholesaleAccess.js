/**
 * Wholesale/B2B now belongs exclusively to separate Wholesaler accounts (Vendor.accountType = 'wholesaler').
 * Retail vendors that previously had wholesale access lose it and must register on the Wholesaler portal.
 *
 * The application already ignores these legacy fields; this script removes them so the data is consistent:
 *   • retail vendors: wholesaleEnabled → false, wholesaleCapability.status → 'none'
 *   • retail vendor products: wholesale.enabled → false; wholesale-only products are also deactivated
 *   • customer accounts linked to a retail vendor as a wholesale buyer: link removed
 *
 * Dry run by default. Usage: node src/scripts/migrateRetailWholesaleAccess.js [--apply]
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import Vendor from '../models/Vendor.model.js';
import Product from '../models/Product.model.js';
import User from '../models/User.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/safefire';
const apply = process.argv.includes('--apply');

const RETAIL = { accountType: { $ne: 'wholesaler' } };

async function migrateRetailWholesaleAccess() {
    await mongoose.connect(MONGODB_URI);
    console.log(`Connected. Mode: ${apply ? 'APPLY' : 'dry-run (pass --apply to write)'}`);

    const retailVendorIds = await Vendor.find({
        ...RETAIL,
        $or: [{ 'vendorCapabilities.wholesaleEnabled': true }, { 'wholesaleCapability.status': { $nin: ['none', null] } }],
    }).distinct('_id');
    const allRetailIds = await Vendor.find(RETAIL).distinct('_id');

    const productFilter = { vendorId: { $in: allRetailIds }, 'wholesale.enabled': true };
    const [mixedProducts, wholesaleOnlyProducts, linkedUsers] = await Promise.all([
        Product.countDocuments({ ...productFilter, b2cAvailable: { $ne: false } }),
        Product.countDocuments({ ...productFilter, b2cAvailable: false }),
        User.countDocuments({ linkedWholesaleVendorId: { $in: allRetailIds } }),
    ]);

    console.table({
        'Retail vendors with wholesale flags': retailVendorIds.length,
        'Retail B2C+B2B products (B2B disabled)': mixedProducts,
        'Retail B2B-only products (deactivated)': wholesaleOnlyProducts,
        'Customer accounts linked to retail vendors': linkedUsers,
    });

    if (apply) {
        await Vendor.updateMany(
            { _id: { $in: retailVendorIds } },
            { $set: { 'vendorCapabilities.wholesaleEnabled': false, 'wholesaleCapability.status': 'none' } }
        );
        await Product.updateMany(
            { ...productFilter, b2cAvailable: false },
            { $set: { 'wholesale.enabled': false, isActive: false } }
        );
        await Product.updateMany(productFilter, { $set: { 'wholesale.enabled': false } });
        await User.updateMany(
            { linkedWholesaleVendorId: { $in: allRetailIds } },
            { $set: { linkedWholesaleVendorId: null, linkedWholesaleAt: null } }
        );
        console.log('Migration applied.');
    }

    await mongoose.disconnect();
}

migrateRetailWholesaleAccess().catch(async (err) => {
    console.error('Migration failed:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
