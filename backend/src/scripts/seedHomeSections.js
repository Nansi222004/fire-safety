import HomeSection from '../models/HomeSection.model.js';
import HomeBanner from '../models/HomeBanner.model.js';
import AppConfig from '../models/AppConfig.model.js';

export const seedHomepageSections = async () => {
    try {
        // 1. Seed Default Banners if not present
        const defaultBanners = [
            {
                name: 'Default Flash Sale Banner',
                title: 'Be Prepared. Stay Protected.',
                subtitle: 'Essential fire extinguishers & suppression equipment for home & office.',
                desktopImage: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=1200&q=80',
                mobileImage: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=600&q=80',
                ctaText: 'Shop Safety Products',
                ctaLink: '/search?flashSale=true',
                textColor: '#ffffff',
                buttonColor: '#e31e24',
                backgroundColor: '#e31e24',
                gradient: 'linear-gradient(135deg, #e31e24 0%, #1f1f1f 100%)',
                overlayOpacity: 0.4,
                isDefault: true,
                sectionType: 'flash_sale',
                tags: ['default', 'flash_sale']
            },
            {
                name: 'Default Seasonal Campaign Banner',
                title: 'Fire Safety Equipment Showcase',
                subtitle: 'Certified fire blankets, smoke alarms, and heavy-duty hose reels.',
                desktopImage: 'https://images.unsplash.com/photo-1599481238640-4c1288750d7a?auto=format&fit=crop&w=1200&q=80',
                mobileImage: 'https://images.unsplash.com/photo-1599481238640-4c1288750d7a?auto=format&fit=crop&w=600&q=80',
                ctaText: 'Explore Equipment',
                ctaLink: '/search?newArrivals=true',
                textColor: '#ffffff',
                buttonColor: '#e31e24',
                backgroundColor: '#e31e24',
                gradient: 'linear-gradient(135deg, #e31e24 0%, #ff6a00 100%)',
                overlayOpacity: 0.35,
                isDefault: true,
                sectionType: 'seasonal_collection',
                tags: ['default', 'seasonal']
            },
            {
                name: 'Default Promotional Banner',
                title: 'Safety Today, Secure Tomorrow',
                subtitle: 'Explore certified fire protection gear at competitive rates.',
                desktopImage: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=1200&q=80',
                mobileImage: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=600&q=80',
                ctaText: 'Shop Safety',
                ctaLink: '/offers',
                textColor: '#ffffff',
                buttonColor: '#ffffff',
                backgroundColor: '#e31e24',
                gradient: 'linear-gradient(135deg, #e31e24 0%, #1f1f1f 100%)',
                overlayOpacity: 0.3,
                isDefault: true,
                sectionType: 'promotional_banner',
                tags: ['default', 'promotion']
            }
        ];

        for (const bannerData of defaultBanners) {
            const exists = await HomeBanner.findOne({ sectionType: bannerData.sectionType, isDefault: true });
            if (!exists) {
                await HomeBanner.create(bannerData);
                console.log(`✨ Created default HomeBanner for ${bannerData.sectionType}`);
            }
        }

        // 2. Seed Default Sections if not present
        const count = await HomeSection.countDocuments();
        if (count >= 3) {
            console.log('📦 Homepage sections already seeded.');
            return;
        }

        const defaultSections = [
            {
                key: 'flash_sale',
                sectionType: 'flash_sale',
                title: 'Super Safety Flash Sale',
                subtitle: 'Limited time offers on certified fire extinguishers.',
                isActive: true,
                order: 1,
                displayLimit: 10,
                minimumProducts: 4,
                layout: 'carousel',
                curationMode: 'manual',
                bannerAsset: null, // Resolves to default banner on load
                version: 1,
            },
            {
                key: 'seasonal_collection',
                sectionType: 'seasonal_collection',
                title: 'Fire Safety Equipment Collection',
                subtitle: 'Explore certified fire protection gear for your facility.',
                isActive: true,
                order: 2,
                displayLimit: 10,
                minimumProducts: 4,
                layout: 'horizontal',
                curationMode: 'manual',
                bannerAsset: null, // Resolves to default banner on load
                version: 1,
            },
            {
                key: 'promotional_banner',
                sectionType: 'promotional_banner',
                title: 'Fire Protection AMC & Refill Campaign',
                subtitle: 'Scheduled maintenance, refilling, and pressure testing.',
                isActive: true,
                order: 3,
                displayLimit: 1,
                minimumProducts: 0,
                layout: 'banner',
                curationMode: 'manual',
                bannerAsset: null, // Resolves to default banner on load
                version: 1,
            },
        ];

        for (const sec of defaultSections) {
            const exists = await HomeSection.findOne({ key: sec.key });
            if (!exists) {
                await HomeSection.create(sec);
                console.log(`✨ Created default homepage section: ${sec.key}`);
            }
        }
        console.log('✅ Homepage sections seeding complete.');

        // 3. Seed Default Shop AppConfig
        const shopConfigExists = await AppConfig.findOne({ key: 'shop' });
        if (!shopConfigExists) {
            await AppConfig.create({
                key: 'shop',
                value: {
                    defaultSort: 'newest',
                    productsPerPage: 20,
                    defaultViewMode: 'grid',
                    quickFilters: [
                        { label: 'All', queryParams: '{}', isActive: true, order: 1 },
                        { label: 'New Arrivals', queryParams: '{"isNewArrival":"true"}', isActive: true, order: 2 },
                        { label: 'Best Sellers', queryParams: '{"sort":"popular"}', isActive: true, order: 3 },
                        { label: 'Top Rated', queryParams: '{"minRating":"4"}', isActive: true, order: 4 },
                        { label: 'Discounts', queryParams: '{"discount":"10"}', isActive: true, order: 5 },
                        { label: 'In Stock', queryParams: '{"stock":"in_stock"}', isActive: true, order: 6 }
                    ],
                    featuredCategories: [],
                    featuredBrands: [],
                    bannerAsset: null,
                    enabledFilters: {
                        category: true,
                        brand: true,
                        price: true,
                        rating: true,
                        discount: true,
                        stock: true,
                        vendor: true,
                        deliveryType: true,
                        color: true,
                        size: true
                    }
                }
            });
            console.log('✨ Seeded default shop configurations in AppConfig');
        }
    } catch (err) {
        console.error('❌ Failed to seed homepage sections:', err);
    }
};
