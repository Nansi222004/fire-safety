import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

import User from '../models/User.model.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/safe-fire';

async function seedTestUser() {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to DB');

    const email = 'customer@safefire.com';
    let user = await User.findOne({ email });

    if (user) {
        user.password = 'Password123!';
        user.isVerified = true;
        user.isActive = true;
        user.role = 'customer';
        await user.save();
        console.log('Reset customer@safefire.com password to Password123!');
    } else {
        user = await User.create({
            name: 'SafeFire Customer',
            email,
            password: 'Password123!',
            role: 'customer',
            isVerified: true,
            isActive: true,
            fcmTokens: [],
            fcmTokenMobile: [],
        });
        console.log('Created customer@safefire.com with Password123!');
    }

    // Verify comparison immediately
    const checkUser = await User.findOne({ email }).select('+password');
    const isMatch = await checkUser.comparePassword('Password123!');
    console.log('Password verification check:', isMatch ? '✅ MATCHES' : '❌ FAILED');

    await mongoose.disconnect();
}

seedTestUser().catch(console.error);
