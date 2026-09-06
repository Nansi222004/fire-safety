import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiHome,
  FiPackage,
  FiShoppingBag,
  FiBarChart2,
  FiDollarSign,
  FiSettings,
  FiUser,
  FiChevronDown,
  FiLayout,
  FiX,
  FiTrendingDown,
  FiCreditCard,
  FiMapPin,
  FiMessageCircle,
  FiRefreshCw,
  FiStar,
  FiFileText,
  FiTag,
  FiBell,
  FiTruck,
  FiUsers,
  FiMessageSquare,
  FiTrendingUp,
  FiFile,
  FiAward,
  FiLayers,
  FiTool,
  FiShield,
} from "react-icons/fi";
import { useVendorAuthStore } from "../../store/vendorAuthStore";
import vendorMenu from "../../config/vendorMenu.json";
import {
  getVendorCapabilities,
  filterVendorMenu,
  getGroupedVendorMenu,
} from "../../utils/vendorCapabilities";

// Icon mapping for menu items
const iconMap = {
  Dashboard: FiHome,
  Products: FiPackage,
  "Brand Requests": FiTag,
  "Category Requests": FiLayers,
  Services: FiTool,
  Orders: FiShoppingBag,
  "Returns & Exchanges": FiRefreshCw,
  "Product Reviews": FiStar,
  "Stock Management": FiTrendingDown,
  "Wallet History": FiCreditCard,
  "Pickup Locations": FiMapPin,
  Promotions: FiTag,
  Notifications: FiBell,
  Customers: FiUsers,
  "Support Tickets": FiMessageSquare,
  "Inventory Reports": FiBarChart2,
  "Performance Metrics": FiTrendingUp,
  Documents: FiFile,
  Analytics: FiBarChart2,
  Earnings: FiDollarSign,
  Settings: FiSettings,
  Profile: FiUser,
};

// Helper function to convert child name to route path
const getChildRoute = (parentRoute, childName) => {
  const routeMap = {
    "/vendor/products": {
      "Manage Products": "/vendor/products/manage-products",
      "Add Product": "/vendor/products/add-product",
    },
    "/vendor/services": {
      "Available Services": "/vendor/services/available",
      "My Services": "/vendor/services/my-services",
      "Service Bookings": "/vendor/services/service-bookings",
      "Request New Service": "/vendor/services/request-new",
      "My Requests": "/vendor/services/my-requests",
    },
    "/vendor/orders": {
      "All Orders": "/vendor/orders/all-orders",
      "Order Tracking": "/vendor/orders/order-tracking",
    },
    "/vendor/earnings": {
      "Earnings Overview": "/vendor/earnings/overview",
      "Commission History": "/vendor/earnings/commission-history",
      "Settlement History": "/vendor/earnings/settlement-history",
    },
    "/vendor/settings": {
      "Store Settings": "/vendor/settings/store",
      "Payment Settings": "/vendor/settings/payment",
    },
  };

  return routeMap[parentRoute]?.[childName] || parentRoute;
};

