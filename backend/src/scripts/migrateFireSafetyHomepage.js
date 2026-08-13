import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

import HomeSection from '../models/HomeSection.model.js';
import HomeBanner from '../models/HomeBanner.model.js';
import Banner from '../models/Banner.model.js';
import Category from '../models/Category.model.js';
import Product from '../models/Product.model.js';

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/safe-fire';

const migrateFireSafetyHomepage = async () => {
    try {
        console.log('🔄 Connecting to MongoDB for Fire Safety Homepage Migration...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB:', mongoose.connection.name);

        // 1. Purge legacy homepage sections, home banners, and slider banners
        console.log('🗑️ Purging legacy HomeSection, HomeBanner, and Banner records...');
        await HomeSection.deleteMany({});
        await HomeBanner.deleteMany({});
        await Banner.deleteMany({});

        // 2. Fetch current Fire Safety categories and products for linking
        const categories = await Category.find({ isActive: true }).lean();
        const products = await Product.find({ isActive: true }).lean();

        console.log(`📦 Found ${categories.length} categories and ${products.length} products in DB.`);

        const categoryIds = categories.map(c => c._id);
        const productIds = products.map(p => p._id);

        // 3. Seed Slider & Promo Banners into Banner collection
        console.log('✨ Seeding Fire Safety Banners...');
        const seededBanners = await Banner.insertMany([
            {
                name: 'Protect What Matters Hero Slide',
                title: 'Protect What Matters',
                subtitle: 'RELIABLE FIRE PROTECTION',
                description: 'Professional ABC dry powder & CO₂ fire extinguishers for home, workplace, and business.',
                image: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=1200&q=80',
                desktopImage: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=1200&q=80',
                mobileImage: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=600&q=80',
                type: 'home_slider',
                linkUrl: '/shop',
                buttonText: 'Shop Safety Products',
                buttonStyle: 'primary',
                order: 1,
                isActive: true
            },
            {
                name: 'Fire Equipment Showcase Hero Slide',
                title: 'Be Prepared Before It\'s Too Late',
                subtitle: 'FIRE SAFETY EQUIPMENT',
                description: 'Certified fire blankets, high-sensitivity smoke alarms, and heavy-duty hose reels.',
                image: 'https://images.unsplash.com/photo-1599481238640-4c1288750d7a?auto=format&fit=crop&w=1200&q=80',
                desktopImage: 'https://images.unsplash.com/photo-1599481238640-4c1288750d7a?auto=format&fit=crop&w=1200&q=80',
                mobileImage: 'https://images.unsplash.com/photo-1599481238640-4c1288750d7a?auto=format&fit=crop&w=600&q=80',
                type: 'home_slider',
                linkUrl: '/categories',
                buttonText: 'Explore Equipment',
                buttonStyle: 'primary',
                order: 2,
                isActive: true
            },
            {
                name: 'Certified Protection Gear Hero Slide',
                title: 'Safety Today, Secure Tomorrow',
                subtitle: 'CERTIFIED PROTECTION GEAR',
                description: 'Equip your facility with trusted fire safety accessories, exit signs, and safety gear.',
                image: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=1200&q=80',
                desktopImage: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=1200&q=80',
                mobileImage: 'https://images.unsplash.com/photo-1544027993-37dbfe43562a?auto=format&fit=crop&w=600&q=80',
                type: 'home_slider',
                linkUrl: '/shop',
                buttonText: 'Shop Safety',
                buttonStyle: 'primary',
                order: 3,
                isActive: true
            },
            {
                name: 'Fire Protection Promotional Banner',
                title: 'Annual Maintenance & Refill Services',
                subtitle: 'EXPERT AMC INSPECTION',
                description: 'Book certified fire safety inspection, pressure testing, and extinguisher refills.',
                image: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=1200&q=80',
                desktopImage: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=1200&q=80',
                mobileImage: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=600&q=80',
                type: 'promotional',
                linkUrl: '/services',
                buttonText: 'Explore AMC Services',
                buttonStyle: 'primary',
                order: 1,
                isActive: true
            },
            {
                name: 'Emergency Exit Equipment Side Banner',
                title: 'Emergency Exit & Safety Signs',
                subtitle: 'COMPLIANCE GEAR',
                description: 'Photoluminescent exit signs, fire sirens, and emergency LED beacons.',
                image: 'https://images.unsplash.com/photo-1599481238640-4c1288750d7a?auto=format&fit=crop&w=600&q=80',
                desktopImage: 'https://images.unsplash.com/photo-1599481238640-4c1288750d7a?auto=format&fit=crop&w=600&q=80',
                mobileImage: 'https://images.unsplash.com/photo-1599481238640-4c1288750d7a?auto=format&fit=crop&w=600&q=80',
                type: 'side_banner',
                linkUrl: '/categories',
                buttonText: 'Explore Signs',
                buttonStyle: 'primary',
                order: 1,
                isActive: true
            }
        ]);

        console.log(`✅ Seeded ${seededBanners.length} Fire Safety Banner documents.`);

        // 4. Seed Default Banners into HomeBanner collection
        console.log('✨ Seeding HomeBanner defaults...');
        const seededHomeBanners = await HomeBanner.insertMany([
            {
                name: 'Default Flash Sale Banner',
                title: 'Be Prepared. Stay Protected.',
                subtitle: 'Essential fire extinguishers & suppression equipment for home & office.',
                desktopImage: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=1200&q=80',
                mobileImage: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=600&q=80',
                ctaText: 'Shop Safety Products',
                ctaLink: '/shop?flashSale=true',
                textColor: '#ffffff',
                buttonColor: '#e31e24',
                backgroundColor: '#e31e24',
                gradient: 'linear-gradient(135deg, #e31e24 0%, #1f1f1f 100%)',
                overlayOpacity: 0.4,
                isDefault: true,
                sectionType: 'flash_sale',
                tags: ['default', 'flash_sale']
            },
            {
                name: 'Default Seasonal Campaign Banner',
                title: 'Fire Safety Equipment Showcase',
                subtitle: 'Certified fire blankets, smoke alarms, and heavy-duty hose reels.',
                desktopImage: 'https://images.unsplash.com/photo-1599481238640-4c1288750d7a?auto=format&fit=crop&w=1200&q=80',
                mobileImage: 'https://images.unsplash.com/photo-1599481238640-4c1288750d7a?auto=format&fit=crop&w=600&q=80',
                ctaText: 'Explore Equipment',
                ctaLink: '/shop?newArrivals=true',
                textColor: '#ffffff',
                buttonColor: '#e31e24',
                backgroundColor: '#e31e24',
                gradient: 'linear-gradient(135deg, #e31e24 0%, #ff6a00 100%)',
                overlayOpacity: 0.35,
                isDefault: true,
                sectionType: 'seasonal_collection',
                tags: ['default', 'seasonal']
            },
            {
                name: 'Default Promotional Banner',
                title: 'Safety Today, Secure Tomorrow',
                subtitle: 'Explore certified fire protection gear at competitive rates.',
                desktopImage: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=1200&q=80',
                mobileImage: 'https://images.unsplash.com/photo-1544027993-37dbfe43562a?auto=format&fit=crop&w=600&q=80',
                ctaText: 'Shop Safety',
                ctaLink: '/offers',
                textColor: '#ffffff',
                buttonColor: '#ffffff',
                backgroundColor: '#e31e24',
                gradient: 'linear-gradient(135deg, #e31e24 0%, #1f1f1f 100%)',
                overlayOpacity: 0.3,
                isDefault: true,
                sectionType: 'promotional_banner',
                tags: ['default', 'promotion']
            }
        ]);

        console.log(`✅ Seeded ${seededHomeBanners.length} HomeBanner documents.`);

        // 5. Seed HomeSection collection
        console.log('✨ Seeding HomeSection documents...');
        const seededHomeSections = await HomeSection.insertMany([
            {
                key: 'flash_sale',
                sectionType: 'flash_sale',
                title: 'Super Safety Flash Sale',
                subtitle: 'Limited time offers on certified fire extinguishers.',
                isActive: true,
                order: 1,
                displayLimit: 10,
                minimumProducts: 4,
                layout: 'carousel',
                curationMode: 'manual',
                products: productIds.slice(0, 5),
                categories: categoryIds.slice(0, 4),
                bannerAsset: seededHomeBanners[0]._id,
                version: 1,
            },
            {
                key: 'seasonal_collection',
                sectionType: 'seasonal_collection',
                title: 'Fire Safety Equipment Collection',
                subtitle: 'Explore certified fire protection gear for your facility.',
                isActive: true,
                order: 2,
                displayLimit: 10,
                minimumProducts: 4,
                layout: 'horizontal',
                curationMode: 'manual',
                products: productIds,
                categories: categoryIds.slice(0, 6),
                bannerAsset: seededHomeBanners[1]._id,
                version: 1,
            },
            {
                key: 'promotional_banner',
                sectionType: 'promotional_banner',
                title: 'Fire Protection AMC & Refill Campaign',
                subtitle: 'Scheduled maintenance, refilling, and pressure testing.',
                isActive: true,
                order: 3,
                displayLimit: 1,
                minimumProducts: 0,
                layout: 'banner',
                curationMode: 'manual',
                products: productIds.slice(0, 2),
                categories: categoryIds.slice(0, 3),
                bannerAsset: seededHomeBanners[2]._id,
                version: 1,
            }
        ]);

        console.log(`✅ Seeded ${seededHomeSections.length} HomeSection documents.`);

        console.log('🎉 Fire Safety Homepage Migration completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
};

migrateFireSafetyHomepage();
