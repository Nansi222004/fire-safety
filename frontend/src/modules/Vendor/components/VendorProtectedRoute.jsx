import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useVendorAuthStore } from '../store/vendorAuthStore';
import CapabilityAccessRequired from './CapabilityAccessRequired';

const decodeJwtPayload = (token) => {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = window.atob(base64);
    return JSON.parse(json);
  } catch {
    return null;
  }
};

const VendorProtectedRoute = ({ children, requiredCapability = null }) => {
  const { isAuthenticated, token, vendor, logout } = useVendorAuthStore();
  const location = useLocation();
  const accessToken = token || localStorage.getItem('vendor-token');
  const payload = decodeJwtPayload(accessToken);
  const role = String(payload?.role || '').toLowerCase();
  const tokenExpiryMs =
    typeof payload?.exp === 'number' ? payload.exp * 1000 : null;
  const isExpired = tokenExpiryMs ? Date.now() >= tokenExpiryMs : false;

  useEffect(() => {
    // If authenticated but token is expired or role is invalid, log out
    if (isAuthenticated && (isExpired || (role && accessToken && role !== 'vendor'))) {
      logout();
    }
  }, [isAuthenticated, isExpired, role, accessToken, logout]);

  if (!isAuthenticated || !accessToken || isExpired || (role && accessToken && role !== 'vendor')) {
    return <Navigate to="/vendor/login" state={{ from: location }} replace />;
  }

  // Capability Route Guard
  if (requiredCapability) {
    const caps = vendor?.vendorCapabilities || { sellsProducts: true, providesServices: false };
    const req = String(requiredCapability).toLowerCase();
    if ((req === 'products' || req === 'sellsproducts') && caps.sellsProducts === false) {
      return <CapabilityAccessRequired requiredCapability="products" />;
    }
    if ((req === 'services' || req === 'providesservices') && caps.providesServices === false) {
      return <CapabilityAccessRequired requiredCapability="services" />;
    }
  }

  return children;
};

export default VendorProtectedRoute;
