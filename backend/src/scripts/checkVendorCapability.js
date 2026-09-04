import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import Vendor from '../models/Vendor.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function checkVendor() {
    await mongoose.connect(process.env.MONGO_URI);
    const vendor = await Vendor.findOne({ email: 'nansitiwari31@gmail.com' }).lean();
    if (vendor) {
        console.log(`VENDOR FOUND: ${vendor.storeName} (${vendor.email})`);
        console.log(`Capabilities:`, vendor.vendorCapabilities);
        console.log(`Status:`, vendor.status);
    } else {
        console.log('Vendor not found.');
    }
    await mongoose.disconnect();
}

checkVendor();
