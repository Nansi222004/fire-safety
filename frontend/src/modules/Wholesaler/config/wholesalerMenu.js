import {
  FiGrid,
  FiPackage,
  FiPlusSquare,
  FiTag,
  FiShoppingBag,
  FiRotateCcw,
  FiDollarSign,
  FiCreditCard,
  FiFileText,
  FiBell,
  FiHelpCircle,
  FiUser,
  FiSettings,
} from "react-icons/fi";

export const WHOLESALER_MENU = [
  {
    title: "Business",
    items: [
      { label: "Dashboard", path: "/wholesaler/dashboard", icon: FiGrid },
    ],
  },
  {
    title: "Catalog",
    items: [
      { label: "Products", path: "/wholesaler/products", icon: FiPackage },
      { label: "Add Product", path: "/wholesaler/products/add-product", icon: FiPlusSquare },
      { label: "Pricing & Stock", path: "/wholesaler/pricing", icon: FiTag },
    ],
  },
  {
    title: "Orders",
    items: [
      { label: "B2B Orders", path: "/wholesaler/orders", icon: FiShoppingBag },
      { label: "Returns", path: "/wholesaler/return-requests", icon: FiRotateCcw },
    ],
  },
  {
    title: "Finance",
    items: [
      { label: "Earnings", path: "/wholesaler/earnings", icon: FiDollarSign },
      { label: "Wallet", path: "/wholesaler/wallet-history", icon: FiCreditCard },
      { label: "Payout Settings", path: "/wholesaler/settings/payment", icon: FiSettings },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Business Profile", path: "/wholesaler/profile", icon: FiUser },
      { label: "Documents", path: "/wholesaler/documents", icon: FiFileText },
      { label: "Notifications", path: "/wholesaler/notifications", icon: FiBell },
      { label: "Support", path: "/wholesaler/support-tickets", icon: FiHelpCircle },
    ],
  },
];

// Mobile bottom navigation shortcuts.
export const WHOLESALER_BOTTOM_NAV = [
  { label: "Home", path: "/wholesaler/dashboard", icon: FiGrid },
  { label: "Products", path: "/wholesaler/products", icon: FiPackage },
  { label: "Orders", path: "/wholesaler/orders", icon: FiShoppingBag },
  { label: "Wallet", path: "/wholesaler/wallet-history", icon: FiCreditCard },
  { label: "Profile", path: "/wholesaler/profile", icon: FiUser },
];
