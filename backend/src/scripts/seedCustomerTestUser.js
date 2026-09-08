import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

import User from '../models/User.model.js';
import Address from '../models/Address.model.js';

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
            name: 'Demo Customer',
            email,
            password: 'Password123!',
            phone: '9876543210',
            role: 'customer',
            isVerified: true,
            isActive: true,
            fcmTokens: [],
            fcmTokenMobile: [],
        });
        console.log('Created customer@safefire.com with Password123!');
    }

    // Ensure default address exists
    const existingAddr = await Address.findOne({ userId: user._id });
    if (!existingAddr) {
        await Address.create({
            userId: user._id,
            name: 'Home',
            fullName: user.name || 'Demo Customer',
            phone: user.phone || '9876543210',
            address: 'Flat 402, Fire Safety Residency, 12th Main, Indiranagar',
            city: 'Bengaluru',
            state: 'Karnataka',
            zipCode: '560038',
            country: 'India',
            isDefault: true,
        });
        console.log('Created default address for customer@safefire.com');
    }

    // Verify comparison immediately
    const checkUser = await User.findOne({ email }).select('+password');
    const isMatch = await checkUser.comparePassword('Password123!');
    console.log('Password verification check:', isMatch ? '✅ MATCHES' : '❌ FAILED');

    await mongoose.disconnect();
}

seedTestUser().catch(console.error);
