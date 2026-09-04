/**
 * 🔥 SafeFire Official Promotional Coupons Seeder
 * Idempotent seeder: Creates or updates approved SafeFire promotional codes without duplicating.
 * Execute manually via: npm run seed:coupons or node src/scripts/seedCoupons.js
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const { default: Coupon } = await import('../models/Coupon.model.js');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/safe-fire';

const OFFICIAL_COUPONS = [
    {
        code: 'SAFEFIRE10',
        name: 'SafeFire 10% Welcome Discount',
        type: 'percentage',
        value: 10,
        minOrderValue: 999,
        maxDiscount: 500,
        usageLimit: 10000,
        isActive: true,
        startsAt: new Date('2026-01-01T00:00:00Z'),
        expiresAt: new Date('2026-12-31T23:59:59Z'),
    },
    {
        code: 'FLAT200',
        name: 'Flat ₹200 Equipment Discount',
        type: 'fixed',
        value: 200,
        minOrderValue: 1999,
        maxDiscount: 200,
        usageLimit: 5000,
        isActive: true,
        startsAt: new Date('2026-01-01T00:00:00Z'),
        expiresAt: new Date('2026-12-31T23:59:59Z'),
    },
    {
        code: 'FREESHIP',
        name: 'Free Shipping on Safety Equipment',
        type: 'freeship',
        value: 0,
        minOrderValue: 499,
        usageLimit: 50000,
        isActive: true,
        startsAt: new Date('2026-01-01T00:00:00Z'),
        expiresAt: new Date('2026-12-31T23:59:59Z'),
    },
    {
        code: 'B2BFIRE5',
        name: 'B2B & Bulk Order Special 5%',
        type: 'percentage',
        value: 5,
        minOrderValue: 5000,
        maxDiscount: 2500,
        usageLimit: 2000,
        isActive: true,
        startsAt: new Date('2026-01-01T00:00:00Z'),
        expiresAt: new Date('2026-12-31T23:59:59Z'),
    },
];

async function seedCoupons() {
    console.log('===============================================================');
    console.log('🔥 SafeFire Official Promo Codes Seeder');
    console.log('===============================================================\n');

    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB:', mongoose.connection.name);

        let createdCount = 0;
        let updatedCount = 0;

        for (const couponData of OFFICIAL_COUPONS) {
            const existing = await Coupon.findOne({ code: couponData.code });
            if (existing) {
                await Coupon.updateOne({ code: couponData.code }, { $set: couponData });
                console.log(`  🔄 [UPDATED] ${couponData.code} (${couponData.type === 'percentage' ? `${couponData.value}%` : couponData.type === 'fixed' ? `₹${couponData.value}` : 'Free Shipping'}, Min: ₹${couponData.minOrderValue})`);
                updatedCount++;
            } else {
                await Coupon.create(couponData);
                console.log(`  ✅ [CREATED] ${couponData.code} (${couponData.type === 'percentage' ? `${couponData.value}%` : couponData.type === 'fixed' ? `₹${couponData.value}` : 'Free Shipping'}, Min: ₹${couponData.minOrderValue})`);
                createdCount++;
            }
        }

        const totalInDb = await Coupon.countDocuments();
        console.log(`\n🏁 Seeding Complete: ${createdCount} created, ${updatedCount} updated. Total active coupons in database: ${totalInDb}`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('❌ Seeding error:', err);
        await mongoose.disconnect();
        process.exit(1);
    }
}

seedCoupons();
