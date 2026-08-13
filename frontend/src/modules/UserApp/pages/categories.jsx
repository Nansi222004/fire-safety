import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { FiArrowLeft, FiFilter, FiX, FiSearch, FiLayers, FiShield } from "react-icons/fi";
import MobileLayout from "../components/Layout/MobileLayout";
import { categories as fallbackCategories } from "../../../data/categories";
import { getCatalogProducts } from "../data/catalogData";
import { useCategoryStore } from "../../../shared/store/categoryStore";
import PageTransition from "../../../shared/components/PageTransition";
import LazyImage from "../../../shared/components/LazyImage";
import ProductCard from "../../../shared/components/ProductCard";
import api from "../../../shared/utils/api";
import AnimatedBanner from "../components/Mobile/AnimatedBanner";

const normalizeId = (value) => String(value ?? "").trim();

const ALL_CATEGORY = {
  id: "all",
  name: "All",
  description: "Certified fire extinguishers, hoses, alarms & safety gear across all categories",
  image: "/logos/safefire_logo.png",
  isAll: true,
};

const getParentId = (category) => {
  const parent = category?.parentId;
  if (!parent) return null;
  if (typeof parent === "object") {
    return normalizeId(parent?._id ?? parent?.id ?? "");
  }
  return normalizeId(parent);
};

const normalizeProduct = (raw) => {
  const vendorObj =
    raw?.vendor && typeof raw.vendor === "object"
      ? raw.vendor
      : raw?.vendorId && typeof raw.vendorId === "object"
        ? raw.vendorId
        : null;
  const brandObj =
    raw?.brand && typeof raw.brand === "object"
      ? raw.brand
      : raw?.brandId && typeof raw.brandId === "object"
        ? raw.brandId
        : null;
  const categoryObj =
    raw?.category && typeof raw.category === "object"
      ? raw.category
      : raw?.categoryId && typeof raw.categoryId === "object"
        ? raw.categoryId
        : null;

  const id = normalizeId(raw?.id || raw?._id);

  return {
    ...raw,
    id,
    _id: id,
    vendorId: normalizeId(vendorObj?._id || vendorObj?.id || raw?.vendorId),
    vendorName: raw?.vendorName || vendorObj?.storeName || vendorObj?.name || "",
    brandId: normalizeId(brandObj?._id || brandObj?.id || raw?.brandId),
    brandName: raw?.brandName || brandObj?.name || "",
    categoryId: normalizeId(categoryObj?._id || categoryObj?.id || raw?.categoryId),
    categoryName: raw?.categoryName || categoryObj?.name || "",
    image: raw?.image || raw?.images?.[0] || "",
    images: Array.isArray(raw?.images)
      ? raw.images
      : raw?.image
        ? [raw.image]
        : [],
    price: Number(raw?.price) || 0,
    rating: Number(raw?.rating) || 0,
  };
};

