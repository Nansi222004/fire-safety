import 'dotenv/config';
import mongoose from 'mongoose';
import Category from '../models/Category.model.js';
import Product from '../models/Product.model.js';
import Brand from '../models/Brand.model.js';
import Vendor from '../models/Vendor.model.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/safe-fire';

const seedProducts = async () => {
  try {
    console.log(`📡 Connecting to MongoDB Atlas at ${MONGO_URI}...`);
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB.');

    // 1. Get or create default brand and vendor
    const brand = await Brand.findOneAndUpdate(
      { name: 'FireShield Pro' },
      {
        $set: {
          name: 'FireShield Pro',
          slug: 'fireshield-pro',
          visibility: 'global',
          isActive: true,
        },
      },
      { upsert: true, new: true }
    );

    const vendor = await Vendor.findOne({ email: 'vendor@safefire.demo' }) ||
      await Vendor.findOne({});

    if (!vendor) {
      throw new Error('No vendor found to link products to.');
    }

    // 2. Fetch all categories
    const allCategories = await Category.find({}).lean();
    console.log(`📦 Loaded ${allCategories.length} categories.`);

    const catMap = {};
    allCategories.forEach(c => {
      catMap[c.slug] = c._id;
    });

    const PRODUCTS_DATA = [
      // 1. ABC Fire Extinguishers
      {
        name: "ABC Dry Powder Fire Extinguisher 2KG",
        slug: "abc-dry-powder-fire-extinguisher-2kg",
        price: 999,
        originalPrice: 1299,
        image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=800&q=80",
        description: "Compact 2KG ABC dry powder extinguisher for car, kitchen, and home protection.",
        categorySlug: "abc-fire-extinguishers",
        stockQuantity: 40,
        rating: 4.8,
        reviewCount: 95,
        flashSale: true,
      },
      {
        name: "ABC Dry Powder Fire Extinguisher 4KG",
        slug: "abc-dry-powder-fire-extinguisher-4kg",
        price: 1399,
        originalPrice: 1799,
        image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=800&q=80",
        description: "Standard 4KG ABC dry powder extinguisher suitable for offices and commercial spaces.",
        categorySlug: "abc-fire-extinguishers",
        stockQuantity: 50,
        rating: 4.9,
        reviewCount: 120,
      },
      {
        name: "ABC Dry Powder Fire Extinguisher 6KG",
        slug: "abc-dry-powder-fire-extinguisher-6kg",
        price: 1699,
        originalPrice: 2199,
        image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=800&q=80",
        description: "High-grade 6KG ABC dry chemical powder extinguisher with pressure gauge and bracket.",
        categorySlug: "abc-fire-extinguishers",
        stockQuantity: 60,
        rating: 4.9,
        reviewCount: 180,
        flashSale: true,
      },
      {
        name: "ABC Heavy-Duty Fire Extinguisher 9KG",
        slug: "abc-heavy-duty-fire-extinguisher-9kg",
        price: 2499,
        originalPrice: 2999,
        image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=800&q=80",
        description: "Heavy-duty 9KG ABC dry chemical extinguisher for industrial warehouses and factories.",
        categorySlug: "abc-fire-extinguishers",
        stockQuantity: 30,
        rating: 4.8,
        reviewCount: 75,
      },

      // 2. CO2 Fire Extinguishers
      {
        name: "CO₂ Fire Extinguisher 2KG",
        slug: "co2-fire-extinguisher-2kg",
        price: 2299,
        originalPrice: 2699,
        image: "https://images.unsplash.com/photo-1599481238640-4c1288750d7a?auto=format&fit=crop&w=800&q=80",
        description: "Clean agent 2KG carbon dioxide extinguisher for server racks and computer equipment.",
        categorySlug: "co2-fire-extinguishers",
        stockQuantity: 35,
        rating: 4.8,
        reviewCount: 64,
      },
      {
        name: "CO₂ Fire Extinguisher 4.5KG",
        slug: "co2-fire-extinguisher-4-5kg",
        price: 3499,
        originalPrice: 3999,
        image: "https://images.unsplash.com/photo-1599481238640-4c1288750d7a?auto=format&fit=crop&w=800&q=80",
        description: "Residue-free 4.5KG CO₂ carbon dioxide extinguisher with frost-free discharge horn.",
        categorySlug: "co2-fire-extinguishers",
        stockQuantity: 45,
        rating: 4.9,
        reviewCount: 110,
        flashSale: true,
      },

      // 3. Foam Fire Extinguishers
      {
        name: "AFFF Foam Fire Extinguisher 6 Litre",
        slug: "afff-foam-fire-extinguisher-6l",
        price: 1899,
        originalPrice: 2399,
        image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=800&q=80",
        description: "6L AFFF foam extinguisher for Class A and flammable liquid Class B fire risks.",
        categorySlug: "foam-fire-extinguishers",
        stockQuantity: 25,
        rating: 4.7,
        reviewCount: 48,
      },
      {
        name: "AFFF Mechanical Foam Fire Extinguisher 9 Litre",
        slug: "afff-mechanical-foam-fire-extinguisher-9l",
        price: 2299,
        originalPrice: 2799,
        image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=800&q=80",
        description: "9L mechanical foam fire suppression cylinder designed to smother liquid fuel fires.",
        categorySlug: "foam-fire-extinguishers",
        stockQuantity: 30,
        rating: 4.8,
        reviewCount: 82,
      },

      // 4. Water-Based Extinguishers
      {
        name: "Water Stored Pressure Fire Extinguisher 6 Litre",
        slug: "water-stored-pressure-extinguisher-6l",
        price: 1499,
        originalPrice: 1899,
        image: "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=800&q=80",
        description: "6L pressurized water extinguisher for paper, wood, textile and solid combustibles.",
        categorySlug: "water-based-extinguishers",
        stockQuantity: 30,
        rating: 4.6,
        reviewCount: 36,
      },
      {
        name: "Wet Chemical Kitchen Fire Extinguisher 6 Litre",
        slug: "wet-chemical-kitchen-extinguisher-6l",
        price: 2899,
        originalPrice: 3499,
        image: "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=800&q=80",
        description: "Class K wet chemical extinguisher formulated for commercial kitchen oil and deep fryer fires.",
        categorySlug: "water-based-extinguishers",
        stockQuantity: 20,
        rating: 4.9,
        reviewCount: 52,
      },

      // 5. Fire Blankets & Emergency Equipment
      {
        name: "Emergency Fire Blanket 1.2m x 1.8m",
        slug: "emergency-fire-blanket-1-2m-1-8m",
        price: 699,
        originalPrice: 899,
        image: "https://images.unsplash.com/photo-1544027993-37dbfe43562a?auto=format&fit=crop&w=800&q=80",
        description: "Quick-release woven fiberglass flame-retardant fire blanket for domestic kitchens and workplaces.",
        categorySlug: "fire-blankets-equipment",
        stockQuantity: 80,
        rating: 4.9,
        reviewCount: 150,
        flashSale: true,
      },
      {
        name: "Heavy-Duty Steel Fire Bucket with Bracket",
        slug: "heavy-duty-steel-fire-bucket",
        price: 499,
        originalPrice: 649,
        image: "https://images.unsplash.com/photo-1544027993-37dbfe43562a?auto=format&fit=crop&w=800&q=80",
        description: "Round-bottom red epoxy coated mild steel fire bucket with wall hanging hook.",
        categorySlug: "fire-blankets-equipment",
        stockQuantity: 50,
        rating: 4.7,
        reviewCount: 40,
      },

      // 6. Fire Hoses & Hose Reels
      {
        name: "Fire Hose Pipe 30 Metre Canvas Reinforced",
        slug: "fire-hose-pipe-30m-canvas",
        price: 3199,
        originalPrice: 3899,
        image: "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=800&q=80",
        description: "30m high-pressure canvas fire hose pipe with instantaneous brass couplings.",
        categorySlug: "fire-hoses-hose-reels",
        stockQuantity: 25,
        rating: 4.8,
        reviewCount: 45,
      },
      {
        name: "Swinging Wall Mount Fire Hose Reel Drum 30m",
        slug: "fire-hose-reel-drum-30m",
        price: 4599,
        originalPrice: 5499,
        image: "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=800&q=80",
        description: "Wall mounted manual swinging fire hose reel with 30m non-kinking PVC hose and jet/spray nozzle.",
        categorySlug: "fire-hoses-hose-reels",
        stockQuantity: 15,
        rating: 4.9,
        reviewCount: 68,
      },

      // 7. Smoke & Fire Alarms
      {
        name: "Photoelectric Optical Smoke Alarm Detector",
        slug: "photoelectric-optical-smoke-alarm-detector",
        price: 799,
        originalPrice: 1099,
        image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=800&q=80",
        description: "High-sensitivity 85dB photoelectric smoke alarm with 10-year sensor and test button.",
        categorySlug: "smoke-fire-alarms",
        stockQuantity: 90,
        rating: 4.9,
        reviewCount: 220,
        flashSale: true,
      },
      {
        name: "Emergency Break Glass Manual Call Point",
        slug: "emergency-break-glass-manual-call-point",
        price: 599,
        originalPrice: 799,
        image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=800&q=80",
        description: "Red surface-mounted manual fire alarm call point with reset key and LED indicator.",
        categorySlug: "smoke-fire-alarms",
        stockQuantity: 60,
        rating: 4.8,
        reviewCount: 92,
      },

      // 8. Safety Helmets & PPE
      {
        name: "Industrial Safety Helmet with Ratchet Suspension",
        slug: "industrial-safety-helmet-ratchet",
        price: 449,
        originalPrice: 599,
        image: "https://images.unsplash.com/photo-1544027993-37dbfe43562a?auto=format&fit=crop&w=800&q=80",
        description: "IS certified high-density polyethylene industrial hard hat with 6-point textile harness.",
        categorySlug: "safety-helmets-ppe",
        stockQuantity: 120,
        rating: 4.7,
        reviewCount: 140,
      },
      {
        name: "Heat Resistant Heavy-Duty Fire Safety Gloves",
        slug: "heat-resistant-fire-safety-gloves",
        price: 699,
        originalPrice: 899,
        image: "https://images.unsplash.com/photo-1544027993-37dbfe43562a?auto=format&fit=crop&w=800&q=80",
        description: "Aluminized split cowhide thermal protection gloves tested up to 500°C contact heat.",
        categorySlug: "safety-helmets-ppe",
        stockQuantity: 70,
        rating: 4.8,
        reviewCount: 85,
      },

      // 9. Emergency Exit & Safety Signs
      {
        name: "LED Illuminated Emergency Exit Sign Board",
        slug: "led-illuminated-emergency-exit-sign-board",
        price: 1199,
        originalPrice: 1599,
        image: "https://images.unsplash.com/photo-1599481238640-4c1288750d7a?auto=format&fit=crop&w=800&q=80",
        description: "Green LED emergency running man exit light with 3-hour internal rechargeable battery backup.",
        categorySlug: "emergency-exit-signs",
        stockQuantity: 50,
        rating: 4.9,
        reviewCount: 78,
      },
      {
        name: "Photoluminescent Glow Fire Extinguisher Sign Board",
        slug: "photoluminescent-glow-extinguisher-sign",
        price: 299,
        originalPrice: 399,
        image: "https://images.unsplash.com/photo-1599481238640-4c1288750d7a?auto=format&fit=crop&w=800&q=80",
        description: "Rigid photoluminescent glow-in-the-dark fire extinguisher identification safety sign board.",
        categorySlug: "emergency-exit-signs",
        stockQuantity: 100,
        rating: 4.8,
        reviewCount: 115,
      },

      // 10. Fire Safety Accessories
      {
        name: "Universal Heavy-Duty Wall Mounting Bracket",
        slug: "universal-heavy-duty-wall-bracket",
        price: 199,
        originalPrice: 299,
        image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=800&q=80",
        description: "Heavy gauge steel wall bracket for 2kg to 9kg fire extinguishers with quick release pin.",
        categorySlug: "fire-safety-accessories",
        stockQuantity: 150,
        rating: 4.7,
        reviewCount: 90,
      },
      {
        name: "Weatherproof PVC Protective Extinguisher Cover",
        slug: "weatherproof-pvc-protective-extinguisher-cover",
        price: 349,
        originalPrice: 499,
        image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=800&q=80",
        description: "Heavy-duty UV resistant PVC cover protecting outdoor fire extinguishers from rain and dust.",
        categorySlug: "fire-safety-accessories",
        stockQuantity: 80,
        rating: 4.8,
        reviewCount: 60,
      },
    ];

    let count = 0;
    for (const item of PRODUCTS_DATA) {
      const categoryId = catMap[item.categorySlug];
      if (!categoryId) {
        console.warn(`⚠️ Skipping ${item.name}: Category slug "${item.categorySlug}" not found.`);
        continue;
      }

      await Product.findOneAndUpdate(
        { slug: item.slug },
        {
          $set: {
            name: item.name,
            slug: item.slug,
            price: item.price,
            originalPrice: item.originalPrice,
            image: item.image,
            images: [item.image],
            description: item.description,
            categoryId: categoryId,
            brandId: brand._id,
            vendorId: vendor._id,
            stock: "in_stock",
            stockQuantity: item.stockQuantity,
            rating: item.rating,
            reviewCount: item.reviewCount,
            flashSale: !!item.flashSale,
            isNewArrival: true,
            isActive: true,
            tags: ["fire safety", "protection", item.categorySlug],
          },
        },
        { upsert: true, new: true }
      );
      count++;
    }

    console.log(`✅ Seeded ${count} Fire Safety products across all categories!`);
    console.log('🎉 Product seeding complete!');
  } catch (err) {
    console.error('❌ Failed to seed products:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB.');
    process.exit(0);
  }
};

seedProducts();
