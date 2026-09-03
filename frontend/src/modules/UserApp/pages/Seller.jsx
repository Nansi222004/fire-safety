import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FiFilter, FiArrowLeft, FiGrid, FiX, FiCheckCircle, FiStar, FiShoppingBag, FiTool, FiInfo } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import MobileLayout from "../components/Layout/MobileLayout";
import ProductCard from "../../../shared/components/ProductCard";
import ProductListItem from "../components/Mobile/ProductListItem";
import { getProductsByVendor, getVendorById } from "../data/catalogData";
import { useCategoryStore } from "../../../shared/store/categoryStore";
import { categories as fallbackCategories } from "../../../data/categories";
import PageTransition from "../../../shared/components/PageTransition";
import useInfiniteScroll from "../../../shared/hooks/useInfiniteScroll";
import LazyImage from "../../../shared/components/LazyImage";
import { getPlaceholderImage, formatPrice } from "../../../shared/utils/helpers";
import api from "../../../shared/utils/api";

const normalizeVendor = (raw) => ({
    ...raw,
    id: String(raw?.id || raw?._id || ""),
    _id: String(raw?.id || raw?._id || ""),
    rating: Number(raw?.rating) || 4.8,
    reviewCount: Number(raw?.reviewCount) || 12,
    isVerified: !!raw?.isVerified,
    vendorCapabilities: raw?.vendorCapabilities || { sellsProducts: true, providesServices: false },
});

const normalizeProduct = (raw) => ({
    ...raw,
    id: String(raw?.id || raw?._id || ""),
    _id: String(raw?.id || raw?._id || ""),
    vendorId: String(raw?.vendorId?._id || raw?.vendorId || ""),
    brandId: String(raw?.brandId?._id || raw?.brandId || ""),
    image: raw?.image || raw?.images?.[0] || "",
    images: Array.isArray(raw?.images) ? raw.images : raw?.image ? [raw.image] : [],
    price: Number(raw?.price) || 0,
    rating: Number(raw?.rating) || 0,
    reviewCount: Number(raw?.reviewCount) || 0,
});

