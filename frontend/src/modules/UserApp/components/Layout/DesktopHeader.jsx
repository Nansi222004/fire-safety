import { Link, useNavigate, useLocation } from "react-router-dom";
import { useCartStore, useUIStore } from "../../../../shared/store/useStore";
import { useWishlistStore } from "../../../../shared/store/wishlistStore";
import { useAuthStore } from "../../../../shared/store/authStore";
import { useCategoryStore } from "../../../../shared/store/categoryStore";
import { appLogo } from "../../../../data/logos";
import api from "../../../../shared/utils/api";
import { formatPrice } from "../../../../shared/utils/helpers";
import useSpeechRecognition from "../../../../shared/hooks/useSpeechRecognition";
import {
  FiHeart,
  FiShoppingBag,
  FiUser,
  FiLogOut,
  FiGrid,
  FiBell,
  FiPlay,
  FiCompass,
  FiSearch,
  FiChevronDown,
  FiMenu,
  FiPercent,
  FiZap,
  FiCreditCard,
  FiMic,
  FiBriefcase,
  FiTool,
} from "react-icons/fi";
import { HiOutlineUserCircle } from "react-icons/hi";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUserNotificationStore } from "../../store/userNotificationStore";

const DesktopHeader = ({ onSearch }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuthStore();
  const itemCount = useCartStore((state) => state.getItemCount());
  const wishlistCount = useWishlistStore((state) => state.getItemCount());
  const ensureWishlist = useWishlistStore((state) => state.ensureHydrated);
  const unreadCount = useUserNotificationStore((state) => state.unreadCount);
  const ensureHydrated = useUserNotificationStore(
    (state) => state.ensureHydrated,
  );
  const toggleCart = useUIStore((state) => state.toggleCart);
  const cartAnimationTrigger = useUIStore((state) => state.cartAnimationTrigger);

  // Micro-interaction animation trigger states
  const [cartBouncing, setCartBouncing] = useState(false);
  const [wishlistPopping, setWishlistPopping] = useState(false);
  const [bellWiggling, setBellWiggling] = useState(false);
  const prevItemCountRef = useRef(itemCount);
  const prevWishlistRef = useRef(wishlistCount);
  const prevUnreadRef = useRef(unreadCount);

  // Trigger bounce on cart quantity change or explicit trigger
  useEffect(() => {
    if (cartAnimationTrigger > 0 || itemCount > prevItemCountRef.current) {
      setCartBouncing(true);
      const timer = setTimeout(() => setCartBouncing(false), 550);
      return () => clearTimeout(timer);
    }
    prevItemCountRef.current = itemCount;
  }, [cartAnimationTrigger, itemCount]);

  // Trigger pop on wishlist change
  useEffect(() => {
    if (wishlistCount > prevWishlistRef.current) {
      setWishlistPopping(true);
      const timer = setTimeout(() => setWishlistPopping(false), 500);
      return () => clearTimeout(timer);
    }
    prevWishlistRef.current = wishlistCount;
  }, [wishlistCount]);

  // Trigger subtle wiggle on new notification
  useEffect(() => {
    if (unreadCount > prevUnreadRef.current) {
      setBellWiggling(true);
      const timer = setTimeout(() => setBellWiggling(false), 650);
      return () => clearTimeout(timer);
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  // Category Store
  const { categories, initialize, getRootCategories } = useCategoryStore();
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [selectedCategoryName, setSelectedCategoryName] =
    useState("All Categories");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [searchQuery, setSearchQuery] = useState(() => {
    return new URLSearchParams(window.location.search).get("q") || "";
  });

  // Keep search input in sync with URL search parameter
  useEffect(() => {
    const qParam = new URLSearchParams(location.search).get("q") || "";
    setSearchQuery(qParam);
  }, [location.search]);

  const { isListening, isSupported, startListening, stopListening } = useSpeechRecognition({
    onResult: (text, isFinal) => {
      setSearchQuery(text);
      if (isFinal && text.trim()) {
        handleSearchSubmit(null, text.trim());
      }
    }
  });

  const [showNavCategories, setShowNavCategories] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);

  useEffect(() => {
    let active = true;
    if (isAuthenticated) {
      api.get('/user/wallet')
        .then(res => {
          const data = res?.data ?? res;
          if (active && data) {
            setWalletBalance(data.balance || 0);
          }
        })
        .catch(() => null);
    }
    return () => { active = false; };
  }, [isAuthenticated]);

  const categoryDropdownRef = useRef(null);
  const navCategoriesRef = useRef(null);
  const userMenuRef = useRef(null);

  useEffect(() => {
    ensureHydrated();
    if (isAuthenticated) {
      ensureWishlist();
    }
    initialize();
  }, [ensureHydrated, ensureWishlist, initialize, isAuthenticated]);

  // Click outside menus handlers
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        categoryDropdownRef.current &&
        !categoryDropdownRef.current.contains(event.target)
      ) {
        setShowCategoryDropdown(false);
      }
      if (
        navCategoriesRef.current &&
        !navCategoriesRef.current.contains(event.target)
      ) {
        setShowNavCategories(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    setShowUserMenu(false);
    navigate("/home");
  };

  const handleSearchSubmit = (e, queryOverride) => {
    if (e) e.preventDefault();
    const finalQuery = (queryOverride !== undefined ? queryOverride : searchQuery).trim();
    if (finalQuery) {
      if (onSearch) {
        onSearch(finalQuery);
      } else {
        let searchRoute = `/home?q=${encodeURIComponent(finalQuery)}`;
        navigate(searchRoute);
      }
    }
  };

  const rootCategories = getRootCategories() || [];

  return (
    <header className="hidden md:block sticky top-0 z-[999] bg-white shadow-sm border-b border-gray-100 w-full">

      {/* 2. MAIN HEADER BAR */}
      <div className="w-full bg-white py-4 border-b border-gray-50">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 flex items-center justify-between gap-3 lg:gap-6 h-16">
          {/* Logo */}
          <Link to="/home" className="flex-shrink-0 flex items-center gap-2">
            {appLogo.src ? (
              <div className="flex items-center gap-2">
                <img
                  src={appLogo.src}
                  alt={appLogo.alt}
                  className="h-10 lg:h-12 w-auto object-contain"
                />
                <span className="text-xl lg:text-2xl font-black text-gray-800 tracking-tight">
                  Fire Safety Shop
                </span>
              </div>
            ) : (
              <span className="text-2xl font-extrabold text-primary-600">
                Fire Safety Shop
              </span>
            )}
          </Link>

          {/* Premium Search Bar */}
          <div className="flex-1 min-w-[220px] md:min-w-[280px] lg:min-w-[340px] max-w-2xl mx-1 sm:mx-2 lg:mx-4">
            <form
              onSubmit={handleSearchSubmit}
              className="relative flex items-center w-full bg-gray-50 rounded-full pl-4 pr-1 py-1 border border-gray-200 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/20 focus-within:bg-white focus-within:shadow-md transition-all duration-300"
            >
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isListening ? "🎤 Listening... (Tap mic to stop)" : "Search fire extinguishers, safety equipment, alarms..."}
                className="w-full min-w-0 flex-1 bg-transparent focus:outline-none text-xs lg:text-sm text-gray-700 placeholder:text-gray-400 py-1.5 px-1"
              />

              {/* Voice Search Button */}
              <button
                type="button"
                onClick={isListening ? stopListening : startListening}
                disabled={!isSupported && !isListening}
                className={`p-2 rounded-full transition-all duration-200 shrink-0 ml-1 active:scale-95 ${isListening
                  ? 'bg-red-50 text-red-500 animate-pulse scale-105'
                  : !isSupported
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'text-gray-400 hover:text-primary-600 hover:bg-primary-50 hover:scale-105 cursor-pointer'
                  }`}
                title={!isSupported ? "Voice search is not supported in your browser" : "Voice Search"}
              >
                <FiMic className="text-base lg:text-lg" />
              </button>

              {/* Search Button */}
              <button
                type="submit"
                className="bg-primary-600 hover:bg-primary-700 text-white p-2 rounded-full transition-all duration-200 shrink-0 ml-1.5 cursor-pointer hover:scale-105 active:scale-95 shadow-sm hover:shadow-md hover:shadow-primary-600/30"
                title="Search"
              >
                <FiSearch className="text-base lg:text-lg" />
              </button>
            </form>
          </div>

          {/* Action Links (Icons + Labels Beside) */}
          <div className="flex items-center gap-2.5 sm:gap-3 lg:gap-4 xl:gap-6 shrink-0">
            {/* Wishlist */}
            <Link
              to="/wishlist"
              className="group flex items-center gap-1.5 text-gray-600 hover:text-primary-600 transition-colors shrink-0"
              title="Wishlist"
            >
              <div className="relative p-1">
                <FiHeart className={`text-xl lg:text-2xl transition-all duration-200 group-hover:scale-110 ${wishlistPopping ? 'animate-heart-pop text-red-500 fill-red-500' : ''}`} />
                {wishlistCount > 0 && (
                  <span
                    key={wishlistCount}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center animate-badge-pop shadow-sm"
                  >
                    {wishlistCount > 9 ? "9+" : wishlistCount}
                  </span>
                )}
              </div>
              <span className="text-xs lg:text-sm font-semibold tracking-wide hidden 2xl:inline group-hover:text-primary-600 transition-colors">
                Wishlist
              </span>
            </Link>

            {/* Cart */}
            <button
              onClick={toggleCart}
              data-cart-icon
              className="group flex items-center gap-1.5 text-gray-600 hover:text-primary-600 transition-colors focus:outline-none shrink-0"
              title="Cart"
            >
              <div className="relative p-1">
                <FiShoppingBag className={`text-xl lg:text-2xl transition-all duration-200 group-hover:scale-110 ${cartBouncing ? 'animate-cart-bounce text-primary-600' : ''}`} />
                {itemCount > 0 && (
                  <span
                    key={itemCount}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary-600 text-white text-[9px] font-bold flex items-center justify-center animate-badge-pop shadow-sm"
                  >
                    {itemCount > 9 ? "9+" : itemCount}
                  </span>
                )}
              </div>
              <span className="text-xs lg:text-sm font-semibold tracking-wide hidden 2xl:inline group-hover:text-primary-600 transition-colors">
                Cart
              </span>
            </button>

            {/* Notifications */}
            <Link
              to={isAuthenticated ? "/notifications" : "/login"}
              className="group flex items-center gap-1.5 text-gray-600 hover:text-primary-600 transition-colors shrink-0"
              title="Notifications"
            >
              <div className="relative p-1">
                <FiBell className={`text-xl lg:text-2xl transition-all duration-200 group-hover:rotate-12 ${bellWiggling ? 'animate-bell-wiggle text-red-500' : ''}`} />
                {isAuthenticated && unreadCount > 0 && (
                  <span
                    key={unreadCount}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center animate-badge-pop shadow-sm"
                  >
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </div>
              <span className="text-xs lg:text-sm font-semibold tracking-wide hidden 2xl:inline group-hover:text-primary-600 transition-colors">
                Notifications
              </span>
            </Link>

            {/* Become a Vendor Button */}
            <Link
              to="/vendor/register"
              className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 border border-primary-600 text-primary-600 hover:bg-primary-600 hover:text-white rounded-full text-xs font-bold transition-all duration-200 shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98] shrink-0"
              title="Register as a Seller / Vendor"
            >
              <FiBriefcase className="text-sm transition-transform duration-200 group-hover:scale-110" />
              <span>Become a Seller</span>
            </Link>



            {/* User Profile */}
            {isAuthenticated ? (
              <div ref={userMenuRef} className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2.5 p-1.5 rounded-full hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-all text-left focus:outline-none"
                >
                  {user?.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.name}
                      className="w-8 h-8 rounded-full object-cover border border-gray-200"
                    />
                  ) : (
                    <HiOutlineUserCircle className="text-gray-500 text-3xl" />
                  )}
                  <div className="hidden lg:flex flex-col select-none">
                    <span className="text-xs font-black text-gray-800 leading-none max-w-[100px] truncate mb-0.5">
                      {user?.name || "User"}
                    </span>
                    <span className="text-[10px] text-gray-500 font-semibold leading-none">
                      My Account
                    </span>
                  </div>
                  <FiChevronDown className="text-gray-400 hidden lg:inline" />
                </button>

                <AnimatePresence>
                  {showUserMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute right-0 mt-3 bg-white rounded-2xl shadow-xl border border-gray-100 p-2.5 z-[1000] min-w-[220px]"
                    >
                      <div className="px-3 py-2 border-b border-gray-100 mb-2">
                        <p className="font-bold text-gray-800 text-sm">
                          {user?.name || "User"}
                        </p>
                        <p className="text-xs text-gray-500 truncate mt-0.5">
                          {user?.email || ""}
                        </p>
                      </div>
                      <Link
                        to="/profile"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-xl transition-colors text-left text-gray-700 text-sm font-semibold"
                      >
                        <FiUser className="text-gray-500 text-base" />
                        <span>Profile</span>
                      </Link>
                      {/* TEMPORARILY DISABLED — USER WALLET FEATURE */}
                      {/* DO NOT DELETE — RE-ENABLE WHEN WALLET FEATURE IS RESTORED */}
                      {/*
                      <Link
                        to="/user/wallet"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-xl transition-colors text-left text-gray-700 text-sm font-semibold"
                      >
                        <FiCreditCard className="text-gray-500 text-base" />
                        <span>Wallet</span>
                      </Link>
                      */}
                      <Link
                        to="/orders"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-xl transition-colors text-left text-gray-700 text-sm font-semibold"
                      >
                        <FiShoppingBag className="text-gray-500 text-base" />
                        <span>Orders</span>
                      </Link>
                      <Link
                        to="/my-service-bookings"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-xl transition-colors text-left text-gray-700 text-sm font-semibold"
                      >
                        <FiTool className="text-gray-500 text-base" />
                        <span>My Service Bookings</span>
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 w-full px-3 py-2 hover:bg-red-50 rounded-xl transition-colors text-left text-red-600 text-sm font-bold mt-1 cursor-pointer"
                      >
                        <FiLogOut className="text-red-500 text-base" />
                        <span>Logout</span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <Link
                to="/login"
                className="px-6 py-2.5 bg-primary-600 text-white rounded-full font-bold text-sm hover:bg-primary-700 transition-all shadow-sm shadow-primary-200 hover:shadow-md cursor-pointer"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* 3. SUB-HEADER NAVIGATION BAR */}
      <div className="w-full bg-white border-b border-gray-200">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 flex items-center justify-between h-12">
          {/* Categories Button with dropdown */}
          <div ref={navCategoriesRef} className="relative">
            <button
              onClick={() => setShowNavCategories(!showNavCategories)}
              className="flex items-center gap-2 bg-[#f3f4f6] text-gray-700 hover:text-primary-600 px-4 py-2 rounded-xl text-xs lg:text-sm font-bold transition-all hover:bg-gray-100 focus:outline-none"
            >
              <FiMenu className="text-base" />
              <span>Categories</span>
              <FiChevronDown className="text-gray-400" />
            </button>
            <AnimatePresence>
              {showNavCategories && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute left-0 mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 p-2.5 z-[1000] min-w-[240px]"
                >
                  <div className="mt-1.5 space-y-0.5">
                    {rootCategories.slice(0, 5).map((cat) => (
                      <Link
                        key={cat.id || cat._id}
                        to={`/category/${cat.id || cat._id}`}
                        onClick={() => setShowNavCategories(false)}
                        className="flex items-center justify-between px-3.5 py-2 hover:bg-gray-50 rounded-xl transition-colors text-left text-gray-700 text-xs lg:text-sm font-semibold truncate"
                      >
                        <span>{cat.name}</span>
                        <span className="text-[10px] text-gray-400">
                          &rarr;
                        </span>
                      </Link>
                    ))}
                  </div>
                  <Link
                    to="/categories"
                    onClick={() => setShowNavCategories(false)}
                    className="flex items-center justify-center gap-2 mt-2 px-3.5 py-2 hover:bg-primary-50 bg-gray-50 text-primary-600 rounded-xl transition-colors text-center text-xs lg:text-sm font-bold border border-gray-100"
                  >
                    <FiGrid className="text-primary-500 text-sm" />
                    <span>View All Categories</span>
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center gap-6 lg:gap-8 h-full">
            {[
              { path: "/home", label: "Home" },
              { path: "/shop", label: "Products" },
              { path: "/services", label: "Services", badge: "On-Site" },
              { path: "/safety-center", label: "Safety Center", badge: "Guide" },
              { path: "/offers", label: "Offers" },
              { path: "/new-arrivals", label: "New Equipment" },
            ].map((link, idx) => {
              const isActive = window.location.pathname === link.path;
              return (
                <Link
                  key={idx}
                  to={link.path}
                  className={`relative flex items-center gap-1.5 text-xs lg:text-sm font-bold tracking-wide transition-colors h-full px-1 border-b-2 hover:text-primary-600 ${isActive
                    ? "border-primary-600 text-primary-600"
                    : "border-transparent text-gray-600"
                    }`}
                >
                  {link.label}
                  {link.badge && (
                    <span className="bg-red-500 text-white text-[8px] px-1 py-0.2 rounded font-black tracking-normal uppercase scale-90 origin-left">
                      {link.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

        </div>
      </div>
    </header>
  );
};

export default DesktopHeader;
