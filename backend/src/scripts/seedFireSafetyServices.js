import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ServiceCategory from '../models/ServiceCategory.model.js';
import Service from '../models/Service.model.js';

dotenv.config();

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/safefire';

const seedServices = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB successfully.');

        // 1. Seed or find Service Category
        let category = await ServiceCategory.findOne({ slug: 'fire-safety-services' });
        if (!category) {
            category = await ServiceCategory.create({
                name: 'Fire Safety Services',
                slug: 'fire-safety-services',
                description: 'Certified Fire Safety Refilling, Inspection, and Installation Services.',
                sortOrder: 1,
                isActive: true,
            });
            console.log('Created ServiceCategory: Fire Safety Services');
        } else {
            console.log('Found existing ServiceCategory: Fire Safety Services');
        }

        // 2. Define the 3 Core MVP Services
        const mvpServices = [
            {
                name: 'Fire Extinguisher Refill & Recharge',
                slug: 'fire-extinguisher-refill-recharge',
                categoryId: category._id,
                description: 'Professional ISO-certified refilling, pressure checking, testing, and servicing for all types of fire extinguishers.',
                shortDescription: 'Certified refilling, pressure checking & servicing for fire extinguishers.',
                pricingType: 'PER_UNIT',
                bookingType: 'SCHEDULED',
                estimatedDuration: '1 - 2 Hours',
                isActive: true,
                sortOrder: 1,
                serviceSettings: {
                    requiresAddress: true,
                    requiresDate: true,
                    requiresTimeSlot: true,
                    requiresQuantity: true,
                    requiresSiteVisit: false,
                    requiresQuote: false,
                },
                serviceFields: [
                    {
                        key: 'extinguisherType',
                        label: 'Extinguisher Type',
                        type: 'SELECT',
                        required: true,
                        options: ['ABC Dry Powder', 'CO2 Gas', 'Water Type', 'Foam Type', 'Clean Agent'],
                        sortOrder: 1,
                    },
                    {
                        key: 'cylinderCapacity',
                        label: 'Cylinder Capacity',
                        type: 'SELECT',
                        required: true,
                        options: ['1 KG', '2 KG', '4 KG', '6 KG', '9 KG', '4.5 KG CO2'],
                        sortOrder: 2,
                    },
                    {
                        key: 'quantity',
                        label: 'Number of Cylinders',
                        type: 'NUMBER',
                        required: true,
                        placeholder: 'e.g. 3',
                        sortOrder: 3,
                    },
                ],
            },
            {
                name: 'Fire Safety Inspection & Compliance Check',
                slug: 'fire-safety-inspection-compliance-check',
                categoryId: category._id,
                description: 'Comprehensive site inspection by certified safety auditors to check fire hydrants, alarms, exit routes, and issue safety audit reports.',
                shortDescription: 'On-site fire safety audit, hazard inspection & compliance check.',
                pricingType: 'FIXED',
                bookingType: 'SITE_VISIT',
                estimatedDuration: '2 - 4 Hours',
                isActive: true,
                sortOrder: 2,
                serviceSettings: {
                    requiresAddress: true,
                    requiresDate: true,
                    requiresTimeSlot: true,
                    requiresQuantity: false,
                    requiresSiteVisit: true,
                    requiresQuote: false,
                },
                serviceFields: [
                    {
                        key: 'propertyType',
                        label: 'Property Type',
                        type: 'SELECT',
                        required: true,
                        options: ['Commercial Office', 'Residential Apartment', 'Industrial Factory', 'Warehouse', 'Hospital/School'],
                        sortOrder: 1,
                    },
                    {
                        key: 'numberOfFloors',
                        label: 'Number of Floors',
                        type: 'NUMBER',
                        required: true,
                        placeholder: 'e.g. 4',
                        sortOrder: 2,
                    },
                    {
                        key: 'areaSqFt',
                        label: 'Approximate Area (sq. ft.)',
                        type: 'TEXT',
                        required: false,
                        placeholder: 'e.g. 5000 sq ft',
                        sortOrder: 3,
                    },
                ],
            },
            {
                name: 'Fire Safety Equipment Installation',
                slug: 'fire-safety-equipment-installation',
                categoryId: category._id,
                description: 'Expert installation of fire hose reels, ceiling sprinkler systems, fire alarm control panels, and emergency exit signage.',
                shortDescription: 'Professional mounting & setup of fire safety equipment.',
                pricingType: 'PER_UNIT',
                bookingType: 'SCHEDULED',
                estimatedDuration: '2 - 6 Hours',
                isActive: true,
                sortOrder: 3,
                serviceSettings: {
                    requiresAddress: true,
                    requiresDate: true,
                    requiresTimeSlot: true,
                    requiresQuantity: true,
                    requiresSiteVisit: false,
                    requiresQuote: false,
                },
                serviceFields: [
                    {
                        key: 'equipmentType',
                        label: 'Equipment to Install',
                        type: 'SELECT',
                        required: true,
                        options: ['Fire Hose Reel', 'Ceiling Extinguisher / Sprinkler', 'Fire Alarm Panel & Smoke Detectors', 'Emergency Exit Signage'],
                        sortOrder: 1,
                    },
                    {
                        key: 'quantity',
                        label: 'Number of Units',
                        type: 'NUMBER',
                        required: true,
                        placeholder: 'e.g. 5',
                        sortOrder: 2,
                    },
                    {
                        key: 'installationLocation',
                        label: 'Installation Location Notes',
                        type: 'TEXTAREA',
                        required: false,
                        placeholder: 'e.g. Ground floor lobby and main staircase',
                        sortOrder: 3,
                    },
                ],
            },
        ];

        for (const item of mvpServices) {
            const updated = await Service.findOneAndUpdate(
                { slug: item.slug },
                { $set: item },
                { upsert: true, new: true }
            );
            console.log(`Seeded Service Master: ${updated.name} (ID: ${updated._id})`);
        }

        console.log('Seeding MVP Fire Safety Services completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Error seeding services:', err);
        process.exit(1);
    }
};

seedServices();
