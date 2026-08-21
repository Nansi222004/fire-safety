import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FiShield,
  FiRotateCw,
  FiSearch,
  FiCalendar,
  FiCheck,
  FiArrowRight,
  FiLayers,
  FiTool,
} from "react-icons/fi";
import MobileLayout from "../components/Layout/MobileLayout";
import PageTransition from "../../../shared/components/PageTransition";
import { getServiceCatalog } from "../services/customerServiceApi";

const ServicesPage = () => {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchCatalog = async () => {
    setIsLoading(true);
    try {
      const params = {};
      if (selectedCategory !== "all") params.categoryId = selectedCategory;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await getServiceCatalog(params);
      const data = res?.data ?? res ?? {};
      setCategories(data.categories || []);
      setServices(data.services || []);
    } catch (err) {
      console.error("Failed to load service catalog:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, [selectedCategory, searchQuery]);

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={false} showHeader={true}>
        <div className="min-h-[calc(100vh-60px)] bg-[#F8FAFC] text-slate-900 font-sans pb-20">
          <div className="max-w-5xl mx-auto px-4 py-4 sm:py-6 space-y-6">
            
            {/* 1. HERO BANNER */}
            <section className="bg-[#0F172A] text-white rounded-2xl md:rounded-3xl p-5 sm:p-7 md:p-8 relative overflow-hidden shadow-lg border border-slate-800">
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#E31E24]/15 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#E31E24]/10 rounded-full blur-2xl pointer-events-none" />

              <div className="max-w-xl space-y-3 relative z-10">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-500/20 border border-red-500/30 rounded-full text-red-400 text-[11px] font-bold uppercase tracking-wider">
                  <FiShield className="text-xs" />
                  <span>CERTIFIED FIRE SAFETY SERVICES</span>
                </div>

                <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white leading-tight tracking-tight">
                  Professional Fire Safety. <br className="hidden sm:block" />
                  On-Demand at Your Doorstep.
                </h1>

                <p className="text-slate-300 text-xs sm:text-sm leading-relaxed max-w-lg">
                  Book certified fire extinguisher refilling, annual maintenance (AMC), inspections, and safety installations from verified vendors.
                </p>

                <div className="pt-2 flex flex-wrap gap-3">
                  <div className="relative flex-1 min-w-[240px]">
                    <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search for refilling, inspection, AMC..."
                      className="w-full pl-9 pr-4 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none focus:border-[#E31E24]"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* 2. CATEGORIES FILTER TABS */}
            {categories.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                <button
                  onClick={() => setSelectedCategory("all")}
                  className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    selectedCategory === "all"
                      ? "bg-slate-900 text-white shadow-sm"
                      : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                  }`}
                >
                  All Services
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat._id || cat.id}
                    onClick={() => setSelectedCategory(cat._id || cat.id)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      selectedCategory === (cat._id || cat.id)
                        ? "bg-[#E31E24] text-white shadow-sm"
                        : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                    }`}
                  >
                    <FiLayers className="text-xs" />
                    <span>{cat.name}</span>
                  </button>
                ))}
              </div>
            )}

            {/* 3. SERVICES CATALOG GRID */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                    Available Fire Safety Services
                  </h2>
                  <p className="text-xs text-slate-500">
                    Select a service to check pincode availability and book a certified technician.
                  </p>
                </div>
              </div>

              {isLoading ? (
                <div className="text-center py-16">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#E31E24] border-t-transparent mb-3"></div>
                  <p className="text-slate-500 text-xs font-medium">Loading fire safety services...</p>
                </div>
              ) : services.length === 0 ? (
                <div className="text-center py-16 px-4 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
                  <FiTool className="mx-auto text-4xl text-slate-300" />
                  <h3 className="text-base font-bold text-slate-800">No services found</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    We couldn't find any services matching your search or category filter.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
                  {services.map((service) => (
                    <motion.div
                      key={service._id || service.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md hover:border-slate-300 transition-all flex flex-col justify-between"
                    >
                      <div>
                        {/* Header */}
                        <div className="flex items-center justify-between gap-2 mb-3">
                          {service.image ? (
                            <img
                              src={service.image}
                              alt={service.name}
                              className="w-10 h-10 object-cover rounded-xl border border-slate-200"
                            />
                          ) : (
                            <div className="w-10 h-10 bg-red-50 text-[#E31E24] rounded-xl flex items-center justify-center font-bold text-base border border-red-100">
                              <FiTool />
                            </div>
                          )}
                          <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold rounded-full uppercase">
                            {service.categoryId?.name || "Fire Safety"}
                          </span>
                        </div>

                        <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug mb-1.5">
                          {service.name}
                        </h3>

                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed mb-4">
                          {service.shortDescription || service.description || "Certified service provided by verified marketplace vendors."}
                        </p>
                      </div>

                      <div className="pt-3 border-t border-slate-100 space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">Pricing:</span>
                          <span className="font-bold text-slate-900 uppercase">{service.pricingType || "FIXED"}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => navigate(`/services/${service.slug || service._id}`)}
                          className="w-full py-2.5 bg-[#E31E24] hover:bg-[#c6151b] text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 shadow-sm shadow-[#E31E24]/20 active:scale-98"
                        >
                          <span>Check Pincode & Book</span>
                          <FiArrowRight className="text-xs" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default ServicesPage;
