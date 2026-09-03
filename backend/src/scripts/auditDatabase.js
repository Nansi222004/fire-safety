import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

import Vendor from '../models/Vendor.model.js';
import Product from '../models/Product.model.js';
import Category from '../models/Category.model.js';
import ServiceCategory from '../models/ServiceCategory.model.js';
import Service from '../models/Service.model.js';
import VendorService from '../models/VendorService.model.js';
import ServiceBooking from '../models/ServiceBooking.model.js';
import ServiceRequest from '../models/ServiceRequest.model.js';
import Order from '../models/Order.model.js';
import User from '../models/User.model.js';
import Review from '../models/Review.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGO_URI = process.env.MONGO_URI;

async function auditDatabase() {
    console.log('=== STARTING DATABASE AUDIT ===');
    await mongoose.connect(MONGO_URI);
    console.log('✓ Connected to MongoDB');

    const results = {
        vendors: { total: 0, invalidCapabilities: 0, pending: 0, approved: 0 },
        products: { total: 0, brokenVendorRefs: 0, legacyFashionItems: 0 },
        services: { total: 0, categories: 0 },
        vendorServices: { total: 0, brokenVendorRefs: 0, brokenServiceRefs: 0 },
        serviceBookings: { total: 0, brokenVendorRefs: 0, brokenServiceRefs: 0 },
        orders: { total: 0 },
        legacyKeywordsFound: [],
    };

    // 1. Audit Vendors
    const vendors = await Vendor.find({}).lean();
    results.vendors.total = vendors.length;
    vendors.forEach(v => {
        if (!v.vendorCapabilities || (v.vendorCapabilities.sellsProducts === false && v.vendorCapabilities.providesServices === false)) {
            results.vendors.invalidCapabilities++;
        }
        if (v.status === 'pending') results.vendors.pending++;
        if (v.status === 'approved') results.vendors.approved++;
    });

    // 2. Audit Products
    const products = await Product.find({}).lean();
    results.products.total = products.length;
    for (const p of products) {
        if (!p.vendorId) {
            results.products.brokenVendorRefs++;
        } else {
            const vExists = await Vendor.exists({ _id: p.vendorId });
            if (!vExists) results.products.brokenVendorRefs++;
        }
        const lowerName = String(p.name || '').toLowerCase();
        if (lowerName.includes('shirt') || lowerName.includes('sneaker') || lowerName.includes('beauty') || lowerName.includes('fashion') || lowerName.includes('sunglass')) {
            results.products.legacyFashionItems++;
            results.legacyKeywordsFound.push(`Product: ${p.name}`);
        }
    }

    // 3. Audit VendorServices
    const vendorServices = await VendorService.find({}).lean();
    results.vendorServices.total = vendorServices.length;
    for (const vs of vendorServices) {
        const vExists = await Vendor.exists({ _id: vs.vendorId });
        if (!vExists) results.vendorServices.brokenVendorRefs++;
        const sExists = await Service.exists({ _id: vs.serviceId });
        if (!sExists) results.vendorServices.brokenServiceRefs++;
    }

    // 4. Audit ServiceBookings
    const serviceBookings = await ServiceBooking.find({}).lean();
    results.serviceBookings.total = serviceBookings.length;
    for (const sb of serviceBookings) {
        const vExists = await Vendor.exists({ _id: sb.vendorId });
        if (!vExists) results.serviceBookings.brokenVendorRefs++;
        const sExists = await Service.exists({ _id: sb.serviceId });
        if (!sExists) results.serviceBookings.brokenServiceRefs++;
    }

    // 5. Audit Services & Service Categories
    results.services.total = await Service.countDocuments({});
    results.services.categories = await ServiceCategory.countDocuments({});
    results.orders.total = await Order.countDocuments({});

    console.log('\n--- AUDIT RESULTS SUMMARY ---');
    console.log(JSON.stringify(results, null, 2));
    console.log('=== END DATABASE AUDIT ===');

    await mongoose.disconnect();
}

auditDatabase();
