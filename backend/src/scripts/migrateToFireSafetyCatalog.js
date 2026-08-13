import 'dotenv/config';
import mongoose from 'mongoose';
import Category from '../models/Category.model.js';
import Product from '../models/Product.model.js';
import Brand from '../models/Brand.model.js';
import Vendor from '../models/Vendor.model.js';
import HomeBanner from '../models/HomeBanner.model.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/safe-fire';

const FIRE_CATEGORIES = [
  {
    name: "ABC Fire Extinguishers",
    slug: "abc-fire-extinguishers",
    description: "Multi-purpose dry powder extinguishers for Class A, B, and C fire risks",
    image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=600&q=80",
    order: 1,
  },
  {
    name: "CO₂ Fire Extinguishers",
    slug: "co2-fire-extinguishers",
    description: "Clean agent carbon dioxide extinguishers for electrical and liquid fires",
    image: "https://images.unsplash.com/photo-1599481238640-4c1288750d7a?auto=format&fit=crop&w=600&q=80",
    order: 2,
  },
  {
    name: "Foam Fire Extinguishers",
    slug: "foam-fire-extinguishers",
    description: "Aqueous film forming foam extinguishers ideal for flammable liquid fires",
    image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=600&q=80",
    order: 3,
  },
  {
    name: "Water-Based Extinguishers",
    slug: "water-based-extinguishers",
    description: "Effective eco-friendly water extinguishers for solid combustible materials",
    image: "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=600&q=80",
    order: 4,
  },
  {
    name: "Fire Blankets & Equipment",
    slug: "fire-blankets-equipment",
    description: "Emergency fiberglass fire blankets, hose reels, and suppression accessories",
    image: "https://images.unsplash.com/photo-1544027993-37dbfe43562a?auto=format&fit=crop&w=600&q=80",
    order: 5,
  },
  {
    name: "Fire Hoses & Hose Reels",
    slug: "fire-hoses-hose-reels",
    description: "Commercial high-pressure hose reels and fire hydrant landing valves",
    image: "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=600&q=80",
    order: 6,
  },
  {
    name: "Smoke & Fire Alarms",
    slug: "smoke-fire-alarms",
    description: "Photoelectric smoke detectors, warning sirens, and heat sensors",
    image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=600&q=80",
    order: 7,
  },
  {
    name: "Safety Helmets & PPE",
    slug: "safety-helmets-ppe",
    description: "Industrial safety helmets, heat-resistant gloves, and protective gear",
    image: "https://images.unsplash.com/photo-1544027993-37dbfe43562a?auto=format&fit=crop&w=600&q=80",
    order: 8,
  },
  {
    name: "Emergency Exit Signs",
    slug: "emergency-exit-signs",
    description: "Photoluminescent & LED illuminated emergency exit indicators and signage",
    image: "https://images.unsplash.com/photo-1599481238640-4c1288750d7a?auto=format&fit=crop&w=600&q=80",
    order: 9,
  },
  {
    name: "Fire Safety Accessories",
    slug: "fire-safety-accessories",
    description: "Wall mounting brackets, pressure gauges, safety pins & inspection tags",
    image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=600&q=80",
    order: 10,
  },
];

