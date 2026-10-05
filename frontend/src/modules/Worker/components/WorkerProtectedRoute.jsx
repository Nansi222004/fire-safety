import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useWorkerAuthStore } from '../store/workerAuthStore';

const decodeJwtPayload = (token) => {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    return JSON.parse(window.atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
};

// UI guard only — every worker API enforces role + task ownership on the server.
const WorkerProtectedRoute = ({ children }) => {
  const { isAuthenticated, token, logout } = useWorkerAuthStore();
  const location = useLocation();
  const accessToken = token || localStorage.getItem('worker-token');
  const refreshToken = localStorage.getItem('worker-refresh-token');
  const role = String(decodeJwtPayload(accessToken)?.role || '').toLowerCase();
  const isWrongRole = Boolean(accessToken) && role && role !== 'worker';

  useEffect(() => {
    if (isAuthenticated && (isWrongRole || !refreshToken)) logout();
  }, [isAuthenticated, isWrongRole, refreshToken, logout]);

  // Expired access tokens are refreshed transparently by the API client.
  if (!isAuthenticated || !accessToken || !refreshToken || isWrongRole) {
    return <Navigate to="/worker/login" state={{ from: location }} replace />;
  }
  return children;
};

export default WorkerProtectedRoute;
