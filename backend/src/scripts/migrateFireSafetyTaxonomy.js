import 'dotenv/config';
import mongoose from 'mongoose';
import Category from '../models/Category.model.js';
import Product from '../models/Product.model.js';
import Brand from '../models/Brand.model.js';
import Vendor from '../models/Vendor.model.js';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/safe-fire';

const TAXONOMY_TREE = [
  {
    name: "ABC Fire Extinguishers",
    slug: "abc-fire-extinguishers",
    description: "Multi-purpose dry powder extinguishers for Class A, B, and C fire risks",
    image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=600&q=80",
    order: 1,
    subcategories: [
      { name: "ABC Dry Powder Extinguishers", slug: "abc-dry-powder-extinguishers", description: "Standard ABC dry chemical extinguishers for general use" },
      { name: "Stored Pressure Extinguishers", slug: "stored-pressure-extinguishers", description: "Constant pressure ABC fire extinguishers" },
      { name: "Portable Extinguishers", slug: "portable-abc-extinguishers", description: "Compact ABC extinguishers for home & vehicle safety" },
      { name: "Heavy-Duty Extinguishers", slug: "heavy-duty-abc-extinguishers", description: "High-capacity ABC extinguishers for industrial facilities" }
    ]
  },
  {
    name: "CO₂ Fire Extinguishers",
    slug: "co2-fire-extinguishers",
    description: "Clean agent carbon dioxide extinguishers for electrical and liquid fires",
    image: "https://images.unsplash.com/photo-1599481238640-4c1288750d7a?auto=format&fit=crop&w=600&q=80",
    order: 2,
    subcategories: [
      { name: "Portable CO₂ Extinguishers", slug: "portable-co2-extinguishers", description: "Handheld CO2 extinguishers with discharge horn" },
      { name: "Electrical Fire Extinguishers", slug: "electrical-fire-extinguishers", description: "Non-conductive clean gas extinguishers for server rooms" },
      { name: "Heavy-Duty CO₂ Extinguishers", slug: "heavy-duty-co2-extinguishers", description: "Trolley-mounted large CO2 cylinders for commercial plants" }
    ]
  },
  {
    name: "Foam Fire Extinguishers",
    slug: "foam-fire-extinguishers",
    description: "Aqueous film forming foam extinguishers ideal for flammable liquid fires",
    image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=600&q=80",
    order: 3,
    subcategories: [
      { name: "AFFF Foam Extinguishers", slug: "afff-foam-extinguishers", description: "Aqueous Film Forming Foam suppression units" },
      { name: "Mechanical Foam Extinguishers", slug: "mechanical-foam-extinguishers", description: "High expansion mechanical foam units" },
      { name: "Portable Foam Extinguishers", slug: "portable-foam-extinguishers", description: "Handheld foam fire suppression cylinders" }
    ]
  },
  {
    name: "Water-Based Extinguishers",
    slug: "water-based-extinguishers",
    description: "Effective eco-friendly water extinguishers for solid combustible materials",
    image: "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=600&q=80",
    order: 4,
    subcategories: [
      { name: "Water Stored Pressure", slug: "water-stored-pressure", description: "Pressurized water extinguishers for Class A fires" },
      { name: "Water Mist Extinguishers", slug: "water-mist-extinguishers", description: "Ultra-fine water mist suppression technology" },
      { name: "Wet Chemical Extinguishers", slug: "wet-chemical-extinguishers", description: "Specialized Class K extinguishers for commercial kitchen fires" }
    ]
  },
  {
    name: "Fire Blankets & Emergency Equipment",
    slug: "fire-blankets-equipment",
    description: "Emergency fiberglass fire blankets, buckets, and safety kits",
    image: "https://images.unsplash.com/photo-1544027993-37dbfe43562a?auto=format&fit=crop&w=600&q=80",
    order: 5,
    subcategories: [
      { name: "Fire Blankets", slug: "fire-blankets", description: "Flame retardant woven fiberglass blankets" },
      { name: "Fire Buckets", slug: "fire-buckets", description: "Heavy duty steel fire buckets with mounting hooks" },
      { name: "Fire Sand Buckets", slug: "fire-sand-buckets", description: "Sand storage buckets for chemical & liquid spill control" },
      { name: "Emergency Safety Kits", slug: "emergency-safety-kits", description: "Comprehensive emergency response kits" }
    ]
  },
  {
    name: "Fire Hoses & Hose Reels",
    slug: "fire-hoses-hose-reels",
    description: "Commercial high-pressure hose reels, nozzles, and couplings",
    image: "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=600&q=80",
    order: 6,
    subcategories: [
      { name: "Fire Hose Pipes", slug: "fire-hose-pipes", description: "Reinforced canvas and rubber lining fire hoses" },
      { name: "Hose Reels", slug: "hose-reels", description: "Wall-mounted swinging & fixed hose reels" },
      { name: "Fire Nozzles", slug: "fire-nozzles", description: "Branch pipes, fog nozzles, and shutoff nozzles" },
      { name: "Hose Couplings", slug: "hose-couplings", description: "Instantaneous & threaded hose connectors" },
      { name: "Hose Reel Drums", slug: "hose-reel-drums", description: "Heavy gauge steel drum assemblies" }
    ]
  },
  {
    name: "Smoke & Fire Alarms",
    slug: "smoke-fire-alarms",
    description: "Photoelectric smoke detectors, warning sirens, and heat sensors",
    image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=600&q=80",
    order: 7,
    subcategories: [
      { name: "Smoke Detectors", slug: "smoke-detectors", description: "Photoelectric & optical smoke alarms" },
      { name: "Heat Detectors", slug: "heat-detectors", description: "Rate-of-rise & fixed temperature heat sensors" },
      { name: "Fire Alarm Panels", slug: "fire-alarm-panels", description: "Conventional & addressable fire alarm control panels" },
      { name: "Manual Call Points", slug: "manual-call-points", description: "Break glass emergency call points" },
      { name: "Alarm Sirens", slug: "alarm-sirens", description: "High-decibel sirens & strobe lights" }
    ]
  },
  {
    name: "Safety Helmets & PPE",
    slug: "safety-helmets-ppe",
    description: "Industrial safety helmets, heat-resistant gloves, and protective gear",
    image: "https://images.unsplash.com/photo-1544027993-37dbfe43562a?auto=format&fit=crop&w=600&q=80",
    order: 8,
    subcategories: [
      { name: "Safety Helmets", slug: "safety-helmets", description: "HDPE hard hats & ratchet helmets" },
      { name: "Firefighter Helmets", slug: "firefighter-helmets", description: "Heat-resistant firefighter helmets with gold visor" },
      { name: "Fire Safety Gloves", slug: "fire-safety-gloves", description: "Aluminized & leather heat-resistant gloves" },
      { name: "Safety Shoes", slug: "safety-shoes", description: "Steel-toe anti-skid industrial safety footwear" },
      { name: "Fire-Resistant Clothing", slug: "fire-resistant-clothing", description: "Flame-retardant suits, jacket, and coveralls" },
      { name: "Face Shields", slug: "face-shields", description: "Transparent visor shields for high temperature protection" }
    ]
  },
  {
    name: "Emergency Exit & Safety Signs",
    slug: "emergency-exit-signs",
    description: "Photoluminescent & LED illuminated emergency exit indicators and signage",
    image: "https://images.unsplash.com/photo-1599481238640-4c1288750d7a?auto=format&fit=crop&w=600&q=80",
    order: 9,
    subcategories: [
      { name: "Emergency Exit Signs", slug: "emergency-exit-signs-sub", description: "Illuminated emergency escape route indicators" },
      { name: "Fire Exit Signs", slug: "fire-exit-signs", description: "Photoluminescent glow-in-the-dark fire exit signs" },
      { name: "Fire Extinguisher Signs", slug: "fire-extinguisher-signs", description: "Extinguisher location & operating instruction boards" },
      { name: "Warning Signs", slug: "warning-signs", description: "Hazardous area & high voltage safety signs" },
      { name: "Directional Signs", slug: "directional-signs", description: "Arrow safety escape indicators" },
      { name: "Photoluminescent Signs", slug: "photoluminescent-signs", description: "Self-luminous glow safety boards" }
    ]
  },
  {
    name: "Fire Safety Accessories",
    slug: "fire-safety-accessories",
    description: "Wall mounting brackets, pressure gauges, safety pins & inspection tags",
    image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=600&q=80",
    order: 10,
    subcategories: [
      { name: "Extinguisher Stands", slug: "extinguisher-stands", description: "Single and double floor extinguisher stands" },
      { name: "Extinguisher Covers", slug: "extinguisher-covers", description: "Weatherproof PVC protective covers" },
      { name: "Wall Brackets", slug: "wall-brackets", description: "Heavy-duty wall mounting brackets and hooks" },
      { name: "Alarm Batteries", slug: "alarm-batteries", description: "9V lithium backup batteries for smoke detectors" },
      { name: "Safety Signage", slug: "safety-signage-acc", description: "Custom acrylic & metal safety plaques" },
      { name: "Mounting Accessories", slug: "mounting-accessories", description: "Screws, anchors, and hanging hardware" }
    ]
  }
];