const VendorSidebar = ({ isOpen, onClose, isCollapsed }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { vendor } = useVendorAuthStore();
  const { sellsProducts, providesServices, isServiceOnly, isHybrid, badgeText } =
    getVendorCapabilities(vendor);
  const filteredMenu = filterVendorMenu(vendorMenu, vendor);
  const groupedMenu = getGroupedVendorMenu(filteredMenu, vendor);

  const [expandedItems, setExpandedItems] = useState({});
  const [isMobile, setIsMobile] = useState(false);

  const vendorId = vendor?.id || vendor?._id;

  // Reset expanded state whenever the logged-in vendor identity changes or logs out
  useEffect(() => {
    setExpandedItems({});
  }, [vendorId]);

  // For service-only vendors, auto-expand Services by default so the core service operations are front and center
  useEffect(() => {
    if (isServiceOnly) {
      setExpandedItems((prev) => ({
        ...prev,
        Services: true,
      }));
    }
  }, [isServiceOnly, vendorId]);

  // Ensure inactive capabilities cannot hold expanded state
  useEffect(() => {
    setExpandedItems((prev) => {
      const next = { ...prev };
      let changed = false;
      if (!sellsProducts && (next.Products || next.Orders)) {
        delete next.Products;
        delete next.Orders;
        changed = true;
      }
      if (!providesServices && next.Services) {
        delete next.Services;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [sellsProducts, providesServices]);

  // Check if mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Auto-close sidebar on mobile when route changes
  useEffect(() => {
    if (window.innerWidth < 1024) {
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Auto-expand menu items when their child route is active
  useEffect(() => {
    const activeItem = filteredMenu.find((item) => {
      if (item.route === "/vendor/dashboard") {
        return false;
      }
      const isChildRoute =
        location.pathname.startsWith(item.route) &&
        location.pathname !== item.route;
      return isChildRoute;
    });
    if (activeItem && activeItem.children && activeItem.children.length > 0) {
      setExpandedItems((prev) => {
        if (prev[activeItem.title]) {
          return prev;
        }
        return {
          ...prev,
          [activeItem.title]: true,
        };
      });
    }
  }, [location.pathname, filteredMenu]);

  // Check if a menu item is active
  const isActive = (route) => {
    if (route === "/vendor/dashboard") {
      return location.pathname === "/vendor/dashboard";
    }
    return location.pathname.startsWith(route);
  };

  // Toggle expanded state for menu items with children (without aggressive collapse of siblings)
  const toggleExpand = (title) => {
    setExpandedItems((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  // Handle menu item click
  const handleMenuItemClick = (route, parentTitle = null) => {
    if (parentTitle) {
      setExpandedItems((prev) => ({
        ...prev,
        [parentTitle]: true,
      }));
    }
    navigate(route);
    if (window.innerWidth < 1024) {
      onClose();
    }
  };

  // Render a single menu item
  const renderMenuItem = (item) => {
    const Icon = iconMap[item.title] || FiPackage;
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems[item.title];
    const active = isActive(item.route);

    // Distinguish between a leaf item active state vs accordion parent active state
    const isLeafActive = active && !hasChildren;
    const isParentActive = active && hasChildren;
    const isServiceItem = item.title === "Services";

    return (
      <div key={item.route} className="mb-0.5">
        {/* Main Menu Item */}
        <div
          className={`
            group flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all duration-150 cursor-pointer select-none
            ${
              isLeafActive
                ? isServiceOnly
                  ? "bg-gradient-to-r from-orange-500/25 to-amber-500/10 text-white font-bold border-l-4 border-orange-500 shadow-sm shadow-orange-950/20"
                  : "bg-gradient-to-r from-primary-500/25 to-red-500/10 text-white font-bold border-l-4 border-primary-500 shadow-sm shadow-red-950/20"
                : isParentActive
                ? "bg-slate-700/60 text-white font-semibold"
                : "text-slate-300 hover:text-white hover:bg-slate-700/40 font-medium"
            }
          `}
          onClick={() => {
            if (hasChildren) {
              toggleExpand(item.title);
            } else {
              handleMenuItemClick(item.route);
            }
          }}>
          <div
            className={`p-1 rounded-lg transition-colors ${
              isLeafActive
                ? isServiceOnly
                  ? "text-orange-400"
                  : "text-primary-400"
                : isServiceItem && isServiceOnly
                ? "text-orange-400"
                : "text-slate-400 group-hover:text-slate-200"
            }`}>
            <Icon className="text-lg flex-shrink-0" />
          </div>

          <span className="flex-1 text-sm tracking-tight truncate">
            {item.title}
          </span>

          {/* Service badge tag on Services menu item for Service Partner */}
          {isServiceItem && isServiceOnly && (
            <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30 uppercase tracking-wide mr-1">
              Core
            </span>
          )}

          {hasChildren && (
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="text-slate-400 group-hover:text-slate-200">
              <FiChevronDown className="text-sm" />
            </motion.div>
          )}
        </div>

        {/* Children Submenu */}
        <AnimatePresence initial={false}>
          {hasChildren && isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="overflow-hidden">
              <div className="ml-4 pl-3.5 my-1 border-l-2 border-slate-700/70 space-y-1">
                {item.children.map((child, index) => {
                  const childRoute = getChildRoute(item.route, child);
                  const isChildActive =
                    location.pathname === childRoute ||
                    (childRoute !== item.route &&
                      location.pathname.startsWith(childRoute));

                  return (
                    <div
                      key={index}
                      onClick={() =>
                        handleMenuItemClick(childRoute, item.title)
                      }
                      className={`
                        flex items-center gap-2.5 px-3 py-1.5 text-xs rounded-xl transition-all duration-150 cursor-pointer select-none
                        ${
                          isChildActive
                            ? isServiceOnly
                              ? "bg-orange-500/20 text-orange-200 font-bold border-l-2 border-orange-400 shadow-xs"
                              : "bg-primary-500/20 text-red-200 font-bold border-l-2 border-primary-400 shadow-xs"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/40 font-medium"
                        }
                      `}>
                      <span
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors ${
                          isChildActive
                            ? isServiceOnly
                              ? "bg-orange-400 shadow-xs shadow-orange-400/50"
                              : "bg-primary-400 shadow-xs shadow-primary-400/50"
                            : "bg-slate-600"
                        }`}
                      />
                      <span className="truncate">{child}</span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  // Sidebar content
  const sidebarContent = (
    <div className="h-full flex flex-col bg-slate-800 shadow-xl select-none overflow-hidden">
      {/* Header Section */}
      <div className="p-3.5 border-b border-slate-700/80 bg-slate-900/95 flex-shrink-0">
        <div className="flex items-center justify-between gap-2.5">
          {/* Vendor User Info */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg ring-1 ring-white/10 ${
                isServiceOnly
                  ? "bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-orange-500/20"
                  : isHybrid
                  ? "bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-purple-500/20"
                  : "bg-gradient-to-br from-red-500 to-primary-700 text-white shadow-red-500/20"
              }`}>
              {isServiceOnly ? (
                <FiTool className="text-lg" />
              ) : isHybrid ? (
                <FiLayers className="text-lg" />
              ) : (
                <FiShoppingBag className="text-lg" />
              )}
            </div>
            <div className="flex-1 min-w-0 pr-1">
              <h2
                className="font-bold text-white text-xs sm:text-sm tracking-tight truncate leading-snug"
                title={vendor?.storeName || vendor?.name || "Vendor Store"}>
                {vendor?.storeName || vendor?.name || "Vendor Store"}
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold tracking-wider uppercase border shadow-xs ${
                    isServiceOnly
                      ? "bg-amber-950/60 border-amber-500/30 text-amber-300"
                      : isHybrid
                      ? "bg-purple-950/60 border-purple-500/30 text-purple-300"
                      : "bg-emerald-950/60 border-emerald-500/30 text-emerald-300"
                  }`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse flex-shrink-0" />
                  <span className="truncate">{badgeText}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Close Button - Mobile Only */}
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0 lg:hidden text-gray-300 hover:text-white"
            aria-label="Close sidebar">
            <FiX className="text-lg" />
          </button>
        </div>
      </div>

      {/* Navigation Menu with Streamlined Category Sections */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden p-2.5 space-y-2 scrollbar-vendor-dark">
        {groupedMenu.map((group) => (
          <div key={group.title} className="space-y-0.5">
            {/* Divider and section header for secondary Management & Tools */}
            {group.title === "MANAGEMENT & TOOLS" && (
              <div className="pt-2.5 pb-1 px-2.5 flex items-center gap-2">
                <span className="text-[10px] font-bold tracking-wider text-slate-400/80 uppercase">
                  Management & Tools
                </span>
                <div className="flex-1 h-px bg-slate-700/60" />
              </div>
            )}

            {/* Section Items */}
            <div className="space-y-0.5">
              {group.items.map((item) => renderMenuItem(item))}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );

  return (
    <>
      {/* Mobile: Overlay Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-[9998] lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar - Mobile Drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed left-0 top-0 bottom-0 w-64 z-[10000] lg:hidden">
            {sidebarContent}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar - Desktop Fixed */}
      <div
        className={`hidden lg:flex fixed left-0 top-0 bottom-0 w-64 z-20 transition-transform duration-300 ${
          isCollapsed ? "-translate-x-full" : "translate-x-0"
        }`}>
        {sidebarContent}
      </div>
    </>
  );
};

export default VendorSidebar;
