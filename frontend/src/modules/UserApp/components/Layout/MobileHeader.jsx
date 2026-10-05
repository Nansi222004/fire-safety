import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  FiShoppingBag,
  FiHeart,
  FiBell,
  FiMenu,
} from "react-icons/fi";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useCartStore, useUIStore } from "../../../../shared/store/useStore";
import { useWishlistStore } from "../../../../shared/store/wishlistStore";
import { useUserNotificationStore } from "../../store/userNotificationStore";
import { useAuthStore } from "../../../../shared/store/authStore";
import { appLogo } from "../../../../data/logos";
import { motion, useReducedMotion } from "framer-motion";
import SearchBar from "../../../../shared/components/SearchBar";
import MobileCategoryIcons from "../Mobile/MobileCategoryIcons";
import MobileSidebar from "./MobileSidebar";

// Category gradient mapping - Subtle Fire Safety tones
const categoryGradients = {
  1: "from-red-50 via-rose-50 to-red-100", // ABC Extinguishers - Red
  2: "from-amber-50 via-amber-100 to-yellow-50", // CO2 Extinguishers - Amber
  3: "from-orange-50 via-orange-100 to-orange-50", // Foam - Orange
  4: "from-green-50 via-emerald-50 to-teal-50", // Water - Green
  5: "from-red-50 via-rose-50 to-red-100", // Fire Blankets - Red
  6: "from-blue-50 via-cyan-50 to-teal-50", // Accessories - Blue
};

