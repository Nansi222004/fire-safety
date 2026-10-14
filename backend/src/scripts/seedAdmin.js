import 'dotenv/config';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Admin from '../models/Admin.model.js';

// Creates (or resets) the super admin account.
// Credentials come from the environment — never from source code:
//   SEED_ADMIN_EMAIL     (required)
//   SEED_ADMIN_PASSWORD  (optional; at least 12 characters. If omitted, a strong random password is generated
//                         and printed once.)
const MONGO_URI = process.env.MONGO_URI;
const email = String(process.env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
let password = String(process.env.SEED_ADMIN_PASSWORD || '');

if (!MONGO_URI) {
    console.error('❌ MONGO_URI not set in .env');
    process.exit(1);
}
if (!email) {
    console.error('❌ Set SEED_ADMIN_EMAIL (and optionally SEED_ADMIN_PASSWORD) before running this script.');
    process.exit(1);
}
const generated = !password;
if (generated) {
    password = crypto.randomBytes(18).toString('base64url');
} else if (password.length < 12) {
    console.error('❌ SEED_ADMIN_PASSWORD must be at least 12 characters.');
    process.exit(1);
}

const seedAdmin = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        const existing = await Admin.findOne({ email });
        if (existing) {
            existing.password = password;
            existing.name = existing.name || 'Super Admin';
            existing.role = 'superadmin';
            existing.isActive = true;
            await existing.save();
            console.log(`✅ Super admin password reset: ${email}`);
        } else {
            await Admin.create({ name: 'Super Admin', email, password, role: 'superadmin', isActive: true });
            console.log(`✅ Super admin created: ${email}`);
        }
        if (generated) {
            console.log(`🔑 Generated password (shown once, store it securely): ${password}`);
        }
    } catch (err) {
        console.error('❌ Seed failed:', err.message);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
    }
};

seedAdmin();
