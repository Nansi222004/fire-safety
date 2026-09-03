import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import Vendor from '../models/Vendor.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function getLatestVendorOTP() {
    await mongoose.connect(process.env.MONGO_URI);
    const vendor = await Vendor.findOne({}).sort({ createdAt: -1 }).select('+otp +otpExpiry').lean();
    if (vendor) {
        console.log(`LATEST VENDOR REGISTERED:`);
        console.log(` - Store Name: "${vendor.storeName}"`);
        console.log(` - Email: "${vendor.email}"`);
        console.log(` - Current OTP in DB: "${vendor.otp || 'No OTP / Verified'}"`);
        console.log(` - OTP Expiry: ${vendor.otpExpiry}`);
        console.log(` - Status: ${vendor.status} | Verified: ${vendor.isVerified}`);
    } else {
        console.log('No vendors found.');
    }
    await mongoose.disconnect();
}

getLatestVendorOTP();
