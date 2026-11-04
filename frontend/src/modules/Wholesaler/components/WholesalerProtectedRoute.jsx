import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useWholesalerAuthStore } from "../store/wholesalerAuthStore";

const decodeJwtPayload = (token) => {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(window.atob(base64));
  } catch {
    return null;
  }
};

const WholesalerProtectedRoute = ({ children }) => {
  const { isAuthenticated, token, logout } = useWholesalerAuthStore();
  const location = useLocation();
  const accessToken = token || localStorage.getItem("wholesaler-token");
  const payload = decodeJwtPayload(accessToken);
  const role = String(payload?.role || "").toLowerCase();
  const isExpired = typeof payload?.exp === "number" ? Date.now() >= payload.exp * 1000 : false;
  const isInvalid = !isAuthenticated || !accessToken || isExpired || role !== "wholesaler";

  useEffect(() => {
    // Expired, or a token that is not a wholesaler session: clear it.
    if (isAuthenticated && accessToken && (isExpired || role !== "wholesaler")) {
      logout();
    }
  }, [isAuthenticated, accessToken, isExpired, role, logout]);

  if (isInvalid) {
    return <Navigate to="/wholesaler/login" state={{ from: location }} replace />;
  }

  return children;
};

export default WholesalerProtectedRoute;