const migrate = async () => {
  try {
    console.log(`📡 Connecting to MongoDB at ${MONGO_URI}...`);
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB.');

    // 1. Remove all legacy categories from DB
    await Category.deleteMany({});
    console.log('🧹 Purged all legacy category records from database.');

    // 2. Upsert Fire Safety Categories
    const categoryDocs = [];
    for (const catData of FIRE_CATEGORIES) {
      const doc = await Category.findOneAndUpdate(
        { slug: catData.slug },
        { $set: { ...catData, isActive: true } },
        { upsert: true, new: true }
      );
      categoryDocs.push(doc);
    }
    console.log(`✅ Upserted ${categoryDocs.length} Fire Safety categories.`);

    // 3. Upsert Demo Vendor & Brand
    const vendorDoc = await Vendor.findOneAndUpdate(
      { email: 'supplier@firesafety.demo' },
      {
        $set: {
          name: 'Demo Safety Supplier',
          storeName: 'Demo Safety Equipment',
          storeDescription: 'Authorized supplier of certified fire protection and safety equipment.',
          status: 'approved',
          rating: 4.8,
          reviewCount: 120,
        }
      },
      { upsert: true, new: true }
    );

    const brandDoc = await Brand.findOneAndUpdate(
      { name: 'Demo Safety Equipment' },
      {
        $set: {
          name: 'Demo Safety Equipment',
          slug: 'demo-safety-equipment',
          visibility: 'global',
          isActive: true
        }
      },
      { upsert: true, new: true }
    );

    // 4. Remove legacy products (shoes, sunglasses, tshirts, etc.)
    await Product.deleteMany({
      $or: [
        { name: { $regex: /sunglass|sneaker|watch|t-shirt|jean|dress|skirt|shoe|fashion/i } },
        { tags: { $in: ['sunglasses', 'sneakers', 'fashion', 'clothing'] } }
      ]
    });
    console.log('🧹 Purged legacy product records.');

    // 5. Upsert Core Fire Safety Products
    const fireProducts = [
      {
        name: "ABC Dry Powder Fire Extinguisher 6kg",
        slug: "abc-dry-powder-fire-extinguisher-6kg",
        price: 1699,
        originalPrice: 2199,
        image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=800&q=80",
        images: ["https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=800&q=80"],
        description: "High-grade ABC dry powder fire extinguisher designed for multi-purpose protection against wood, paper, flammable liquid, and electrical fire hazards.",
        categoryId: categoryDocs[0]._id,
        brandId: brandDoc._id,
        vendorId: vendorDoc._id,
        stock: "in_stock",
        stockQuantity: 50,
        rating: 4.8,
        reviewCount: 142,
        flashSale: true,
        isNewArrival: true,
        isActive: true,
        tags: ["fire extinguisher", "ABC powder", "safety equipment"]
      },
      {
        name: "CO₂ Carbon Dioxide Fire Extinguisher 4.5kg",
        slug: "co2-fire-extinguisher-4-5kg",
        price: 3499,
        originalPrice: 3999,
        image: "https://images.unsplash.com/photo-1599481238640-4c1288750d7a?auto=format&fit=crop&w=800&q=80",
        images: ["https://images.unsplash.com/photo-1599481238640-4c1288750d7a?auto=format&fit=crop&w=800&q=80"],
        description: "Residue-free CO₂ carbon dioxide extinguisher engineered for electrical panels, server rooms, and liquid fire risks.",
        categoryId: categoryDocs[1]._id,
        brandId: brandDoc._id,
        vendorId: vendorDoc._id,
        stock: "in_stock",
        stockQuantity: 30,
        rating: 4.9,
        reviewCount: 88,
        flashSale: false,
        isNewArrival: true,
        isActive: true,
        tags: ["CO2", "extinguisher", "electrical safety"]
      },
      {
        name: "AFFF Foam Fire Extinguisher 9 Litre",
        slug: "afff-foam-fire-extinguisher-9l",
        price: 2299,
        originalPrice: 2799,
        image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=800&q=80",
        images: ["https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=800&q=80"],
        description: "Aqueous Film Forming Foam (AFFF) extinguisher designed to blanketing fuel surfaces and preventing reignition.",
        categoryId: categoryDocs[2]._id,
        brandId: brandDoc._id,
        vendorId: vendorDoc._id,
        stock: "in_stock",
        stockQuantity: 25,
        rating: 4.7,
        reviewCount: 54,
        flashSale: false,
        isNewArrival: false,
        isActive: true,
        tags: ["foam", "extinguisher", "liquid fire"]
      },
      {
        name: "Commercial Fire Blanket 1.8m x 1.8m",
        slug: "commercial-fire-blanket-1-8m",
        price: 899,
        originalPrice: 1199,
        image: "https://images.unsplash.com/photo-1544027993-37dbfe43562a?auto=format&fit=crop&w=800&q=80",
        images: ["https://images.unsplash.com/photo-1544027993-37dbfe43562a?auto=format&fit=crop&w=800&q=80"],
        description: "Heavy-duty woven fiberglass flame-retardant fire blanket in a quick-release wall pouch for kitchen and laboratory safety.",
        categoryId: categoryDocs[4]._id,
        brandId: brandDoc._id,
        vendorId: vendorDoc._id,
        stock: "in_stock",
        stockQuantity: 100,
        rating: 4.9,
        reviewCount: 210,
        flashSale: true,
        isNewArrival: false,
        isActive: true,
        tags: ["fire blanket", "kitchen safety"]
      },
      {
        name: "Photoelectric Smoke Alarm Sensor",
        slug: "photoelectric-smoke-alarm-sensor",
        price: 799,
        originalPrice: 999,
        image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=800&q=80",
        images: ["https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=800&q=80"],
        description: "Battery-operated photoelectric smoke detector featuring 85dB alarm horn, test button, and low-battery warning chirp.",
        categoryId: categoryDocs[6]._id,
        brandId: brandDoc._id,
        vendorId: vendorDoc._id,
        stock: "in_stock",
        stockQuantity: 80,
        rating: 4.8,
        reviewCount: 95,
        flashSale: false,
        isNewArrival: true,
        isActive: true,
        tags: ["smoke detector", "alarm", "sensor"]
      }
    ];

    for (const prodData of fireProducts) {
      await Product.findOneAndUpdate(
        { slug: prodData.slug },
        { $set: prodData },
        { upsert: true }
      );
    }
    console.log(`✅ Upserted ${fireProducts.length} Fire Safety products.`);

    console.log('🎉 Migration to Fire Safety Catalog completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB.');
    process.exit(0);
  }
};

migrate();