const MobileHeader = ({ onSearch }) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showCartAnimation, setShowCartAnimation] = useState(false);
  const [positionsReady, setPositionsReady] = useState(false);
  const [animationPositions, setAnimationPositions] = useState({
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
  });
  const [isTopRowVisible, setIsTopRowVisible] = useState(true);
  const [topRowHeight, setTopRowHeight] = useState(70);
  const lastScrollYRef = useRef(0);
  const topRowRef = useRef(null);
  const headerContentRef = useRef(null);
  const userMenuRef = useRef(null);
  const logoRef = useRef(null);
  const cartRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  const itemCount = useCartStore((state) => state.getItemCount());
  const wishlistCount = useWishlistStore((state) => state.getItemCount());
  const ensureWishlist = useWishlistStore((state) => state.ensureHydrated);
  const unreadCount = useUserNotificationStore((state) => state.unreadCount);
  const ensureNotifications = useUserNotificationStore(
    (state) => state.ensureHydrated
  );
  const toggleCart = useUIStore((state) => state.toggleCart);
  const cartAnimationTrigger = useUIStore(
    (state) => state.cartAnimationTrigger
  );
  const shouldReduceMotion = useReducedMotion();
  const { user, isAuthenticated, logout } = useAuthStore();

  // Header micro-interaction trigger states
  const [cartBouncing, setCartBouncing] = useState(false);
  const [wishlistPopping, setWishlistPopping] = useState(false);
  const [bellWiggling, setBellWiggling] = useState(false);
  const prevItemCountRef = useRef(itemCount);
  const prevWishlistRef = useRef(wishlistCount);
  const prevUnreadRef = useRef(unreadCount);
  const previousCartTriggerRef = useRef(cartAnimationTrigger);

  // Cart bounce on trigger or count increase
  useEffect(() => {
    const increased = itemCount > prevItemCountRef.current;
    const explicitlyTriggered = cartAnimationTrigger > previousCartTriggerRef.current;
    prevItemCountRef.current = itemCount;
    previousCartTriggerRef.current = cartAnimationTrigger;
    if (explicitlyTriggered || increased) {
      setCartBouncing(true);
      const timer = setTimeout(() => setCartBouncing(false), 550);
      return () => clearTimeout(timer);
    }
  }, [cartAnimationTrigger, itemCount]);

  // Wishlist pop on count increase
  useEffect(() => {
    const increased = wishlistCount > prevWishlistRef.current;
    prevWishlistRef.current = wishlistCount;
    if (increased) {
      setWishlistPopping(true);
      const timer = setTimeout(() => setWishlistPopping(false), 500);
      return () => clearTimeout(timer);
    }
  }, [wishlistCount]);

  // Bell wiggle on unread increase
  useEffect(() => {
    const increased = unreadCount > prevUnreadRef.current;
    prevUnreadRef.current = unreadCount;
    if (increased) {
      setBellWiggling(true);
      const timer = setTimeout(() => setBellWiggling(false), 650);
      return () => clearTimeout(timer);
    }
  }, [unreadCount]);

  useEffect(() => {
    if (isAuthenticated) {
      ensureWishlist();
      ensureNotifications();
    }
  }, [ensureWishlist, ensureNotifications, isAuthenticated]);

  // Get current category from URL (supports both /category/:id and legacy /app/category/:id)
  const getCurrentCategoryId = () => {
    const match = location.pathname.match(/\/(?:app\/)?category\/([^/]+)/);
    return match ? String(match[1]) : null;
  };

  const currentCategoryId = getCurrentCategoryId();

  // Get current page from location
  const getCurrentPage = () => {
    const path = location.pathname;
    if (path === "/" || path === "/home") return "home";
    if (path.startsWith("/product/")) return "product";
    if (path.startsWith("/category/")) return "category";
    if (path === "/search") return "search";
    if (path === "/wishlist") return "wishlist";
    if (path === "/profile") return "profile";
    if (path === "/orders") return "orders";
    if (path.startsWith("/orders/")) return "orderDetail";
    if (path === "/checkout") return "checkout";
    if (path === "/offers") return "offers";
    if (path === "/daily-deals") return "dailyDeals";
    if (path === "/flash-sale") return "flashSale";
    if (path.startsWith("/seller/")) return "vendor";
    return "default";
  };

  const currentPage = getCurrentPage();

  // Memoize gradient background style to prevent unnecessary re-renders
  const headerBackground = useMemo(() => {
    // Category pages - Fire Safety category-specific subtle gradients
    if (currentCategoryId) {
      const gradientMap = {
        1: "linear-gradient(to bottom, rgb(254, 226, 226) 0%, rgb(254, 242, 242) 50%, rgb(255, 255, 255) 100%)", // Red - ABC
        2: "linear-gradient(to bottom, rgb(254, 243, 199) 0%, rgb(255, 248, 220) 50%, rgb(255, 255, 255) 100%)", // Amber - CO2
        3: "linear-gradient(to bottom, rgb(255, 237, 213) 0%, rgb(255, 245, 230) 50%, rgb(255, 255, 255) 100%)", // Orange - Foam
        4: "linear-gradient(to bottom, rgb(209, 250, 229) 0%, rgb(236, 253, 245) 50%, rgb(255, 255, 255) 100%)", // Green - Water
        5: "linear-gradient(to bottom, rgb(254, 226, 226) 0%, rgb(254, 242, 242) 50%, rgb(255, 255, 255) 100%)", // Red - Blankets
        6: "linear-gradient(to bottom, rgb(219, 234, 254) 0%, rgb(239, 246, 255) 50%, rgb(255, 255, 255) 100%)", // Blue - Accessories
      };
      return (
        gradientMap[currentCategoryId] ||
        "linear-gradient(to bottom, #FEE2E2 0%, #FEF2F2 50%, #FFFFFF 100%)"
      );
    }

    // Page-specific gradients
    const pageGradients = {
      home: "linear-gradient(to bottom, rgb(254, 226, 226) 0%, rgb(254, 242, 242) 30%, rgb(255, 255, 255) 100%)", // Fire Red subtle header tint
      product:
        "linear-gradient(to bottom, rgb(254, 226, 226) 0%, rgb(255, 245, 245) 50%, rgb(255, 255, 255) 100%)", // Light red
      search:
        "linear-gradient(to bottom, rgb(249, 115, 22) 0%, rgb(251, 146, 60) 30%, rgb(255, 237, 213) 60%, rgb(255, 255, 255) 100%)", // Safety Orange
      wishlist:
        "linear-gradient(to bottom, rgb(239, 68, 68) 0%, rgb(248, 113, 113) 30%, rgb(254, 226, 226) 60%, rgb(255, 255, 255) 100%)", // Fire Red
      profile:
        "linear-gradient(to bottom, rgb(254, 226, 226) 0%, rgb(254, 242, 242) 30%, rgb(255, 255, 255) 100%)", // Fire Red subtle header tint
      orders:
        "linear-gradient(to bottom, rgb(254, 226, 226) 0%, rgb(254, 242, 242) 30%, rgb(255, 255, 255) 100%)", // Fire Red subtle header tint
      orderDetail:
        "linear-gradient(to bottom, rgb(254, 226, 226) 0%, rgb(254, 242, 242) 30%, rgb(255, 255, 255) 100%)", // Fire Red subtle header tint
      checkout:
        "linear-gradient(to bottom, rgb(239, 68, 68) 0%, rgb(248, 113, 113) 30%, rgb(254, 226, 226) 60%, rgb(255, 255, 255) 100%)", // Fire Red
      offers:
        "linear-gradient(to bottom, rgb(249, 115, 22) 0%, rgb(251, 146, 60) 30%, rgb(255, 237, 213) 60%, rgb(255, 255, 255) 100%)", // Safety Orange
      dailyDeals:
        "linear-gradient(to bottom, rgb(239, 68, 68) 0%, rgb(248, 113, 113) 30%, rgb(254, 226, 226) 60%, rgb(255, 255, 255) 100%)", // Fire Red
      flashSale:
        "linear-gradient(to bottom, rgb(239, 68, 68) 0%, rgb(248, 113, 113) 30%, rgb(254, 226, 226) 60%, rgb(255, 255, 255) 100%)", // Fire Red
      vendor:
        "linear-gradient(to bottom, rgb(254, 226, 226) 0%, rgb(255, 245, 245) 50%, rgb(255, 255, 255) 100%)", // Light Red
      default:
        "linear-gradient(to bottom, rgb(254, 226, 226) 0%, rgb(255, 245, 245) 50%, rgb(255, 255, 255) 100%)", // Light Red default
    };

    return pageGradients[currentPage] || pageGradients.default;
  }, [currentCategoryId, currentPage, location.pathname]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Measure header height for scroll hiding
  useEffect(() => {
    const measureHeader = () => {
      if (headerContentRef.current) {
        setTopRowHeight(headerContentRef.current.offsetHeight);
      } else if (topRowRef.current) {
        setTopRowHeight(topRowRef.current.offsetHeight);
      }
    };

    measureHeader();
    window.addEventListener("resize", measureHeader);
    // Recalculate after a short delay to account for conditional rendering
    const timer = setTimeout(measureHeader, 100);
    return () => {
      window.removeEventListener("resize", measureHeader);
      clearTimeout(timer);
    };
  }, [currentPage]);

  // Handle scroll to hide/show top row with smooth throttling
  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;
          const lastScrollY = lastScrollYRef.current;

          // Show top row when at top or scrolling up
          if (currentScrollY < 10) {
            setIsTopRowVisible(true);
          } else if (currentScrollY < lastScrollY) {
            // Scrolling up - show top row
            setIsTopRowVisible(true);
          } else if (currentScrollY > lastScrollY && currentScrollY > 50) {
            // Scrolling down and past threshold - hide top row
            setIsTopRowVisible(false);
          }

          lastScrollYRef.current = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Hydrate notifications on mount if authenticated
  useEffect(() => {
    if (isAuthenticated) {
      ensureNotifications();
    }
  }, [isAuthenticated, ensureNotifications]);

  // Fly-to-cart feedback is tied to an actual add-to-cart trigger, never page load.
  useEffect(() => {
    if (shouldReduceMotion || cartAnimationTrigger <= 0) return undefined;
    const calculatePositions = () => {
      if (logoRef.current && cartRef.current) {
        const logoRect = logoRef.current.getBoundingClientRect();
        const cartRect = cartRef.current.getBoundingClientRect();

        const positions = {
          startX: logoRect.left + logoRect.width / 2,
          startY: logoRect.top + logoRect.height / 2,
          endX: cartRect.left + cartRect.width / 2,
          endY: cartRect.top + cartRect.height / 2,
        };

        if (
          positions.startX > 0 &&
          positions.endX > 0 &&
          positions.startY > 0 &&
          positions.endY > 0
        ) {
          setAnimationPositions(positions);
          setPositionsReady(true);
          setShowCartAnimation(true);
        }
      }
    };
    const frame = window.requestAnimationFrame(calculatePositions);

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [cartAnimationTrigger, shouldReduceMotion]);

  const handleLogout = () => {
    logout();
    setShowUserMenu(false);
    navigate("/");
  };

  // Animation content - straight line movement only, starting from behind logo
  const shouldShowAnimation =
    showCartAnimation &&
    positionsReady &&
    animationPositions.startX > 0 &&
    animationPositions.endX > 0;

  const animationContent = shouldShowAnimation ? (
    <motion.div
      key={cartAnimationTrigger}
      className="fixed pointer-events-none"
      style={{
        left: 0,
        top: 0,
        zIndex: 10000, // Above navbar but will be behind logo due to stacking context
        willChange: "transform, opacity",
        transform: "translateZ(0)",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
      }}
      initial={{
        x: animationPositions.startX - 24,
        y: animationPositions.startY - 24,
        scale: 0.8,
        opacity: 0,
      }}
      animate={{
        x: animationPositions.endX - 24,
        y: animationPositions.endY - 24,
        scale: [0.8, 1, 1.05, 0.95],
        opacity: [0, 1, 1, 0.8, 0],
      }}
      transition={{
        duration: 0.7,
        ease: [0.25, 0.1, 0.25, 1],
        times: [0, 0.15, 0.65, 0.88, 1],
        type: "tween",
      }}
      onAnimationComplete={() => {
        setShowCartAnimation(false);
      }}>
      <div className="w-10 h-10 flex items-center justify-center rounded-full bg-primary-600 text-white shadow-lg">
        <FiShoppingBag className="text-lg" />
      </div>
    </motion.div>
  ) : null;

  const headerContent = (
    <motion.header
      key="mobile-header" // Stable key to prevent re-mounting
      className="fixed top-0 left-0 right-0 z-[9999] shadow-lg overflow-visible md:hidden"
      style={{
        background: headerBackground,
        transition: "background 0.5s ease-in-out",
      }}
      initial={shouldReduceMotion ? false : { opacity: 0, y: -10 }}
      animate={{
        opacity: 1,
        y: isTopRowVisible ? 0 : -(topRowHeight + 12),
      }}
      transition={{
        type: shouldReduceMotion ? "tween" : "spring",
        duration: shouldReduceMotion ? 0 : undefined,
        stiffness: 300,
        damping: 30,
        mass: 0.8,
      }}>
      <div ref={headerContentRef} className="px-4 pt-4 pb-1.5 overflow-visible">
        {/* First Row: Logo and Actions */}
        <motion.div
          ref={topRowRef}
          className="flex items-center justify-between gap-3 mb-1.5"
          initial={false}
          animate={{
            opacity: isTopRowVisible ? 1 : 0,
          }}
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 35,
            mass: 0.6,
          }}
          style={{
            pointerEvents: isTopRowVisible ? "auto" : "none",
          }}>
          {/* Menu and Logo */}
          <div className="flex items-center gap-2 flex-shrink-0 overflow-visible relative z-[10001]">
            {/* Hamburger Menu */}
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 -ml-2 hover:bg-white/50 active:bg-white/70 rounded-full transition-colors duration-200"
              aria-label="Open Navigation Menu"
            >
              <FiMenu className="text-2xl text-gray-700" />
            </motion.button>

            <Link
              to="/home"
              className="flex items-center overflow-visible relative z-[10002]">
              <div
                ref={logoRef}
                className="overflow-visible relative z-[10003]">
                {appLogo.src ? (
                  <img
                    src={appLogo.src}
                    alt={appLogo.alt}
                    className="h-10 sm:h-12 w-auto object-contain origin-left relative z-[10004]"
                    onError={(e) => {
                      // Hide image if logo doesn't exist
                      e.target.style.display = "none";
                      // Show text fallback
                      const parent = e.target.parentElement;
                      if (
                        parent &&
                        !parent.querySelector(".logo-text-fallback")
                      ) {
                        const fallback = document.createElement("span");
                        fallback.className =
                          "logo-text-fallback text-primary-600 font-bold text-xs sm:text-base truncate max-w-[130px] sm:max-w-none";
                        fallback.textContent = "Fire Safety Shop";
                        parent.appendChild(fallback);
                      }
                    }}
                  />
                ) : (
                  <span className="logo-text-fallback text-primary-600 font-bold text-xs sm:text-base truncate max-w-[130px] sm:max-w-none">
                    Fire Safety Shop
                  </span>
                )}
              </div>
            </Link>
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Wishlist Button */}
            <motion.div whileTap={{ scale: 0.9 }}>
              <Link
                to="/wishlist"
                className="relative p-2.5 hover:bg-white/50 rounded-full transition-all duration-300 block"
                title="Wishlist"
              >
                <FiHeart className={`text-xl text-gray-700 transition-all duration-200 ${wishlistPopping ? 'animate-heart-pop text-red-500' : ''}`} />
                {wishlistCount > 0 && (
                  <motion.span
                    key={wishlistCount}
                    initial={{ scale: 0.7 }}
                    animate={{ scale: [0.7, 1.25, 1] }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-sm"
                    style={{ backgroundColor: "#E31E24" }}
                  >
                    {wishlistCount > 9 ? "9+" : wishlistCount}
                  </motion.span>
                )}
              </Link>
            </motion.div>

            {/* Cart Button */}
            <motion.button
              ref={cartRef}
              data-cart-icon
              onClick={toggleCart}
              whileTap={{ scale: 0.9 }}
              className="relative p-2.5 hover:bg-white/50 rounded-full transition-all duration-300 focus:outline-none"
              animate={
                cartBouncing
                  ? {
                      scale: [1, 0.85, 1.25, 0.95, 1],
                    }
                  : {}
              }
              transition={{ duration: 0.5, ease: "easeOut" }}
              title="Shopping Cart"
            >
              <FiShoppingBag className={`text-xl text-gray-700 transition-colors ${cartBouncing ? 'text-primary-600' : ''}`} />
              {itemCount > 0 && (
                <motion.span
                  key={itemCount}
                  initial={{ scale: 0.7 }}
                  animate={{ scale: [0.7, 1.25, 1] }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-sm"
                  style={{ backgroundColor: "#E31E24" }}>
                  {itemCount > 9 ? "9+" : itemCount}
                </motion.span>
              )}
            </motion.button>

            {/* Notification Button */}
            <motion.div whileTap={{ scale: 0.9 }}>
              <Link
                to="/notifications"
                className="relative p-2.5 hover:bg-white/50 rounded-full transition-all duration-300 block"
                title="Notifications"
              >
                <FiBell className={`text-xl text-gray-700 transition-all duration-200 ${bellWiggling ? 'animate-bell-wiggle text-red-500' : ''}`} />
                {unreadCount > 0 && (
                  <motion.span
                    key={unreadCount}
                    initial={{ scale: 0.7 }}
                    animate={{ scale: [0.7, 1.2, 1] }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-sm"
                    style={{ backgroundColor: "#E31E24" }}
                  >
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </motion.span>
                )}
              </Link>
            </motion.div>
          </div>
        </motion.div>

        {/* Search Bar Row - Added only for the home page in mobile view */}
        {currentPage === "home" && (
          <motion.div
            initial={false}
            animate={{
              opacity: isTopRowVisible ? 1 : 0,
              y: isTopRowVisible ? 0 : -10,
            }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 35,
              mass: 0.6,
            }}
            className="mb-1"
            style={{
              pointerEvents: isTopRowVisible ? "auto" : "none",
            }}>
            <SearchBar onSearch={onSearch} />
          </motion.div>
        )}
      </div>
    </motion.header>
  );

  // Use portal to render outside of transformed containers (like PageTransition)
  return (
    <>
      {typeof document !== "undefined" &&
        createPortal(headerContent, document.body)}
      {typeof document !== "undefined" &&
        createPortal(
          <MobileSidebar
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
          />,
          document.body
        )}
    </>
  );
};

export default MobileHeader;
