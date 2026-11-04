import { useEffect, useState } from "react";
import { Outlet, NavLink, Link, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { FiMenu, FiX, FiBell, FiLogOut, FiBriefcase, FiArrowLeft } from "react-icons/fi";
import toast from "react-hot-toast";
import { useWholesalerAuthStore } from "../../store/wholesalerAuthStore";
import { getWholesalerProfile } from "../../services/wholesalerService";
import { WHOLESALER_MENU, WHOLESALER_BOTTOM_NAV } from "../../config/wholesalerMenu";
import { getSocket, joinRoom, leaveRoom } from "../../../../shared/utils/socket";
import { registerFCMToken } from "../../../../services/pushNotificationService";
import { isSelfInitiatedNotification, isDuplicateNotification } from "../../../../shared/utils/selfActionTracker";
import { appLogo } from "../../../../shared/utils/imagePaths";

// Exact match for section roots so e.g. "Products" is not highlighted on "Add Product".
const EXACT_PATHS = new Set(["/wholesaler/products"]);

/**
 * Mobile app-bar title per screen. `back` shows a back arrow instead of the menu button;
 * `focus` marks detail/form screens, which hide the bottom tabs like a pushed native screen.
 */
const SCREENS = [
  [/^\/wholesaler\/dashboard/, "Dashboard"],
  [/^\/wholesaler\/products\/add-product/, "Add Product", { back: true, focus: true }],
  [/^\/wholesaler\/products\/[^/]+/, "Edit Product", { back: true, focus: true }],
  [/^\/wholesaler\/products/, "Products"],
  [/^\/wholesaler\/pricing/, "Pricing & Stock"],
  [/^\/wholesaler\/orders\/[^/]+/, "Order Details", { back: true, focus: true }],
  [/^\/wholesaler\/orders/, "B2B Orders"],
  [/^\/wholesaler\/return-requests\/[^/]+/, "Return Details", { back: true, focus: true }],
  [/^\/wholesaler\/return-requests/, "Returns"],
  [/^\/wholesaler\/earnings/, "Earnings"],
  [/^\/wholesaler\/wallet-history/, "Wallet"],
  [/^\/wholesaler\/settings\/payment/, "Payout Settings", { back: true }],
  [/^\/wholesaler\/profile/, "Business Profile"],
  [/^\/wholesaler\/documents/, "Documents", { back: true }],
  [/^\/wholesaler\/notifications/, "Notifications", { back: true }],
  [/^\/wholesaler\/support-tickets\/[^/]+/, "Support Ticket", { back: true, focus: true }],
  [/^\/wholesaler\/support-tickets/, "Support", { back: true }],
];

const resolveScreen = (pathname) => {
  const match = SCREENS.find(([pattern]) => pattern.test(pathname));
  return match ? { title: match[1], back: false, focus: false, ...match[2] } : { title: "Wholesaler", back: false, focus: false };
};

const navLinkClass = ({ isActive }) =>
  `flex items-center gap-3 px-3 py-2.5 lg:py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive ? "bg-[#FEF2F2] text-[#C8191E] font-semibold" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
  }`;

const SidebarContent = ({ wholesaler, onNavigate, onLogout }) => (
  <div className="flex flex-col h-full">
    <div className="px-5 py-4 border-b border-slate-100">
      <Link to="/wholesaler/dashboard" onClick={onNavigate} className="flex items-center gap-2.5">
        <img src={appLogo} alt="Fire Safety Shop" className="h-8 w-auto object-contain" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-[#E31E24]">Wholesaler Portal</p>
        </div>
      </Link>
    </div>

    <div className="px-5 py-3 border-b border-slate-100">
      <p className="text-sm font-bold text-slate-800 truncate">{wholesaler?.storeName || wholesaler?.name || "Wholesaler"}</p>
      <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-[#FEF2F2] text-[#E31E24] border-red-200">
        <FiBriefcase /> VERIFIED WHOLESALER
      </span>
    </div>

    <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 space-y-5" aria-label="Wholesaler navigation">
      {WHOLESALER_MENU.map((section) => (
        <div key={section.title}>
          <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{section.title}</p>
          <div className="space-y-0.5">
            {section.items.map(({ label, path, icon: Icon }) => (
              <NavLink key={path} to={path} end={EXACT_PATHS.has(path)} onClick={onNavigate} className={navLinkClass}>
                <Icon className="text-base flex-shrink-0" />
                <span className="truncate">{label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>

    {onLogout && (
      <div className="border-t border-slate-100 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50"
        >
          <FiLogOut /> Logout
        </button>
      </div>
    )}
  </div>
);

const WholesalerLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { vendor: wholesaler, token, syncVendor, logout } = useWholesalerAuthStore();
  const wholesalerId = wholesaler?.id || wholesaler?._id;
  const screen = resolveScreen(location.pathname);

  useEffect(() => setSidebarOpen(false), [location.pathname]);

  // A fresh screen starts at the top, like navigating in a native app.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // Keep the page behind the drawer from scrolling while it is open.
  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [sidebarOpen]);

  // Make sure this device receives wholesaler push notifications.
  useEffect(() => {
    if (token) registerFCMToken(false, "wholesaler").catch(() => {});
  }, [token]);

  // Keep the stored profile (capabilities, business name) in sync with the server.
  useEffect(() => {
    getWholesalerProfile()
      .then((profile) => {
        if (profile && (profile.id || profile._id)) syncVendor(profile);
      })
      .catch(() => {});
  }, [syncVendor, token]);

  // Live notifications (orders, returns, approvals) are delivered to the seller room.
  useEffect(() => {
    if (!token || !wholesalerId) return undefined;
    const socket = getSocket(token);
    if (!socket) return undefined;

    joinRoom(`vendor_${wholesalerId}`);
    const handleNewNotification = (notif) => {
      if (isDuplicateNotification(notif) || isSelfInitiatedNotification(notif)) return;
      toast.success(
        <div className="flex flex-col gap-1 text-white">
          <p className="font-semibold text-sm text-white">{notif?.title || "Notification"}</p>
          <p className="text-xs text-gray-200 leading-relaxed">{notif?.message || ""}</p>
        </div>,
        { duration: 6000 }
      );
    };
    socket.on("new_notification", handleNewNotification);
    return () => {
      socket.off("new_notification", handleNewNotification);
      leaveRoom(`vendor_${wholesalerId}`);
    };
  }, [token, wholesalerId]);

  const handleLogout = () => {
    logout();
    toast.success("Logged out.");
    navigate("/wholesaler/login", { replace: true });
  };

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/wholesaler/dashboard");
  };

  const showTabs = !screen.focus;

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex [-webkit-tap-highlight-color:transparent]">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col fixed inset-y-0 left-0 w-64 bg-white border-r border-slate-200 z-30">
        <SidebarContent wholesaler={wholesaler} />
      </aside>

      {/* Mobile / tablet drawer */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              className="fixed inset-0 bg-slate-900/40 z-40 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-white z-50 lg:hidden shadow-xl pt-[env(safe-area-inset-top)]"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.22 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0.4, right: 0 }}
              onDragEnd={(_, info) => {
                if (info.offset.x < -80) setSidebarOpen(false);
              }}
            >
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close menu"
                className="absolute top-[calc(env(safe-area-inset-top)+0.75rem)] right-3 p-2 text-slate-500 hover:text-slate-900"
              >
                <FiX />
              </button>
              <SidebarContent wholesaler={wholesaler} onNavigate={() => setSidebarOpen(false)} onLogout={handleLogout} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
        {/* App bar (mobile/tablet) and top bar (desktop) */}
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 pt-[env(safe-area-inset-top)]">
          <div className="h-14 px-2 sm:px-4 lg:px-6 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 min-w-0">
              {screen.back ? (
                <button
                  type="button"
                  onClick={handleBack}
                  aria-label="Go back"
                  className="lg:hidden w-10 h-10 flex items-center justify-center rounded-full text-slate-700 active:bg-slate-100"
                >
                  <FiArrowLeft className="text-xl" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Open menu"
                  className="lg:hidden w-10 h-10 flex items-center justify-center rounded-full text-slate-700 active:bg-slate-100"
                >
                  <FiMenu className="text-xl" />
                </button>
              )}
              <h1 className="text-base font-bold text-slate-900 truncate lg:hidden">{screen.title}</h1>
              <span className="hidden lg:inline text-sm font-bold text-slate-800">Wholesale / B2B</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              <Link
                to="/wholesaler/notifications"
                aria-label="Notifications"
                className="w-10 h-10 flex items-center justify-center text-slate-600 hover:text-slate-900 rounded-full hover:bg-slate-100 active:bg-slate-100"
              >
                <FiBell className="text-lg" />
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-red-600 rounded-lg hover:bg-red-50"
              >
                <FiLogOut /> Logout
              </button>
            </div>
          </div>
        </header>

        <main
          className={`flex-1 px-3 sm:px-4 lg:px-6 pt-4 sm:pt-5 w-full min-w-0 overflow-x-hidden lg:pb-8 ${
            showTabs ? "pb-[calc(5rem+env(safe-area-inset-bottom))]" : "pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
          }`}
        >
          <Outlet />
        </main>
      </div>

      {/* Bottom tab bar (mobile/tablet) */}
      {showTabs && (
        <nav
          className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 pb-[env(safe-area-inset-bottom)]"
          aria-label="Quick navigation"
        >
          <div className="grid grid-cols-5 max-w-xl mx-auto">
            {WHOLESALER_BOTTOM_NAV.map(({ label, path, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                end={EXACT_PATHS.has(path)}
                className={({ isActive }) =>
                  `relative flex flex-col items-center justify-center gap-0.5 h-16 text-[10px] font-semibold transition-colors ${
                    isActive ? "text-[#E31E24]" : "text-slate-500"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-[#E31E24]" />}
                    <span className={`w-12 h-7 flex items-center justify-center rounded-full ${isActive ? "bg-[#FEF2F2]" : ""}`}>
                      <Icon className="text-lg" />
                    </span>
                    {label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
};

export default WholesalerLayout;
