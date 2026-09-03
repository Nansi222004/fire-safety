import 'dotenv/config';
import mongoose from 'mongoose';
import PlatformPolicy from '../models/PlatformPolicy.model.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/safe-fire';

const DEFAULT_POLICIES = {
  privacy: {
    title: 'SafeFire Privacy Policy',
    lastUpdated: new Date(),
    content: `
      <h2>1. Information We Collect</h2>
      <p>SafeFire collects customer contact and delivery address details solely to process fire safety equipment orders, dispatch certified technicians for extinguisher refills and safety audits, and issue regulatory compliance certificates.</p>
      <h2>2. Fire Protection Service Records</h2>
      <p>Your maintenance logs, extinguisher serial numbers, test dates, and Annual Maintenance Contract (AMC) records are encrypted and securely stored to help you maintain continuous compliance and receive timely inspection reminders.</p>
      <h2>3. Data Protection & Security</h2>
      <p>We implement industry-standard 256-bit encryption for all customer accounts, service transactions, and compliance records. Your information is never sold or shared with unauthorized third parties.</p>
      <h2>4. Contact Us</h2>
      <p>For any privacy inquiries or records management requests, please contact our support desk at support@safefire.demo.</p>
    `,
  },
  terms: {
    title: 'SafeFire Safety Terms & Warranty Conditions',
    lastUpdated: new Date(),
    content: `
      <h2>1. Equipment Certification & Warranty</h2>
      <p>All fire extinguishers, smoke alarms, fire hose reels, and emergency safety gear supplied by SafeFire are certified and covered under standard manufacturer warranty against manufacturing defects.</p>
      <h2>2. Certified On-Site Services</h2>
      <p>All refill, hydro-testing, and maintenance services are carried out by certified fire safety technicians following strict safety codes and manufacturer guidelines.</p>
      <h2>3. Safe Operation & Handling</h2>
      <p>Users must adhere to standard safety procedures (such as the P.A.S.S. technique) and ensure pressure gauges are routinely checked. Tampering with safety pins or pressure valves voids equipment warranty.</p>
      <h2>4. Delivery & Installation</h2>
      <p>Certified equipment is delivered in shock-absorbing protective packaging within 24 to 48 business hours.</p>
    `,
  },
  refund: {
    title: 'SafeFire Replacement & Service Cancellation Policy',
    lastUpdated: new Date(),
    content: `
      <h2>1. 7-Day Replacement Guarantee</h2>
      <p>If any equipment arrives damaged, with broken safety seals, or pressure gauge discrepancies, we provide an immediate free replacement within 7 days of delivery.</p>
      <h2>2. On-Site Service Cancellation</h2>
      <p>Scheduled maintenance and refill service visits can be rescheduled or cancelled up to 2 hours prior to the technician's appointment time.</p>
    `,
  },
  sellerTerms: {
    title: 'SafeFire Supplier & Vendor Terms',
    lastUpdated: new Date(),
    content: `
      <h2>1. Quality Standards & Certifications</h2>
      <p>Vendors on SafeFire must supply only tested, genuine fire safety equipment adhering to statutory fire standards.</p>
    `,
  },
  faq: {
    title: 'Fire Safety Help & Support Desk',
    lastUpdated: new Date(),
    items: [
      {
        question: 'How often should fire extinguishers be inspected?',
        answer: 'Fire extinguishers should receive monthly visual gauge checks and an annual professional inspection by certified technicians.',
      },
      {
        question: 'How do I book an on-site extinguisher refill?',
        answer: 'You can book directly from the Services tab on our app or web platform. A certified technician will visit your location.',
      },
      {
        question: 'Are all products certified?',
        answer: 'Yes, every fire extinguisher, smoke alarm, and hose reel sold on SafeFire is brand new, certified, and under warranty.',
      },
    ],
  },
};

const seedPolicies = async () => {
  try {
    console.log(`📡 Connecting to MongoDB Atlas...`);
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB.');

    await PlatformPolicy.findOneAndUpdate(
      {},
      { $set: DEFAULT_POLICIES },
      { upsert: true, new: true }
    );
    console.log('🎉 Successfully seeded PlatformPolicy document into database!');
  } catch (err) {
    console.error('❌ Failed to seed policies:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB.');
    process.exit(0);
  }
};

seedPolicies();
