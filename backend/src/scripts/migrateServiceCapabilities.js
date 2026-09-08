import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/safe-fire';

async function migrate() {
    console.log('Connecting to MongoDB at:', MONGO_URI.replace(/:[^:@]+@/, ':***@'));
    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;

    const vendorsCol = db.collection('vendors');

    // 1. Approved service vendors
    const approvedRes = await vendorsCol.updateMany(
        {
            'vendorCapabilities.providesServices': true,
            $or: [
                { 'serviceCapability.status': { $exists: false } },
                { 'serviceCapability.status': 'none' },
                { 'serviceCapability.status': null }
            ]
        },
        {
            $set: {
                'serviceCapability.status': 'approved',
                'serviceCapability.appliedAt': new Date(),
                'serviceCapability.reviewedAt': new Date()
            }
        }
    );
    console.log(`✅ Updated existing service vendors to approved: ${approvedRes.modifiedCount}`);

    // 2. Unapproved / product-only vendors
    const noneRes = await vendorsCol.updateMany(
        {
            'vendorCapabilities.providesServices': { $ne: true },
            $or: [
                { 'serviceCapability.status': { $exists: false } },
                { 'serviceCapability.status': null }
            ]
        },
        {
            $set: {
                'serviceCapability.status': 'none'
            }
        }
    );
    console.log(`✅ Initialized serviceCapability for product/unapproved vendors: ${noneRes.modifiedCount}`);

    await mongoose.disconnect();
    console.log('Migration complete.');
}

migrate().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
