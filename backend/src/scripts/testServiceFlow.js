import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Service from '../models/Service.model.js';
import Vendor from '../models/Vendor.model.js';
import VendorService from '../models/VendorService.model.js';
import ServiceBooking from '../models/ServiceBooking.model.js';
import User from '../models/User.model.js';

dotenv.config();

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/safefire';

const runVerificationTests = async () => {
    try {
        console.log('Connecting to MongoDB for End-to-End Verification...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB successfully.');

        // 1. Find approved Vendor
        let vendor = await Vendor.findOne({ status: 'approved' });
        if (!vendor) {
            console.log('No approved vendor found. Creating test approved vendor...');
            vendor = await Vendor.create({
                name: 'SafeFire Protection Services',
                storeName: 'SafeFire Protection Services',
                email: `vendor_test_${Date.now()}@safefire.com`,
                phone: '+91 98765 43210',
                password: 'Password123!',
                status: 'approved',
                isActive: true,
                rating: 4.8,
            });
        }
        console.log(`[TEST 1] Vendor verified: ${vendor.storeName} (ID: ${vendor._id})`);

        // 2. Find Fire Extinguisher Refill Master Service
        const refillService = await Service.findOne({ slug: 'fire-extinguisher-refill-recharge' });
        if (!refillService) {
            throw new Error('Fire Extinguisher Refill & Recharge master service not found! Run seed script first.');
        }
        console.log(`[TEST 2] Master Service verified: ${refillService.name} (ID: ${refillService._id})`);

        // 3. Vendor enables and configures service
        const vendorService = await VendorService.findOneAndUpdate(
            { vendorId: vendor._id, serviceId: refillService._id },
            {
                $set: {
                    vendorId: vendor._id,
                    serviceId: refillService._id,
                    price: 499,
                    serviceAreas: ['452001', '452002'],
                    dailyCapacity: 10,
                    workingHours: { start: '09:00', end: '18:00' },
                    isActive: true,
                },
            },
            { upsert: true, new: true }
        );
        console.log(`[TEST 3] VendorService configured: Price ₹${vendorService.price}, Pincodes: [${vendorService.serviceAreas.join(', ')}], Capacity: ${vendorService.dailyCapacity}/day`);

        // 4. Test Serviceability Matching for pincode 452001
        const eligibleVendors = await VendorService.find({
            serviceId: refillService._id,
            isActive: true,
            serviceAreas: '452001',
        }).populate('vendorId', 'storeName name email status isActive');

        console.log(`[TEST 4] Pincode 452001 Serviceability check returned ${eligibleVendors.length} provider(s).`);
        if (eligibleVendors.length === 0) {
            throw new Error('Pincode 452001 should be serviceable by VendorService!');
        }

        // 5. Test Serviceability Rejection for unsupported pincode 999999
        const unsupportedVendors = await VendorService.find({
            serviceId: refillService._id,
            isActive: true,
            serviceAreas: '999999',
        });
        console.log(`[TEST 5] Pincode 999999 Serviceability check returned ${unsupportedVendors.length} provider(s) (Expected: 0).`);
        if (unsupportedVendors.length > 0) {
            throw new Error('Unsupported pincode 999999 should return 0 vendors!');
        }

        // 6. Find or Create Customer
        let customer = await User.findOne({ role: 'customer' });
        if (!customer) {
            customer = await User.create({
                name: 'Test Customer',
                email: `customer_test_${Date.now()}@safefire.com`,
                phone: '+91 99999 88888',
                password: 'Password123!',
                role: 'customer',
            });
        }
        console.log(`[TEST 6] Customer verified: ${customer.name} (ID: ${customer._id})`);

        // 7. Create ServiceBooking with vendorId
        const bookingId = `SB-TEST-${Date.now().toString().slice(-5)}`;
        const bookingDate = new Date();
        bookingDate.setDate(bookingDate.getDate() + 1);

        const booking = await ServiceBooking.create({
            bookingId,
            userId: customer._id,
            serviceId: refillService._id,
            vendorId: vendor._id,
            vendorServiceId: vendorService._id,
            serviceName: refillService.name,
            categoryName: 'Fire Safety Services',
            quantity: 3,
            pincode: '452001',
            serviceAddress: {
                fullName: 'Test Customer',
                phone: '+91 99999 88888',
                address: '123 Fire Safety Lane, Vijay Nagar',
                city: 'Indore',
                state: 'Madhya Pradesh',
                zipCode: '452001',
            },
            bookingDate,
            timeSlot: '10:00 AM - 11:00 AM',
            customFields: {
                extinguisherType: 'ABC Dry Powder',
                cylinderCapacity: '6 KG',
                quantity: '3',
            },
            pricing: {
                unitPrice: 499,
                quantity: 3,
                subtotal: 1497,
                tax: 0,
                total: 1497,
            },
            paymentMethod: 'cod',
            paymentStatus: 'pending',
            status: 'pending',
        });

        console.log(`[TEST 7] ServiceBooking created successfully: ${booking.bookingId} for vendorId: ${booking.vendorId}`);
        if (String(booking.vendorId) !== String(vendor._id)) {
            throw new Error('ServiceBooking.vendorId does not match selected vendor ID!');
        }

        // 8. Lifecycle Transitions: PENDING -> CONFIRMED -> IN_PROGRESS -> COMPLETED
        booking.status = 'confirmed';
        booking.statusHistory.push({ previousStatus: 'pending', newStatus: 'confirmed', note: 'Vendor confirmed booking' });
        await booking.save();
        console.log(`[TEST 8.1] Transition PENDING -> CONFIRMED verified. Current: ${booking.status}`);

        booking.status = 'in_progress';
        booking.statusHistory.push({ previousStatus: 'confirmed', newStatus: 'in_progress', note: 'Technician dispatched' });
        await booking.save();
        console.log(`[TEST 8.2] Transition CONFIRMED -> IN_PROGRESS verified. Current: ${booking.status}`);

        booking.status = 'completed';
        booking.statusHistory.push({ previousStatus: 'in_progress', newStatus: 'completed', note: 'Service completed on-site' });
        await booking.save();
        console.log(`[TEST 8.3] Transition IN_PROGRESS -> COMPLETED verified. Current: ${booking.status}`);

        console.log('\n==================================================');
        console.log('✅ ALL 10 END-TO-END SERVICE FLOW TESTS PASSED!');
        console.log('==================================================\n');

        process.exit(0);
    } catch (err) {
        console.error('❌ Verification test failed:', err);
        process.exit(1);
    }
};

runVerificationTests();
