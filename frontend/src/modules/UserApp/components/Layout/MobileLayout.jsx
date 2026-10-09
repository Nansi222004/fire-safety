import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import MobileHeader from './MobileHeader';
import DesktopHeader from './DesktopHeader';
import DesktopFooter from './DesktopFooter';
import MobileBottomNav from './MobileBottomNav';
import MobileCartBar from './MobileCartBar';
import CartDrawer from '../../../../shared/components/Cart/CartDrawer';
import useMobileHeaderHeight from '../../hooks/useMobileHeaderHeight';
import ErrorBoundary from '../../../../shared/components/ErrorBoundary/ErrorBoundary';
import { useAuthStore } from '../../../../shared/store/authStore';
import "../../customer-animations.css";

const MobileLayout = ({ children, showBottomNav = true, showCartBar = true, showHeader = true, onSearch }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const wholesaleAccess = useAuthStore((state) => state.isAuthenticated && state.user?.wholesaleAccess === true);
  const headerHeight = useMobileHeaderHeight();
  
  const handleGlobalSearch = (query) => {
    if (onSearch) {
      onSearch(query);
      return;
    }
    navigate(`/home?q=${encodeURIComponent(query)}`);
  };

  // Hide header and bottom nav on login, register, and verification pages
  const isAuthPage = location.pathname === '/login' ||
    location.pathname === '/register' ||
    location.pathname === '/verification';

  const isCheckoutPage = location.pathname === '/checkout';
  const isAddressesPage = location.pathname === '/addresses';

  // Respect the showBottomNav prop and hide on auth pages
  const shouldShowBottomNav = showBottomNav && !isAuthPage;
  // Hide header on categories, search, wishlist, profile, and auth pages
  const shouldShowHeader = showHeader && !isAuthPage &&
    location.pathname !== '/categories' &&
    location.pathname !== '/search' &&
    location.pathname !== '/wishlist' &&
    location.pathname !== '/profile' &&
    location.pathname !== '/orders' &&
    !isAddressesPage &&
    !location.pathname.startsWith('/product/') &&
    !isCheckoutPage;

  // Ensure body scroll is restored when component mounts
  useEffect(() => {
    document.body.style.overflowY = '';
    return () => {
      document.body.style.overflowY = '';
    };
  }, []);

  const isDesktopHeaderVisible = !isAuthPage && !isCheckoutPage && !isAddressesPage;
  const mainStyle = shouldShowHeader ? { paddingTop: `${headerHeight}px` } : {};

  const shouldHideFooter = isAuthPage ||
    location.pathname === '/signup' ||
    location.pathname === '/profile';

  const isCategoriesPage = location.pathname === '/categories';

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col w-full max-w-full min-w-0 overflow-x-hidden">
        {isDesktopHeaderVisible && <DesktopHeader onSearch={handleGlobalSearch} />}
        {shouldShowHeader && <MobileHeader onSearch={handleGlobalSearch} />}
        <main
          className={`flex-grow w-full max-w-full md:max-w-[1440px] mx-auto min-w-0 px-0 md:px-4 lg:px-6 xl:px-8 ${
            showCartBar 
              ? 'pb-24 lg:pb-0' 
              : (shouldShowBottomNav ? 'pb-14 lg:pb-0' : '')
          }`}
          style={mainStyle}
        >
          {/* Approved wholesale buyers browsing retail pages always have a way back to the wholesale catalog */}
          {wholesaleAccess && !location.pathname.startsWith('/wholesale') && !isAuthPage && (
            <button
              type="button"
              onClick={() => navigate('/wholesale')}
              className="w-full flex items-center justify-between gap-3 px-4 py-2 bg-sky-50 border-b border-sky-100 text-sky-800 text-xs font-semibold"
            >
              <span>You are signed in as a wholesale buyer. Retail prices are shown on this page.</span>
              <span className="flex-shrink-0 font-bold underline">Wholesale catalog →</span>
            </button>
          )}
          {children}
        </main>
        {!shouldHideFooter && <DesktopFooter />}
        {showCartBar && <MobileCartBar />}
        {shouldShowBottomNav && <MobileBottomNav />}
        <CartDrawer />
      </div>
    </ErrorBoundary>
  );
};

export default MobileLayout;

