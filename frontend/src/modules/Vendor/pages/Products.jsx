import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FiPackage,
  FiPlus,
  FiArrowRight,
  FiCheckCircle,
  FiAlertTriangle,
  FiLayers,
} from "react-icons/fi";
import { useVendorProductStore } from "../store/vendorProductStore";
import { useVendorAuthStore } from "../store/vendorAuthStore";
import { formatPrice } from "../../../shared/utils/helpers";

const Products = () => {
  const navigate = useNavigate();
  const { vendor } = useVendorAuthStore();
  const { products, total, isLoading, fetchProducts } = useVendorProductStore();

  const vendorId = vendor?.id || vendor?._id;

  useEffect(() => {
    if (vendorId && products.length === 0) {
      fetchProducts({ limit: 50 });
    }
  }, [vendorId, products.length, fetchProducts]);

  const inStockCount = useMemo(() => {
    return products.filter((p) => p.stock === "in_stock").length;
  }, [products]);

  const lowOrOutStockCount = useMemo(() => {
    return products.filter((p) => p.stock === "low_stock" || p.stock === "out_of_stock").length;
  }, [products]);

  const recentProducts = useMemo(() => products.slice(0, 4), [products]);

  const menuItems = [
    {
      path: "/vendor/products/manage-products",
      label: "Manage Products",
      icon: FiPackage,
      gradient: "from-blue-500 via-blue-600 to-blue-700",
      lightGradient: "from-blue-50 via-blue-100/80 to-blue-50",
      shadowColor: "shadow-blue-500/20",
      hoverShadow: "hover:shadow-blue-500/30",
      description: "View and manage your products",
    },
    {
      path: "/vendor/products/add-product",
      label: "Add Product",
      icon: FiPlus,
      gradient: "from-green-500 via-green-600 to-green-700",
      lightGradient: "from-green-50 via-green-100/80 to-green-50",
      shadowColor: "shadow-green-500/20",
      hoverShadow: "hover:shadow-green-500/30",
      description: "Create a new product",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 sm:space-y-6"
    >
      {/* Header */}
      <div className="px-1 flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900 mb-0.5 sm:mb-1.5">
            Products
          </h1>
          <p className="text-xs sm:text-base text-gray-500">
            Manage your product catalog
          </p>
        </div>

        {/* Mobile Quick Add Button */}
        <button
          onClick={() => navigate("/vendor/products/add-product")}
          className="sm:hidden flex items-center gap-1 bg-[#E31E24] hover:bg-[#c6151b] text-white text-xs font-bold px-3 py-2 rounded-xl shadow-sm active:scale-95 transition-all"
        >
          <FiPlus className="text-sm" /> Add Product
        </button>
      </div>

      {/* Mobile Catalog Stats Strip */}
      <div className="sm:hidden grid grid-cols-3 gap-2.5">
        <div 
          onClick={() => navigate("/vendor/products/manage-products")}
          className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs cursor-pointer active:scale-98 transition-transform"
        >
          <div className="flex items-center gap-1 text-slate-500 text-[10px] font-bold uppercase mb-1">
            <FiLayers className="text-xs text-blue-600" /> Total
          </div>
          <p className="text-lg font-black text-slate-900 leading-none">
            {isLoading ? "—" : total || products.length}
          </p>
          <p className="text-[9px] text-slate-400 mt-0.5 truncate">Catalog items</p>
        </div>

        <div 
          onClick={() => navigate("/vendor/products/manage-products")}
          className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs cursor-pointer active:scale-98 transition-transform"
        >
          <div className="flex items-center gap-1 text-slate-500 text-[10px] font-bold uppercase mb-1">
            <FiCheckCircle className="text-xs text-emerald-600" /> In Stock
          </div>
          <p className="text-lg font-black text-emerald-600 leading-none">
            {isLoading ? "—" : inStockCount}
          </p>
          <p className="text-[9px] text-slate-400 mt-0.5 truncate">Available live</p>
        </div>

        <div 
          onClick={() => navigate("/vendor/products/manage-products")}
          className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs cursor-pointer active:scale-98 transition-transform"
        >
          <div className="flex items-center gap-1 text-slate-500 text-[10px] font-bold uppercase mb-1">
            <FiAlertTriangle className="text-xs text-amber-500" /> Attention
          </div>
          <p className="text-lg font-black text-amber-600 leading-none">
            {isLoading ? "—" : lowOrOutStockCount}
          </p>
          <p className="text-[9px] text-slate-400 mt-0.5 truncate">Low / Out stock</p>
        </div>
      </div>

      {/* Grid Layout (Desktop & Mobile Primary Actions) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-4">
        {menuItems.map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.button
              key={item.path}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{
                delay: index * 0.05,
                type: "spring",
                stiffness: 200,
                damping: 20,
              }}
              onClick={() => navigate(item.path)}
              className="group relative overflow-hidden text-left sm:text-center"
            >
              <div
                className={`
                relative h-full
                flex flex-col items-center justify-center
                p-3.5 sm:p-6
                bg-white
                rounded-2xl sm:rounded-3xl
                border border-gray-100/80
                ${`bg-gradient-to-br ${item.lightGradient}`}
                ${item.shadowColor} ${item.hoverShadow}
                shadow-sm sm:shadow-lg hover:shadow-2xl
                transition-all duration-500 ease-out
                active:scale-[0.96]
                hover:border-transparent
                overflow-hidden
              `}
              >
                {/* Animated Background Gradient */}
                <div
                  className={`
                  absolute inset-0
                  bg-gradient-to-br ${item.gradient}
                  opacity-0 group-hover:opacity-10
                  transition-opacity duration-500
                `}
                />

                {/* Decorative Circles */}
                <div className="absolute -top-6 -right-6 sm:-top-8 sm:-right-8 w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-white/20 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="absolute -bottom-4 -left-4 sm:-bottom-6 sm:-left-6 w-12 h-12 sm:w-20 sm:h-20 rounded-full bg-white/10 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

                {/* Icon Container with Enhanced Design */}
                <div
                  className={`
                  relative z-10
                  w-11 h-11 sm:w-20 sm:h-20
                  rounded-xl sm:rounded-3xl
                  bg-gradient-to-br ${item.gradient}
                  flex items-center justify-center
                  mb-2 sm:mb-4
                  ${item.shadowColor}
                  shadow-md sm:shadow-xl group-hover:shadow-2xl
                  group-hover:scale-110 group-hover:rotate-3
                  transition-all duration-500 ease-out
                  before:absolute before:inset-0
                  before:bg-gradient-to-br before:from-white/20 before:to-transparent
                  before:rounded-xl sm:before:rounded-3xl
                `}
                >
                  <Icon
                    className="text-white text-lg sm:text-3xl relative z-10"
                    strokeWidth={2.5}
                  />

                  {/* Shine Effect */}
                  <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-transparent rounded-xl sm:rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                </div>

                {/* Content */}
                <div className="relative z-10 text-center space-y-0.5 sm:space-y-1">
                  <h3 className="text-xs sm:text-base font-bold text-gray-900 group-hover:text-gray-950 transition-colors duration-300 leading-tight">
                    {item.label}
                  </h3>
                  <p className="text-[10px] sm:text-xs text-gray-500 group-hover:text-gray-600 transition-colors duration-300 leading-tight">
                    {item.description}
                  </p>
                </div>

                {/* Bottom Accent Line */}
                <div
                  className={`
                  absolute bottom-0 left-0 right-0
                  h-0.5 sm:h-1
                  bg-gradient-to-r ${item.gradient}
                  transform scale-x-0 group-hover:scale-x-100
                  transition-transform duration-500 ease-out
                  origin-left
                `}
                />
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Mobile Catalog Preview Section */}
      <div className="sm:hidden space-y-3 pt-2">
        <div className="flex items-center justify-between px-1">
          <div>
            <h2 className="text-sm font-black text-slate-900 tracking-tight">Recent Products</h2>
            <p className="text-[11px] text-slate-500">Quick view of your catalog items</p>
          </div>
          <button
            onClick={() => navigate("/vendor/products/manage-products")}
            className="text-xs text-primary-600 font-bold flex items-center gap-1 hover:underline"
          >
            View All <FiArrowRight className="text-xs" />
          </button>
        </div>

        {isLoading ? (
          <div className="bg-white rounded-2xl p-6 text-center border border-slate-100 text-xs text-slate-400">
            Loading products...
          </div>
        ) : recentProducts.length > 0 ? (
          <div className="space-y-2">
            {recentProducts.map((product) => (
              <div
                key={product._id ?? product.id}
                onClick={() => navigate(`/vendor/products/${product._id ?? product.id}`)}
                className="bg-white p-3 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-3 cursor-pointer active:scale-98 transition-all"
              >
                <img
                  src={product.image || product.images?.[0]}
                  alt={product.name}
                  className="w-11 h-11 object-cover rounded-xl border border-slate-100 flex-shrink-0 bg-slate-50"
                  onError={(e) => {
                    e.target.src = "https://via.placeholder.com/44x44?text=P";
                  }}
                />
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-slate-900 text-xs truncate">
                    {product.name}
                  </h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-extrabold text-slate-900 text-xs">
                      {formatPrice(product.price || 0)}
                    </span>
                    {product.originalPrice && product.originalPrice > product.price && (
                      <span className="text-[10px] text-slate-400 line-through">
                        {formatPrice(product.originalPrice)}
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                    product.stock === "in_stock"
                      ? "bg-emerald-100 text-emerald-800"
                      : product.stock === "low_stock"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {product.stock === "in_stock"
                    ? "In Stock"
                    : product.stock === "low_stock"
                    ? "Low Stock"
                    : "Out of Stock"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-6 text-center border border-slate-100 space-y-2">
            <FiPackage className="text-2xl text-slate-300 mx-auto" />
            <p className="text-xs font-semibold text-slate-600">No products added yet</p>
            <button
              onClick={() => navigate("/vendor/products/add-product")}
              className="inline-flex items-center gap-1 bg-[#E31E24] text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-xs"
            >
              <FiPlus /> Add Your First Product
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default Products;
