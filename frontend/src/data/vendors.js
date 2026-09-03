import logoImage from "../../data/logos/safefire_logo.png";

export const vendors = [
  {
    id: 1,
    name: "Demo Fire Safety Supplier",
    email: "supplier@demosafety.com",
    phone: "+1234567890",
    storeName: "Demo Fire Safety Store",
    storeLogo: logoImage,
    storeDescription: "Certified supplier of professional fire extinguishers, alarms, and safety gear",
    status: "approved",
    commissionRate: 10,
    joinDate: "2024-01-15",
    address: {
      street: "123 Safety Way",
      city: "Industrial Park",
      state: "NY",
      zipCode: "10001",
      country: "USA",
    },
    documents: {
      businessLicense: "/documents/business-license-1.pdf",
      taxId: "TAX-123456",
    },
    rating: 4.8,
    reviewCount: 156,
    totalProducts: 45,
    totalSales: 1250,
    totalEarnings: 11250.0,
    isVerified: true,
  },
  {
    id: 2,
    name: "Sample Equipment Supplier",
    email: "equipment@samplefire.com",
    phone: "+1234567891",
    storeName: "Sample Equipment Depot",
    storeLogo: logoImage,
    storeDescription: "Specialized distributor of commercial fire blankets, hoses, and alarms",
    status: "approved",
    commissionRate: 12,
    joinDate: "2024-02-01",
    address: {
      street: "456 Protection Ave",
      city: "Chicago",
      state: "IL",
      zipCode: "60601",
      country: "USA",
    },
    documents: {
      businessLicense: "/documents/business-license-2.pdf",
      taxId: "TAX-234567",
    },
    rating: 4.9,
    reviewCount: 234,
    totalProducts: 78,
    totalSales: 2100,
    totalEarnings: 18480.0,
    isVerified: true,
  },
];

const normalizeId = (value) => String(value ?? "").trim();

export const getVendorById = (id) => {
  const targetId = normalizeId(id);
  return vendors.find((v) => normalizeId(v.id) === targetId);
};

export const getVendorsByStatus = (status) => {
  return vendors.filter((v) => v.status === status);
};

export const getApprovedVendors = () => {
  return vendors.filter((v) => v.status === "approved");
};

export const getVendorProducts = () => [];
export const getVendorOrders = () => [];
