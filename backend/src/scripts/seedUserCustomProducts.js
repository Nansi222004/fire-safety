import 'dotenv/config';
import mongoose from 'mongoose';
import Category from '../models/Category.model.js';
import Product from '../models/Product.model.js';
import Brand from '../models/Brand.model.js';
import Vendor from '../models/Vendor.model.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/safe-fire';

const seedCustomProducts = async () => {
  try {
    console.log(`📡 Connecting to MongoDB Atlas at ${MONGO_URI}...`);
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB.');

    // 1. Get or create Brand "SafeFire"
    const brand = await Brand.findOneAndUpdate(
      { name: 'SafeFire' },
      {
        $set: {
          name: 'SafeFire',
          slug: 'safefire',
          visibility: 'global',
          isActive: true,
          logo: '/logos/safefire_logo.png',
        },
      },
      { upsert: true, new: true }
    );

    // 2. Get default vendor
    const vendor = (await Vendor.findOne({ email: 'vendor@safefire.demo' })) ||
      (await Vendor.findOne({})) ||
      (await Vendor.create({
        name: 'SafeFire Official Store',
        storeName: 'SafeFire Official Store',
        email: 'vendor@safefire.demo',
        phone: '+91 98765 43210',
        isVerified: true,
        status: 'approved',
      }));

    // 3. Category mapping
    const allCategories = await Category.find({}).lean();
    console.log(`📦 Found ${allCategories.length} categories in database.`);
    const catMap = {};
    allCategories.forEach((c) => {
      catMap[c.slug] = c._id;
    });

    const PRODUCTS_DATA = [
      {
        name: 'ABC Dry Powder Fire Extinguisher – 6 KG',
        slug: 'abc-dry-powder-fire-extinguisher-6kg',
        sku: 'SF-ABC-06KG',
        categorySlug: 'abc-fire-extinguishers',
        subcategoryName: 'Dry Powder Extinguishers',
        price: 1299,
        originalPrice: 1699,
        image: '/products/abc-dry-powder-fire-extinguisher-6kg.webp',
        shortDescription: 'Multi-purpose dry powder fire extinguisher designed for common fire risks involving combustible materials, flammable liquids and electrical equipment.',
        description: 'The SafeFire ABC Dry Powder Fire Extinguisher provides practical protection against common fire hazards. Its compact design makes it suitable for homes, offices, retail stores, warehouses and other general-purpose environments.',
        keyFeatures: [
          '6 KG dry chemical powder capacity',
          'Suitable for general-purpose fire protection',
          'Easy-to-operate design',
          'Pressure gauge for status checking',
          'Suitable for homes, offices, shops and commercial spaces',
        ],
        specifications: {
          'Type': 'ABC Dry Powder',
          'Capacity': '6 KG',
          'Operating Type': 'Stored Pressure',
          'Mounting': 'Wall/Floor',
          'Suitable Use': 'Residential & Commercial',
        },
        stockQuantity: 60,
        rating: 4.9,
        reviewCount: 180,
        flashSale: true,
        isFeatured: true,
      },
      {
        name: 'CO₂ Fire Extinguisher – 4.5 KG',
        slug: 'co2-fire-extinguisher-4-5kg',
        sku: 'SF-CO2-45KG',
        categorySlug: 'co2-fire-extinguishers',
        subcategoryName: 'Carbon Dioxide Extinguishers',
        price: 3499,
        originalPrice: 3999,
        image: '/products/co2-fire-extinguisher-4-5kg.webp',
        shortDescription: 'Carbon dioxide fire extinguisher designed primarily for electrical and flammable-liquid fire risks where a clean extinguishing agent is preferred.',
        description: 'The SafeFire CO₂ Fire Extinguisher is designed for fire protection around electrical equipment and other suitable fire risks. Because CO₂ leaves no powder residue, it can be useful in areas containing sensitive equipment.',
        keyFeatures: [
          '4.5 KG CO₂ capacity',
          'Clean agent with no powder residue',
          'Suitable for electrical equipment areas',
          'Durable metal cylinder',
          'Easy-to-use discharge horn',
        ],
        specifications: {
          'Type': 'CO₂',
          'Capacity': '4.5 KG',
          'Agent': 'Carbon Dioxide',
          'Discharge': 'Horn Type',
          'Suitable Areas': 'Offices, electrical rooms, server/equipment areas',
        },
        stockQuantity: 45,
        rating: 4.9,
        reviewCount: 110,
        flashSale: true,
        isFeatured: true,
      },
      {
        name: 'Fire Hose Reel – 30 Meter',
        slug: 'fire-hose-reel-30m',
        sku: 'SF-HR-30M',
        categorySlug: 'fire-hoses-hose-reels',
        subcategoryName: 'Fire Hose Reels',
        price: 6499,
        originalPrice: 7999,
        image: '/products/fire-hose-reel-30m.webp',
        shortDescription: 'Wall-mounted fire hose reel system designed to provide a convenient water delivery point during fire emergencies.',
        description: 'The SafeFire Fire Hose Reel provides an organized and accessible water hose system for fire response. The reel helps keep the hose stored neatly while allowing it to be deployed when required.',
        keyFeatures: [
          '30-meter hose',
          'Wall-mountable reel design',
          'Easy hose deployment',
          'Rotating reel mechanism',
          'Suitable for commercial and institutional buildings',
        ],
        specifications: {
          'Hose Length': '30 Meter',
          'Hose Type': 'Fire Hose',
          'Mounting': 'Wall Mounted',
          'Reel Type': 'Manual',
          'Application': 'Fire Protection Systems',
        },
        stockQuantity: 25,
        rating: 4.9,
        reviewCount: 88,
        flashSale: false,
        isFeatured: true,
      },
      {
        name: 'AFFF Foam Fire Extinguisher – 9 Litre',
        slug: 'afff-foam-fire-extinguisher-9l',
        sku: 'SF-FOAM-09L',
        categorySlug: 'foam-fire-extinguishers',
        subcategoryName: 'AFFF Foam Extinguishers',
        price: 2899,
        originalPrice: 3499,
        image: '/products/afff-foam-fire-extinguisher-9l.jpg',
        shortDescription: 'Foam-based fire extinguisher designed for suitable Class A and Class B fire risks, particularly combustible materials and flammable liquids.',
        description: 'The SafeFire AFFF Foam Fire Extinguisher provides an effective option for suitable Class A and Class B fire risks. It can be considered for commercial areas, workshops and locations where flammable liquids may be present.',
        keyFeatures: [
          '9 Litre capacity',
          'Foam extinguishing agent',
          'Suitable for selected solid-material and liquid-fire risks',
          'Easy-to-operate handle',
          'Durable cylinder construction',
        ],
        specifications: {
          'Type': 'AFFF Foam',
          'Capacity': '9 Litre',
          'Agent': 'Aqueous Film Forming Foam',
          'Operation': 'Stored Pressure',
          'Application': 'Commercial & Industrial',
        },
        stockQuantity: 35,
        rating: 4.8,
        reviewCount: 92,
        flashSale: true,
        isFeatured: true,
      },
      {
        name: 'Photoelectric Smoke & Fire Alarm',
        slug: 'photoelectric-smoke-fire-alarm',
        sku: 'SF-SD-01',
        categorySlug: 'smoke-fire-alarms',
        subcategoryName: 'Smoke Detectors',
        price: 699,
        originalPrice: 999,
        image: '/products/photoelectric-smoke-fire-alarm.jpg',
        shortDescription: 'Compact smoke alarm designed to provide an audible warning when smoke is detected in an indoor environment.',
        description: 'The SafeFire Photoelectric Smoke & Fire Alarm is designed to provide an early audible warning when smoke is detected. Its compact design makes it suitable for bedrooms, offices, corridors and other indoor areas.',
        keyFeatures: [
          'Photoelectric smoke detection',
          'Loud audible alarm',
          'Compact ceiling/wall-mount design',
          'Battery-powered operation',
          'Low-battery warning',
          'Suitable for homes and offices',
        ],
        specifications: {
          'Type': 'Photoelectric Smoke Alarm',
          'Power': 'Battery Powered',
          'Installation': 'Ceiling/Wall',
          'Alarm': 'Audible',
          'Application': 'Residential & Commercial',
        },
        stockQuantity: 100,
        rating: 4.9,
        reviewCount: 220,
        flashSale: true,
        isFeatured: true,
      },
    ];

    let updated = 0;
    for (const item of PRODUCTS_DATA) {
      const categoryId = catMap[item.categorySlug];
      if (!categoryId) {
        console.warn(`⚠️ Warning: Category "${item.categorySlug}" not found for "${item.name}"`);
        continue;
      }

      await Product.findOneAndUpdate(
        { slug: item.slug },
        {
          $set: {
            name: item.name,
            slug: item.slug,
            sku: item.sku,
            price: item.price,
            originalPrice: item.originalPrice,
            image: item.image,
            images: [item.image],
            shortDescription: item.shortDescription,
            description: item.description,
            keyFeatures: item.keyFeatures,
            specifications: item.specifications,
            categoryId: categoryId,
            brandId: brand._id,
            vendorId: vendor._id,
            stock: 'in_stock',
            stockQuantity: item.stockQuantity,
            rating: item.rating,
            reviewCount: item.reviewCount,
            flashSale: item.flashSale,
            isNewArrival: true,
            isFeatured: item.isFeatured,
            isActive: true,
            tags: ['fire safety', 'certified', item.categorySlug, item.sku],
          },
        },
        { upsert: true, new: true }
      );
      console.log(`✨ Upserted product: ${item.name} (${item.sku})`);
      updated++;
    }

    console.log(`✅ Successfully seeded ${updated} custom products with uploaded photos & details!`);
  } catch (err) {
    console.error('❌ Failed to seed custom products:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB Atlas.');
    process.exit(0);
  }
};

seedCustomProducts();
