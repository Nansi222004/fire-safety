import { useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { installButtonRipple } from '../utils/buttonRipple';

/**
 * Wrapper component that forces remounting when location changes
 * This ensures React Router properly updates components on navigation
 */
const RouteWrapper = ({ children }) => {
  const location = useLocation();
  const [catalogTick, setCatalogTick] = useState(0);

  // User-panel button tap ripple (installed once, scoped to .sf-user-ui)
  useEffect(() => {
    installButtonRipple();
  }, []);

  useEffect(() => {
    const onCatalogUpdate = () => setCatalogTick((prev) => prev + 1);
    window.addEventListener('catalog-cache-updated', onCatalogUpdate);
    return () => {
      window.removeEventListener('catalog-cache-updated', onCatalogUpdate);
    };
  }, []);
  
  // Return children with location key to force remount on route change
  // `sf-user-ui` scopes user-panel-only styling (e.g. button micro-interactions in index.css)
  // Ensure strict max-width and min-width constraints to avoid layout expansion
  return <div key={`${location.pathname}${location.search}:${catalogTick}`} className="sf-user-ui w-full max-w-full min-w-0" style={{ width: '100%', height: '100%' }}>{children}</div>;
};

export default RouteWrapper;

