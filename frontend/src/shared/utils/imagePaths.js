import appLogo from "../../assets/fire-safety-logo.jpg";

// Fire Safety visual placeholders
const extRedImg = "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=800&q=80";
const extBlackImg = "https://images.unsplash.com/photo-1599481238640-4c1288750d7a?auto=format&fit=crop&w=800&q=80";
const extHoseImg = "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=800&q=80";
const safetyEqImg = "https://images.unsplash.com/photo-1544027993-37dbfe43562a?auto=format&fit=crop&w=800&q=80";

export const imageMap = {
  // Fire Safety Products
  "/images/products/abc_extinguisher.png": extRedImg,
  "/images/products/co2_extinguisher.png": extBlackImg,
  "/images/products/foam_extinguisher.png": extRedImg,
  "/images/products/water_extinguisher.png": extHoseImg,
  "/images/products/fire_blanket.png": safetyEqImg,
  "/images/products/smoke_alarm.png": safetyEqImg,
  "/images/products/fire_hose.png": extHoseImg,

  // Logos
  "/images/logos/logo.png": appLogo,
  "/images/logos/safefire_logo.png": appLogo,
  "/images/logos/fire-safety-logo.jpg": appLogo,
  "/logos/safefire_logo.png": appLogo,
  "/logos/fire-safety-logo.jpg": appLogo,

  // Hero & Banners
  "/images/hero/slide1.png": extRedImg,
  "/images/hero/slide2.png": extBlackImg,
  "/images/hero/slide3.png": safetyEqImg,
  "/images/hero/slide4.png": extHoseImg,
};

export const getImagePath = (path, fallback = null) => {
  if (!path) return fallback || extRedImg;
  if (path.startsWith("http")) return path;
  return imageMap[path] || fallback || extRedImg;
};

export const defaultLogo = appLogo;
export { appLogo };
