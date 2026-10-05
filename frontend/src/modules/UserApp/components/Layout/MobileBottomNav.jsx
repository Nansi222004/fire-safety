import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { FiHome, FiGrid, FiSearch, FiHeart, FiUser, FiTool } from "react-icons/fi";
import { Clapperboard } from "lucide-react";
import { useWishlistStore } from "../../../../shared/store/wishlistStore";
import { useAuthStore } from "../../../../shared/store/authStore";

const MobileBottomNav = () => {
  const location = useLocation();
  const wishlistCount = useWishlistStore((state) => state.getItemCount());
  const { isAuthenticated } = useAuthStore();

  const navItems = [
    { path: "/home", icon: FiHome, label: "Home" },
    { path: "/services", icon: FiTool, label: "Services" },
    { path: "/categories", icon: FiGrid, label: "Categories" },
    {
      path: isAuthenticated ? "/profile" : "/login",
      icon: FiUser,
      label: "Account",
    },
  ];

  const isActive = (path) => {
    if (path === "/home") {
      return location.pathname === "/home";
    }
    return location.pathname.startsWith(path);
  };

  // Animation variants for icon
  const iconVariants = {
    inactive: {
      scale: 1,
      color: "#64748b",
    },
    active: {
      scale: 1.1,
      color: "#E31E24", // Fire Red Primary Color
      transition: {
        type: "spring",
        stiffness: 400,
        damping: 25,
      },
    },
  };

  const navContent = (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200/80 z-[9999] safe-area-bottom shadow-[0_-4px_20px_rgba(0,0,0,0.06)] md:hidden">
      <div className="flex items-center justify-around h-14 px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);

          return (
            <Link
              key={item.path}
              to={item.path}
              className="flex items-center justify-center flex-1 h-full relative">
              <motion.div
                className="relative flex items-center justify-center w-12 h-12"
                whileTap={{ scale: 0.9 }}>
                {/* Active Indicator Background */}
                {active && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-1 bg-red-50/80 rounded-2xl border border-red-100/60 shadow-[0_0_12px_rgba(227,30,36,0.08)]"
                    initial={false}
                    transition={{ type: "spring", stiffness: 450, damping: 30 }}
                  />
                )}

                {/* Icon */}
                <motion.div
                  className="relative z-10 flex items-center justify-center"
                  variants={iconVariants}
                  initial="inactive"
                  animate={active ? "active" : "inactive"}
                  transition={{ duration: 0.2 }}>
                  <Icon
                    className="text-2xl"
                    style={{
                      fill: "none",
                      stroke: "currentColor",
                      strokeWidth: 2,
                    }}
                  />
                </motion.div>

                {/* Active bottom micro-dot */}
                {active && (
                  <motion.div
                    layoutId="activeDot"
                    className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-[#E31E24] shadow-[0_0_6px_rgba(227,30,36,0.6)] z-20"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}

                {/* Badge */}
                {item.badge && (
                  <motion.span
                    key={item.badge}
                    initial={{ scale: 0.7 }}
                    animate={{ scale: [0.7, 1.25, 1] }}
                    transition={{ duration: 0.3 }}
                    className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full border-2 border-white shadow-md z-20 flex items-center justify-center bg-[#E31E24]">
                    <span className="text-[8px] font-bold text-white">
                      {item.badge > 9 ? "9+" : item.badge}
                    </span>
                  </motion.span>
                )}
              </motion.div>
            </Link>
          );
        })}
      </div>
    </nav>
  );

  // Use portal to render outside of transformed containers (like PageTransition)
  return createPortal(navContent, document.body);
};

export default MobileBottomNav;
