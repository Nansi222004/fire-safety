import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import Vendor from '../models/Vendor.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function listVendors() {
    await mongoose.connect(process.env.MONGO_URI);
    const vendors = await Vendor.find({}).lean();
    console.log(`TOTAL VENDORS IN DB: ${vendors.length}`);
    vendors.forEach((v, index) => {
        console.log(`\nVendor #${index + 1}:`);
        console.log(` - ID: ${v._id}`);
        console.log(` - Name / Store: "${v.name}" / "${v.storeName}"`);
        console.log(` - Email: "${v.email}"`);
        console.log(` - Capabilities:`, v.vendorCapabilities);
        console.log(` - Status: ${v.status}`);
    });
    await mongoose.disconnect();
}

listVendors();
