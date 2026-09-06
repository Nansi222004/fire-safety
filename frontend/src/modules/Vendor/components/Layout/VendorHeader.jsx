import { useEffect, useState } from "react";
import { FiMenu, FiBell, FiLogOut, FiShoppingBag, FiTool } from "react-icons/fi";
import { useLocation, useNavigate } from "react-router-dom";
import { useVendorAuthStore } from "../../store/vendorAuthStore";
import { useVendorNotificationStore } from "../../store/vendorNotificationStore";
import toast from "react-hot-toast";
import Button from "../../../Admin/components/Button";
import VendorNotificationWindow from "./VendorNotificationWindow";

import { getVendorCapabilities } from "../../utils/vendorCapabilities";

const VendorHeader = ({ onMenuClick, isCollapsed, onToggleSidebar }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { vendor, logout } = useVendorAuthStore();
  const { unreadCount, fetchNotifications } = useVendorNotificationStore();
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(() => fetchNotifications(), 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleLogout = () => {
    logout();
    toast.success("Logged out successfully");
    navigate("/vendor/login");
  };

  const toggleNotifications = () => {
    setShowNotifications(!showNotifications);
  };

  // Get page name from pathname
  const getPageName = (pathname) => {
    const path = pathname.split("/").pop() || "dashboard";
    const pageNames = {
      dashboard: "Dashboard",
      products: "Products",
      orders: "Orders",
      analytics: "Analytics",
      earnings: "Earnings",
      settings: "Settings",
      profile: "Profile",
    };
    return pageNames[path] || path.charAt(0).toUpperCase() + path.slice(1);
  };

  const pageName = getPageName(location.pathname);
  const storeName = vendor?.storeName || vendor?.name || "Vendor Store";
  const { isServiceOnly, badgeText } = getVendorCapabilities(vendor);

  return (
    <header
      className={`bg-white/90 backdrop-blur-md border-b border-slate-200/80 fixed top-0 left-0 right-0 z-30 transition-all duration-300 shadow-sm ${isCollapsed ? 'lg:left-0' : 'lg:left-64'}`}
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}>
      <div className="flex items-center justify-between px-4 lg:px-6 py-3.5">
        {/* Left: Menu Button */}
        <div className="flex items-center gap-3.5">
          <button
            onClick={() => {
              if (window.innerWidth >= 1024) {
                onToggleSidebar();
              } else {
                onMenuClick();
              }
            }}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="p-2 rounded-xl border border-slate-200 text-slate-700 bg-slate-50 hover:bg-slate-100 active:scale-95 transition-all shadow-xs flex items-center justify-center cursor-pointer"
            aria-label="Toggle navigation menu"
          >
            <FiMenu className="text-xl" />
          </button>

          {/* Page Heading - Desktop Only */}
          <div className="hidden lg:block">
            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none mb-1">
              {pageName}
            </h1>
            <div className="text-xs font-bold text-slate-500 flex items-center gap-2">
              {isServiceOnly ? (
                <span className="inline-flex items-center gap-1 text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md border border-orange-200/80 text-[11px]">
                  <FiTool className="text-xs" />
                  Service Partner
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-primary-600 bg-red-50 px-2 py-0.5 rounded-md border border-red-200/80 text-[11px]">
                  <FiShoppingBag className="text-xs" />
                  {badgeText === "VERIFIED PARTNER" ? "Verified Partner" : "Approved Seller"}
                </span>
              )}
              <span className="text-slate-700 font-semibold truncate max-w-xs">{storeName}</span>
            </div>
          </div>
        </div>

        {/* Right: Notifications & Logout */}
        <div className="flex items-center gap-4">
          {/* Notifications */}
          <div className="relative">
            <Button
              data-notification-button
              onClick={toggleNotifications}
              variant="icon"
              className="text-gray-700"
              icon={FiBell}
            />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            )}

            {/* Notification Window - positioned relative to this container */}
            <VendorNotificationWindow
              isOpen={showNotifications}
              onClose={() => setShowNotifications(false)}
              position="right"
            />
          </div>

          {/* Logout Button */}
          <Button
            onClick={handleLogout}
            variant="ghost"
            icon={FiLogOut}
            size="sm"
            className="text-gray-700 hover:bg-red-600 hover:text-white hover:border-red-600 border border-gray-300">
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
};

export default VendorHeader;
