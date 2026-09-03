import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import Vendor from '../models/Vendor.model.js';
import VendorService from '../models/VendorService.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/safefire';

async function migrateVendorCapabilities() {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB.');

    try {
        const vendors = await Vendor.find({});
        console.log(`Found ${vendors.length} vendors in database.`);

        let migratedCount = 0;
        for (const vendor of vendors) {
            const hasActiveServices = await VendorService.exists({
                vendorId: vendor._id,
                isActive: true,
            });

            const currentCaps = vendor.vendorCapabilities || {};
            const updatedCaps = {
                sellsProducts: currentCaps.sellsProducts !== undefined ? currentCaps.sellsProducts : true,
                providesServices: currentCaps.providesServices !== undefined ? currentCaps.providesServices : Boolean(hasActiveServices),
            };

            vendor.vendorCapabilities = updatedCaps;
            await vendor.save({ validateBeforeSave: false });
            migratedCount++;

            console.log(`[Migrated] Vendor "${vendor.storeName || vendor.name}" (${vendor._id}): sellsProducts=${updatedCaps.sellsProducts}, providesServices=${updatedCaps.providesServices}`);
        }

        console.log(`Successfully migrated ${migratedCount} vendors.`);
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    }
}

migrateVendorCapabilities();