const MobileCategories = () => {
  const navigate = useNavigate();
  const { categories, initialize, getCategoriesByParent, getRootCategories } =
    useCategoryStore();

  // Initialize store on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Get root categories (categories without parent) and merge with fallback.
  const rootCategories = useMemo(() => {
    const roots = getRootCategories().filter((cat) => cat.isActive !== false);
    if (roots.length === 0) {
      return fallbackCategories;
    }
    return roots.map((cat) => {
      const fallbackCat = fallbackCategories.find(
        (fc) =>
          normalizeId(fc.id) === normalizeId(cat.id) ||
          fc.name?.toLowerCase() === cat.name?.toLowerCase()
      );
      if (fallbackCat) {
        return {
          ...fallbackCat,
          ...cat,
          image: cat.image || fallbackCat.image,
        };
      }
      return cat;
    });
  }, [categories, getRootCategories]);

  // Prepend "All" virtual category to the top of root categories
  const rootCategoriesWithAll = useMemo(() => {
    return [ALL_CATEGORY, ...rootCategories];
  }, [rootCategories]);

  const [selectedCategoryId, setSelectedCategoryId] = useState("all");
  const categoryListRef = useRef(null);
  const activeCategoryRef = useRef(null);
  const filterButtonRef = useRef(null);
  const [isInitialMount, setIsInitialMount] = useState(true);
  const [selectedSubcategory, setSelectedSubcategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    minPrice: "",
    maxPrice: "",
    minRating: "",
  });
  const [categoryProductsFeed, setCategoryProductsFeed] = useState([]);

  // Get subcategories for selected category
  const subcategories = useMemo(() => {
    if (!selectedCategoryId || selectedCategoryId === "all") {
      // In "All" view, show main categories as quick filter chips
      return rootCategories.map((c) => ({
        id: c.id,
        name: c.name,
        image: c.image,
      }));
    }
    const subcats = getCategoriesByParent(selectedCategoryId);
    return subcats.filter((cat) => cat.isActive !== false);
  }, [selectedCategoryId, rootCategories, categories, getCategoriesByParent]);

  // Reset selected subcategory when category changes
  useEffect(() => {
    setSelectedSubcategory(null);
  }, [selectedCategoryId]);

  useEffect(() => {
    let cancelled = false;

    const fetchCategoryProducts = async () => {
      const isAll = selectedCategoryId === "all" && !selectedSubcategory;
      const targetCategoryId = isAll
        ? null
        : normalizeId(selectedSubcategory || selectedCategoryId);

      try {
        const params = {
          page: 1,
          limit: 200,
          sort: "newest",
        };
        if (targetCategoryId && targetCategoryId !== "all") {
          params.category = targetCategoryId;
        }

        const response = await api.get("/products", { params });
        const payload = response?.data ?? response;
        const products = Array.isArray(payload?.products) ? payload.products : [];
        if (cancelled) return;

        setCategoryProductsFeed(
          products.map(normalizeProduct).filter((product) => product.id)
        );
      } catch {
        if (cancelled) return;
        if (isAll) {
          setCategoryProductsFeed(getCatalogProducts());
        } else {
          const selectedId = normalizeId(selectedCategoryId);
          const selectedSubId = normalizeId(selectedSubcategory);
          const fallback = getCatalogProducts().filter((product) => {
            const productCategoryId = normalizeId(product.categoryId);
            const productCategory = categories.find(
              (cat) => normalizeId(cat.id) === productCategoryId
            );
            const productParentId = getParentId(productCategory);

            if (selectedSubId) return productCategoryId === selectedSubId;
            return productCategoryId === selectedId || productParentId === selectedId;
          });
          setCategoryProductsFeed(fallback);
        }
      }
    };

    fetchCategoryProducts();
    return () => {
      cancelled = true;
    };
  }, [selectedCategoryId, selectedSubcategory, categories]);

  // Filter products based on selected category, subcategory, search query, and filters
  const filteredProducts = useMemo(() => {
    let filtered = [...categoryProductsFeed];

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter((product) =>
        product.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by price range
    if (filters.minPrice) {
      filtered = filtered.filter(
        (product) => product.price >= parseFloat(filters.minPrice)
      );
    }
    if (filters.maxPrice) {
      filtered = filtered.filter(
        (product) => product.price <= parseFloat(filters.maxPrice)
      );
    }

    // Filter by minimum rating
    if (filters.minRating) {
      filtered = filtered.filter(
        (product) => product.rating >= parseFloat(filters.minRating)
      );
    }

    return filtered;
  }, [
    categoryProductsFeed,
    searchQuery,
    filters,
  ]);

  // Mark initial mount as complete after first render
  useEffect(() => {
    if (isInitialMount) {
      requestAnimationFrame(() => {
        setIsInitialMount(false);
      });
    }
  }, [isInitialMount]);

  // Scroll active category into view
  useEffect(() => {
    if (activeCategoryRef.current && categoryListRef.current) {
      const categoryElement = activeCategoryRef.current;
      const listContainer = categoryListRef.current;

      const elementTop = categoryElement.offsetTop;
      const elementHeight = categoryElement.offsetHeight;
      const containerHeight = listContainer.clientHeight;
      const scrollTop = listContainer.scrollTop;

      if (
        elementTop < scrollTop ||
        elementTop + elementHeight > scrollTop + containerHeight
      ) {
        requestAnimationFrame(() => {
          listContainer.scrollTo({
            top: elementTop - containerHeight / 2 + elementHeight / 2,
            behavior: "smooth",
          });
        });
      }
    }
  }, [selectedCategoryId]);

  const handleCategorySelect = (categoryId) => {
    setSelectedCategoryId(categoryId);
    setSelectedSubcategory(null);
    setShowFilters(false);
  };

  // Close filter dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
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

  const selectedCategory =
    rootCategoriesWithAll.find(
      (cat) => normalizeId(cat.id) === normalizeId(selectedCategoryId)
    ) || ALL_CATEGORY;

  const contentHeight = `calc(100vh - 56px)`;
  const headerSectionHeight = 54;

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={false}>
        <div
          className="w-full flex flex-col"
          style={{ minHeight: contentHeight }}>
          
          {/* Category Header - Fixed Search at top */}
          <div className="sticky top-0 z-40 bg-white border-b border-gray-200 px-4 py-3">
            <div className="relative">
              <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
              <input
                type="text"
                placeholder="Search fire safety products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-2 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 shadow-inner placeholder:text-gray-400"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                >
                  <FiX className="text-sm" />
                </button>
              )}
            </div>
          </div>

          {/* Main Content Area - Sidebar and Products */}
          <div
            className="flex flex-1"
            style={{
              minHeight: `calc(${contentHeight} - ${headerSectionHeight}px)`,
            }}>
            
            {/* Left Panel - Vertical Category Sidebar with "All" at the top */}
            <div
              ref={categoryListRef}
              className="w-20 md:w-24 bg-gray-50 border-r border-gray-200 overflow-y-auto scrollbar-hide flex-shrink-0"
              style={{
                height: `calc(${contentHeight} - ${headerSectionHeight}px)`,
              }}>
              <div className="pb-[190px]">
                {rootCategoriesWithAll.map((category) => {
                  const isActive =
                    normalizeId(category.id) === normalizeId(selectedCategoryId);
                  return (
                    <div
                      key={category.id}
                      ref={isActive ? activeCategoryRef : null}
                      style={{
                        willChange: isActive ? "transform" : "auto",
                        transform: "translateZ(0)",
                      }}>
                      <motion.button
                        onClick={() => handleCategorySelect(category.id)}
                        initial={isInitialMount ? { opacity: 0 } : false}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2 }}
                        whileTap={{ scale: 0.95 }}
                        className={`w-full px-2 py-2 text-left transition-all duration-200 relative ${
                          isActive ? "bg-white shadow-sm border-l-4 border-primary-600" : "hover:bg-gray-100"
                        }`}
                        style={{ willChange: "transform" }}>
                        <div className="flex flex-col items-center gap-1">
                          <div
                            className={`w-12 h-12 rounded-2xl overflow-hidden flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
                              isActive
                                ? "ring-2 ring-primary-500 ring-offset-1 scale-105"
                                : ""
                            } ${category.isAll ? "bg-red-50 text-primary-600" : "bg-gray-100"}`}
                            style={{
                              willChange: isActive ? "transform" : "auto",
                            }}>
                            {category.isAll ? (
                              <div className="flex flex-col items-center justify-center">
                                <FiLayers className="text-xl text-primary-600" />
                              </div>
                            ) : (
                              <LazyImage
                                src={category.image}
                                alt={category.name}
                                className="w-full h-full object-cover"
                                placeholderWidth={48}
                                placeholderHeight={48}
                                placeholderText={category.name}
                              />
                            )}
                          </div>
                          <span
                            className={`text-[11px] font-bold text-center leading-tight transition-colors ${
                              isActive ? "text-primary-600" : "text-gray-700"
                            }`}>
                            {category.name}
                          </span>
                        </div>
                      </motion.button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Panel - Products Grid */}
            <div
              className="flex-1 overflow-y-auto bg-white flex-shrink-0"
              style={{
                height: `calc(${contentHeight} - ${headerSectionHeight}px)`,
              }}>
              <div className="p-1 md:p-6">
                <AnimatedBanner showPadding={false} className="mb-2" />
                
                {/* Top Section Title */}
                <div className="flex items-center gap-4 mb-3 px-1">
                  <h2 className="text-xs sm:text-sm font-extrabold text-gray-800 uppercase tracking-wider">
                    {selectedCategory?.id === "all" ? "All Safety Equipment" : selectedCategory?.name}
                  </h2>
                  <div className="flex-1 border-t border-dotted border-gray-300"></div>
                  <span className="text-[11px] font-bold text-gray-400">
                    {filteredProducts.length} Items
                  </span>
                </div>

                {/* Subcategory / Filter Chips Bar */}
                {subcategories.length > 0 && (
                  <div 
                    className="flex items-center gap-2 overflow-x-auto py-2 px-1 mb-4 border-b border-gray-100 scrollbar-hide"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSubcategory(null);
                        if (selectedCategoryId !== "all") {
                          setSelectedCategoryId("all");
                        }
                      }}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-extrabold tracking-wider uppercase whitespace-nowrap transition-all duration-200 active:scale-95 border ${
                        selectedSubcategory === null && selectedCategoryId === "all"
                          ? "bg-primary-600 text-white border-primary-600 shadow-sm"
                          : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <FiLayers className="text-xs" />
                      <span>All</span>
                    </button>
                    {subcategories.map((sub) => {
                      const isSelected =
                        normalizeId(sub.id) === normalizeId(selectedSubcategory) ||
                        (selectedCategoryId === sub.id && selectedSubcategory === null);
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => {
                            if (selectedCategoryId === "all") {
                              setSelectedCategoryId(sub.id);
                            } else {
                              setSelectedSubcategory(sub.id);
                            }
                          }}
                          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wider whitespace-nowrap transition-all duration-200 active:scale-95 border ${
                            isSelected
                              ? "bg-primary-600 text-white border-primary-600 shadow-sm"
                              : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                          }`}
                        >
                          {sub.image && (
                            <div className="w-5 h-5 rounded-full overflow-hidden bg-gray-50 flex-shrink-0 border border-gray-200/60">
                              <LazyImage
                                src={sub.image}
                                alt={sub.name}
                                className="w-full h-full object-cover"
                                placeholderWidth={20}
                                placeholderHeight={20}
                                placeholderText={sub.name}
                              />
                            </div>
                          )}
                          <span>{sub.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Products Grid */}
                {filteredProducts.length === 0 ? (
                  <div key="empty" className="text-center py-12">
                    <div className="text-6xl text-gray-300 mx-auto mb-4">
                      📦
                    </div>
                    <h3 className="text-lg font-bold text-gray-800 mb-2">
                      No products found
                    </h3>
                    <p className="text-sm text-gray-600">
                      There are no products available in this category at the moment.
                    </p>
                  </div>
                ) : (
                  <motion.div
                    key={`products-${selectedCategoryId}-${selectedSubcategory || 'all'}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 p-1"
                    style={{
                      willChange: "opacity",
                      transform: "translateZ(0)",
                    }}>
                    {filteredProducts.map((product) => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default MobileCategories;