const Seller = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const vendorId = String(id ?? "").trim();
    const { categories, initialize, getRootCategories } = useCategoryStore();

    useEffect(() => {
        initialize();
    }, [initialize]);

    const rootCategories = useMemo(() => {
        const roots = getRootCategories().filter((cat) => cat.isActive !== false);
        return roots.length ? roots : fallbackCategories;
    }, [categories, getRootCategories]);

    const [catalogVersion, setCatalogVersion] = useState(0);
    const [remoteVendor, setRemoteVendor] = useState(null);
    const [remoteProducts, setRemoteProducts] = useState([]);
    const [remoteServices, setRemoteServices] = useState([]);
    const [isResolvingVendor, setIsResolvingVendor] = useState(true);

    const [activeTab, setActiveTab] = useState("products"); // 'products' | 'services' | 'about'

    const vendor = useMemo(
        () => getVendorById(vendorId) || remoteVendor,
        [vendorId, catalogVersion, remoteVendor]
    );

    const caps = useMemo(() => {
        return vendor?.vendorCapabilities || { sellsProducts: true, providesServices: false };
    }, [vendor]);

    // Available tabs based on capability
    const availableTabs = useMemo(() => {
        const tabs = [];
        if (caps.sellsProducts) tabs.push({ key: "products", label: "Products", icon: FiShoppingBag });
        if (caps.providesServices) tabs.push({ key: "services", label: "Services", icon: FiTool });
        tabs.push({ key: "about", label: "About Seller", icon: FiInfo });
        return tabs;
    }, [caps]);

    // Ensure activeTab matches available tabs
    useEffect(() => {
        if (availableTabs.length > 0 && !availableTabs.some((t) => t.key === activeTab)) {
            setActiveTab(availableTabs[0].key);
        }
    }, [availableTabs, activeTab]);

    const [showFilters, setShowFilters] = useState(false);
    const [viewMode, setViewMode] = useState("grid");
    const [filters, setFilters] = useState({
        minPrice: "",
        maxPrice: "",
        minRating: "",
        categoryId: "",
    });

    const rawVendorProducts = useMemo(() => {
        if (!vendorId || !caps.sellsProducts) return [];
        const local = getProductsByVendor(vendorId);
        if (!remoteProducts.length) return local;

        const merged = [...remoteProducts];
        local.forEach((item) => {
            const exists = merged.some((p) => String(p.id) === String(item.id));
            if (!exists) merged.push(item);
        });

        return merged;
    }, [vendorId, remoteProducts, catalogVersion, caps.sellsProducts]);

    const vendorProducts = useMemo(() => {
        let result = rawVendorProducts;

        if (filters.minPrice) {
            result = result.filter((p) => p.price >= parseFloat(filters.minPrice));
        }
        if (filters.maxPrice) {
            result = result.filter((p) => p.price <= parseFloat(filters.maxPrice));
        }
        if (filters.minRating) {
            result = result.filter((p) => p.rating >= parseFloat(filters.minRating));
        }
        if (filters.categoryId) {
            result = result.filter((p) => String(p.categoryId) === String(filters.categoryId));
        }

        return result;
    }, [rawVendorProducts, filters]);

    const { displayedItems, hasMore, isLoading, loadMore, loadMoreRef } =
        useInfiniteScroll(vendorProducts, 10, 10);

    const filterButtonRef = useRef(null);

    const hasActiveFilters = filters.minPrice || filters.maxPrice || filters.minRating || filters.categoryId;

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (
                showFilters &&
                filterButtonRef.current &&
                !filterButtonRef.current.contains(event.target) &&
                !event.target.closest(".filter-dropdown")
            ) {
                setShowFilters(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("touchstart", handleClickOutside);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("touchstart", handleClickOutside);
        };
    }, [showFilters]);

    useEffect(() => {
        const handleCatalogUpdate = () => setCatalogVersion((prev) => prev + 1);
        window.addEventListener("catalog-cache-updated", handleCatalogUpdate);
        return () => {
            window.removeEventListener("catalog-cache-updated", handleCatalogUpdate);
        };
    }, []);

    useEffect(() => {
        let active = true;
        const fetchVendorData = async () => {
            if (!vendorId) {
                if (active) {
                    setRemoteVendor(null);
                    setRemoteProducts([]);
                    setRemoteServices([]);
                    setIsResolvingVendor(false);
                }
                return;
            }

            setIsResolvingVendor(true);
            try {
                const vendorRes = await api.get(`/vendors/${vendorId}`);
                if (!active) return;

                const vendorPayload = vendorRes?.data ?? vendorRes;
                const vendorDoc = vendorPayload ? normalizeVendor(vendorPayload) : null;

                setRemoteVendor(vendorDoc);

                const vCaps = vendorDoc?.vendorCapabilities || { sellsProducts: true, providesServices: false };

                // Fetch Products if vendor sells products
                if (vCaps.sellsProducts) {
                    const productsRes = await api.get(`/vendors/${vendorId}/products`, { params: { page: 1, limit: 100 } });
                    const productsPayload = productsRes?.data ?? productsRes;
                    const allProducts = Array.isArray(productsPayload?.products) ? [...productsPayload.products] : [];
                    setRemoteProducts(allProducts.map(normalizeProduct));
                } else {
                    setRemoteProducts([]);
                }

                // Fetch Services if vendor provides services
                if (vCaps.providesServices) {
                    const servicesRes = await api.get(`/vendors/${vendorId}/services`);
                    const servicesPayload = servicesRes?.data ?? servicesRes;
                    const serviceList = Array.isArray(servicesPayload?.services) ? servicesPayload.services : [];
                    setRemoteServices(serviceList);
                } else {
                    setRemoteServices([]);
                }
            } catch {
                if (!active) return;
                setRemoteVendor(null);
                setRemoteProducts([]);
                setRemoteServices([]);
            } finally {
                if (active) setIsResolvingVendor(false);
            }
        };

        fetchVendorData();
        return () => {
            active = false;
        };
    }, [vendorId]);

    if (isResolvingVendor) {
        return (
            <PageTransition>
                <MobileLayout showBottomNav={false} showCartBar={false}>
                    <div className="flex items-center justify-center min-h-[60vh] px-4">
                        <p className="text-[#64748B] text-sm">Loading seller storefront...</p>
                    </div>
                </MobileLayout>
            </PageTransition>
        );
    }

    if (!vendor) {
        return (
            <PageTransition>
                <MobileLayout showBottomNav={false} showCartBar={false}>
                    <div className="flex items-center justify-center min-h-[60vh] px-4">
                        <div className="text-center">
                            <h2 className="text-xl font-bold text-[#0F172A] mb-4">
                                Seller Storefront Not Found
                            </h2>
                            <button
                                onClick={() => navigate("/home")}
                                className="bg-[#E31E24] text-white px-6 py-3 rounded-xl font-bold text-sm shadow-md hover:bg-[#c6151b] transition-colors">
                                Go Back Home
                            </button>
                        </div>
                    </div>
                </MobileLayout>
            </PageTransition>
        );
    }

    return (
        <PageTransition>
            <MobileLayout showBottomNav={true} showCartBar={true}>
                <div className="w-full pb-24 lg:pb-12 max-w-7xl mx-auto min-h-screen bg-[#F8FAFC]">
                    {/* Header */}
                    <div className="bg-white border-b border-[#E5E7EB] sticky top-0 z-30 shadow-xs">
                        <div className="px-3 md:px-6 py-3">
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => navigate(-1)}
                                    className="p-2 hover:bg-[#F1F5F9] rounded-xl transition-colors"
                                >
                                    <FiArrowLeft className="text-xl text-[#0F172A]" />
                                </button>
                                <div className="flex-1 min-w-0">
                                    <h1 className="text-lg md:text-xl font-black text-[#0F172A] truncate">
                                        {vendor.storeName || vendor.name}
                                    </h1>
                                    <p className="text-xs text-[#64748B] truncate">
                                        Certified SafeFire Marketplace Vendor
                                    </p>
                                </div>

                                {activeTab === "products" && caps.sellsProducts && (
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
                                            className="p-2 border border-[#E5E7EB] rounded-xl text-[#0F172A] hover:bg-[#F1F5F9]"
                                        >
                                            <FiGrid className="text-lg" />
                                        </button>

                                        <div ref={filterButtonRef} className="relative">
                                            <button
                                                onClick={() => setShowFilters(!showFilters)}
                                                className={`p-2 border rounded-xl transition-colors ${
                                                    hasActiveFilters ? "border-[#E31E24] bg-red-50 text-[#E31E24]" : "border-[#E5E7EB] text-[#0F172A] hover:bg-[#F1F5F9]"
                                                }`}
                                            >
                                                <FiFilter className="text-lg" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Storefront Hero Profile Box */}
                        <div className="px-4 py-4 bg-gradient-to-br from-slate-900 via-slate-800 to-[#1F1F1F] text-white">
                            <div className="flex flex-col sm:flex-row items-center gap-4">
                                <div className="w-20 h-20 rounded-2xl bg-white p-1 shadow-md overflow-hidden flex-shrink-0">
                                    <LazyImage
                                        src={vendor.storeLogo}
                                        alt={vendor.storeName || vendor.name}
                                        className="w-full h-full object-cover rounded-xl"
                                        onError={(e) => {
                                            e.target.src = getPlaceholderImage(80, 80, (vendor.storeName || vendor.name).charAt(0));
                                        }}
                                    />
                                </div>
                                <div className="text-center sm:text-left flex-1 min-w-0">
                                    <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                                        <h2 className="font-extrabold text-xl text-white">{vendor.storeName || vendor.name}</h2>
                                        {vendor.isVerified && <FiCheckCircle className="text-[#E31E24] text-lg" />}
                                    </div>
                                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs text-slate-300">
                                        <div className="flex items-center gap-1">
                                            <FiStar className="text-amber-400 fill-amber-400" />
                                            <span className="font-bold">{vendor.rating}</span>
                                            <span className="text-slate-400">({vendor.reviewCount} reviews)</span>
                                        </div>
                                        {caps.sellsProducts && (
                                            <div className="flex items-center gap-1">
                                                <FiShoppingBag className="text-slate-400" />
                                                <span>{rawVendorProducts.length} Products</span>
                                            </div>
                                        )}
                                        {caps.providesServices && (
                                            <div className="flex items-center gap-1">
                                                <FiTool className="text-[#FF6A00]" />
                                                <span>{remoteServices.length} Active Services</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Storefront Dynamic Capability Navigation Tabs */}
                        <div className="flex border-b border-[#E5E7EB] bg-white px-2">
                            {availableTabs.map((tab) => {
                                const Icon = tab.icon;
                                const isActive = activeTab === tab.key;
                                return (
                                    <button
                                        key={tab.key}
                                        onClick={() => setActiveTab(tab.key)}
                                        className={`flex items-center gap-2 px-5 py-3.5 border-b-2 font-bold text-xs sm:text-sm transition-all ${
                                            isActive
                                                ? 'border-[#E31E24] text-[#E31E24]'
                                                : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
                                        }`}
                                    >
                                        <Icon className="text-base" />
                                        <span>{tab.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Tab 1: Products Tab Content */}
                    {activeTab === "products" && caps.sellsProducts && (
                        <div className="px-4 py-6">
                            {vendorProducts.length === 0 ? (
                                <div className="text-center py-16 bg-white rounded-2xl border border-[#E5E7EB] p-8">
                                    <div className="text-5xl text-[#94A3B8] mx-auto mb-3">🛒</div>
                                    <h3 className="text-lg font-bold text-[#0F172A] mb-1">
                                        No products found
                                    </h3>
                                    <p className="text-xs text-[#64748B]">
                                        This seller currently has no active products listed.
                                    </p>
                                </div>
                            ) : viewMode === "grid" ? (
                                <>
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 lg:gap-6">
                                        {displayedItems.map((product, index) => (
                                            <motion.div
                                                key={product.id}
                                                initial={{ opacity: 0, y: 15 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: index * 0.04 }}>
                                                <ProductCard product={product} />
                                            </motion.div>
                                        ))}
                                    </div>

                                    {hasMore && (
                                        <div ref={loadMoreRef} className="mt-8 flex flex-col items-center gap-3">
                                            <button
                                                onClick={loadMore}
                                                disabled={isLoading}
                                                className="px-6 py-3 bg-[#E31E24] text-white rounded-xl font-bold text-xs hover:bg-[#c6151b] transition-all shadow-md">
                                                {isLoading ? "Loading..." : "Load More Products"}
                                            </button>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="space-y-3">
                                    {displayedItems.map((product, index) => (
                                        <ProductListItem
                                            key={product.id}
                                            product={product}
                                            index={index}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tab 2: Services Tab Content */}
                    {activeTab === "services" && caps.providesServices && (
                        <div className="px-4 py-6 space-y-4">
                            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex items-center justify-between">
                                <div>
                                    <h3 className="font-bold text-[#0F172A] text-sm">Certified Service Provider</h3>
                                    <p className="text-xs text-[#64748B]">Select a service to check pincode coverage & book an appointment.</p>
                                </div>
                                <div className="w-9 h-9 rounded-xl bg-[#FF6A00] text-white flex items-center justify-center text-lg font-bold">
                                    🛠️
                                </div>
                            </div>

                            {remoteServices.length === 0 ? (
                                <div className="text-center py-16 bg-white rounded-2xl border border-[#E5E7EB] p-8">
                                    <div className="text-5xl text-[#94A3B8] mx-auto mb-3">🛠️</div>
                                    <h3 className="text-lg font-bold text-[#0F172A] mb-1">
                                        No active services listed
                                    </h3>
                                    <p className="text-xs text-[#64748B]">
                                        This vendor has not configured any active services yet.
                                    </p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {remoteServices.map((vs) => {
                                        const master = vs.serviceId || {};
                                        return (
                                            <div
                                                key={vs._id}
                                                className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                                            >
                                                <div className="space-y-3">
                                                    <div className="flex items-start gap-3">
                                                        <img
                                                            src={master.image || master.icon || getPlaceholderImage(60, 60, master.name?.charAt(0))}
                                                            alt={master.name || 'Fire Safety Service'}
                                                            className="w-14 h-14 object-cover rounded-xl border border-slate-100"
                                                        />
                                                        <div>
                                                            <h4 className="font-bold text-[#0F172A] text-sm leading-snug">
                                                                {master.name || 'Fire Safety Service'}
                                                            </h4>
                                                            <p className="text-xs text-[#64748B] line-clamp-2 mt-0.5">
                                                                {master.shortDescription || master.description || 'Professional fire safety service.'}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="bg-[#F8FAFC] rounded-xl p-3 text-xs flex items-center justify-between">
                                                        <span className="text-[#64748B] font-medium">Service Rate:</span>
                                                        <span className="font-black text-[#E31E24] text-sm">
                                                            {formatPrice(vs.price || 0)}
                                                        </span>
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => navigate(`/services/${master._id || master.id}`)}
                                                    className="mt-4 w-full py-2.5 bg-[#E31E24] hover:bg-[#c6151b] text-white rounded-xl font-bold text-xs shadow-xs transition-colors flex items-center justify-center gap-1.5"
                                                >
                                                    Book Service Now
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tab 3: About Tab Content */}
                    {activeTab === "about" && (
                        <div className="px-4 py-6 max-w-3xl space-y-6">
                            <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-sm space-y-4">
                                <h3 className="text-base font-bold text-[#0F172A]">About {vendor.storeName || vendor.name}</h3>
                                <p className="text-xs text-[#64748B] leading-relaxed">
                                    {vendor.storeDescription || 'This seller is a verified vendor on the SafeFire Platform, committed to providing certified fire safety equipment and professional safety services.'}
                                </p>
                            </div>

                            <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-sm space-y-3 text-xs">
                                <h4 className="font-bold text-[#0F172A] text-sm">Capabilities & Credentials</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                    <div className="p-3 bg-[#F8FAFC] rounded-xl border border-slate-100">
                                        <span className="text-[#64748B] block mb-0.5">Product Marketplace:</span>
                                        <span className={`font-bold ${caps.sellsProducts ? 'text-emerald-600' : 'text-slate-400'}`}>
                                            {caps.sellsProducts ? '✓ Active Equipment Seller' : 'Disabled'}
                                        </span>
                                    </div>
                                    <div className="p-3 bg-[#F8FAFC] rounded-xl border border-slate-100">
                                        <span className="text-[#64748B] block mb-0.5">Service Marketplace:</span>
                                        <span className={`font-bold ${caps.providesServices ? 'text-emerald-600' : 'text-slate-400'}`}>
                                            {caps.providesServices ? '✓ Certified Service Provider' : 'Disabled'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </MobileLayout>
        </PageTransition>
    );
};

export default Seller;
