import { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import VendorSidebar from './VendorSidebar';
import VendorHeader from './VendorHeader';
import VendorBottomNav from './VendorBottomNav';
import { useVendorAuthStore } from '../../store/vendorAuthStore';
import { getVendorProfile } from '../../services/vendorService';
import { getSocket, joinRoom, leaveRoom } from '../../../../shared/utils/socket';
import { useVendorNotificationStore } from '../../store/vendorNotificationStore';
import toast from 'react-hot-toast';

const VendorLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(
    localStorage.getItem('vendor_sidebar_collapsed') === 'true'
  );
  const headerRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const location = useLocation();
  const { syncVendor, vendor, token } = useVendorAuthStore();
  const { addNotification } = useVendorNotificationStore();

  // Authoritative dynamic measurement of the rendered VendorHeader height
  useEffect(() => {
    const updateHeaderHeight = () => {
      const el = headerRef.current || document.getElementById('vendor-header');
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.height > 0) {
          setHeaderHeight(rect.height);
        }
      }
    };

    updateHeaderHeight();
    window.addEventListener('resize', updateHeaderHeight);

    const el = headerRef.current || document.getElementById('vendor-header');
    let observer = null;
    if (el && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(updateHeaderHeight);
      observer.observe(el);
    }

    return () => {
      window.removeEventListener('resize', updateHeaderHeight);
      if (observer) observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await getVendorProfile();
        const data = response?.data ?? response;
        const profile = data?.vendor || data;
        if (profile && (profile.id || profile._id)) {
          syncVendor(profile);
        }
      } catch (err) {
        console.error('Failed to sync vendor profile:', err);
      }
    };
    fetchProfile();
  }, [syncVendor, token]);

  useEffect(() => {
    if (!token || !vendor) return;
    const socket = getSocket(token);
    if (!socket) return;

    const vendorId = vendor.id || vendor._id;
    joinRoom(`vendor_${vendorId}`);

    const handleNewNotification = (notif) => {
      addNotification(notif);
      toast.success(
        <div className="flex flex-col gap-1 text-white">
          <p className="font-semibold text-sm text-white">{notif.title}</p>
          <p className="text-xs text-gray-200 leading-relaxed">{notif.message}</p>
        </div>,
        {
          duration: 6000,
          position: 'top-right',
        }
      );
    };

    socket.on('new_notification', handleNewNotification);
    socket.on('notification', handleNewNotification);

    return () => {
      socket.off('new_notification', handleNewNotification);
      socket.off('notification', handleNewNotification);
      leaveRoom(`vendor_${vendorId}`);
    };
  }, [token, vendor, addNotification]);

  const toggleSidebar = () => {
    const nextVal = !isCollapsed;
    setIsCollapsed(nextVal);
    localStorage.setItem('vendor_sidebar_collapsed', String(nextVal));
  };

  const isTicketDetail =
    location.pathname.startsWith('/vendor/support-tickets/') &&
    location.pathname !== '/vendor/support-tickets';

  // Dynamic breathing room: 12px mobile (<640px), 16px tablet (sm: 640-1023px), 20px desktop (lg: >=1024px)
  const getBreathingRoom = () => {
    if (typeof window === 'undefined') return 12;
    const width = window.innerWidth;
    if (width >= 1024) return 20;
    if (width >= 640) return 16;
    return 12;
  };

  // Authoritative top padding: measured header height + breathing room,
  // falling back smoothly to CSS token before first measurement.
  const contentTopPadding = headerHeight > 0
    ? `${Math.round(headerHeight + getBreathingRoom())}px`
    : 'var(--vendor-header-offset, calc(69px + env(safe-area-inset-top, 0px)))';

  // Authoritative bottom padding: clears fixed bottom navigation on mobile with breathing buffer,
  // resets cleanly to 24px on desktop (lg:hidden) and 16px on support ticket details.
  const contentBottomPadding = isTicketDetail
    ? '16px'
    : 'var(--vendor-bottom-pad, calc(80px + env(safe-area-inset-bottom, 0px)))';

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <VendorSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isCollapsed={isCollapsed}
      />

      {/* Main Content */}
      <div className={`flex-1 flex flex-col min-w-0 max-w-full overflow-x-hidden transition-all duration-300 ${isCollapsed ? 'lg:ml-0' : 'lg:ml-64'}`}>
        {/* Header */}
        <VendorHeader
          ref={headerRef}
          onMenuClick={() => setSidebarOpen(true)}
          isCollapsed={isCollapsed}
          onToggleSidebar={toggleSidebar}
        />

        {/* Page Content - Single authoritative top and bottom spacing */}
        <main
          className="flex-1 px-3 sm:px-4 lg:px-6 overflow-y-auto overflow-x-hidden scrollbar-admin w-full min-w-0"
          style={{
            paddingTop: contentTopPadding,
            paddingBottom: contentBottomPadding,
          }}
        >
          <div className="w-full max-w-full overflow-x-hidden min-w-0">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Bottom Navigation - Mobile Only */}
      {!isTicketDetail && <VendorBottomNav />}
    </div>
  );
};


export default VendorLayout;