const migrate = async () => {
  try {
    console.log(`📡 Connecting to MongoDB Atlas at ${MONGO_URI}...`);
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB.');

    // 1. Wipe all old category documents
    await Category.deleteMany({});
    console.log('🧹 Purged all legacy category documents.');

    // 2. Upsert 10 Main Categories & Subcategories
    let totalMain = 0;
    let totalSub = 0;

    for (const mainData of TAXONOMY_TREE) {
      const parentCategory = await Category.create({
        name: mainData.name,
        slug: mainData.slug,
        description: mainData.description,
        image: mainData.image,
        order: mainData.order,
        parentId: null,
        isActive: true,
      });
      totalMain++;

      if (mainData.subcategories && mainData.subcategories.length > 0) {
        let subOrder = 1;
        for (const subData of mainData.subcategories) {
          await Category.create({
            name: subData.name,
            slug: subData.slug,
            description: subData.description,
            image: mainData.image,
            order: subOrder++,
            parentId: parentCategory._id,
            isActive: true,
          });
          totalSub++;
        }
      }
    }

    console.log(`✅ Seeded ${totalMain} Main Categories and ${totalSub} Subcategories into MongoDB!`);
    console.log('🎉 Fire Safety Category Taxonomy migration complete!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB.');
    process.exit(0);
  }
};

migrate();
