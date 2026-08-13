const extRedImg = "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=600&q=80";
const extBlackImg = "https://images.unsplash.com/photo-1599481238640-4c1288750d7a?auto=format&fit=crop&w=600&q=80";

// Mock analytics data for admin dashboard
const generateDateRange = (days) => {
  const dates = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    dates.push(date.toISOString().split("T")[0]);
  }
  return dates;
};

// Generate revenue data for last 30 days
export const generateRevenueData = (days = 30) => {
  const dates = generateDateRange(days);
  return dates.map((date) => ({
    date,
    revenue: Math.floor(Math.random() * 5000) + 1000,
    orders: Math.floor(Math.random() * 50) + 10,
  }));
};

// Mock orders
export const mockOrders = [
  {
    id: "ORD-001",
    customer: { name: "John Doe", email: "john@example.com" },
    date: "2024-01-15T10:30:00",
    status: "delivered",
    total: 1250.5,
    items: 5,
    paymentMethod: "creditCard",
  },
  {
    id: "ORD-002",
    customer: { name: "Jane Smith", email: "jane@example.com" },
    date: "2024-01-20T14:22:00",
    status: "shipped",
    total: 890.25,
    items: [
      {
        id: 1,
        productId: 1,
        name: "ABC Dry Powder Fire Extinguisher 6kg",
        quantity: 1,
        price: 1699,
        image: extRedImg,
      },
      {
        id: 2,
        productId: 2,
        name: "CO₂ Fire Extinguisher 4.5kg",
        quantity: 1,
        price: 3499,
        image: extBlackImg,
      },
    ],
    paymentMethod: "upi",
  },
  {
    id: "ORD-003",
    customer: { name: "Bob Johnson", email: "bob@example.com" },
    date: "2024-01-22T09:15:00",
    status: "processing",
    total: 450.0,
    items: 2,
    paymentMethod: "wallet",
  },
  {
    id: "ORD-004",
    customer: { name: "Alice Brown", email: "alice@example.com" },
    date: "2024-01-10T16:45:00",
    status: "cancelled",
    total: 320.5,
    items: 1,
    paymentMethod: "debitCard",
  },
  {
    id: "ORD-005",
    customer: { name: "Charlie Wilson", email: "charlie@example.com" },
    date: "2024-01-18T11:20:00",
    status: "delivered",
    total: 1750.75,
    items: 7,
    paymentMethod: "creditCard",
  },
  {
    id: "ORD-006",
    customer: { name: "Diana Prince", email: "diana@example.com" },
    date: "2024-01-21T13:10:00",
    status: "pending",
    total: 650.0,
    items: 4,
    paymentMethod: "upi",
  },
  {
    id: "ORD-007",
    customer: { name: "Emma Davis", email: "emma@example.com" },
    date: "2024-01-19T15:30:00",
    status: "delivered",
    total: 1120.0,
    items: 3,
    paymentMethod: "wallet",
  },
  {
    id: "ORD-008",
    customer: { name: "Frank Miller", email: "frank@example.com" },
    date: "2024-01-17T09:45:00",
    status: "shipped",
    total: 780.5,
    items: 2,
    paymentMethod: "cash",
  },
  {
    id: "ORD-009",
    customer: { name: "Grace Lee", email: "grace@example.com" },
    date: "2024-01-16T11:20:00",
    status: "delivered",
    total: 950.25,
    items: 4,
    paymentMethod: "debitCard",
  },
  {
    id: "ORD-010",
    customer: { name: "Henry Brown", email: "henry@example.com" },
    date: "2024-01-14T14:15:00",
    status: "delivered",
    total: 1350.75,
    items: 5,
    paymentMethod: "creditCard",
  },
];

// Top products
export const topProducts = [
  {
    id: 1,
    name: "ABC Dry Powder Fire Extinguisher 6kg",
    sales: 245,
    revenue: 416255,
    stock: 45,
  },
  {
    id: 2,
    name: "CO₂ Carbon Dioxide Fire Extinguisher 4.5kg",
    sales: 189,
    revenue: 661311,
    stock: 120,
  },
  {
    id: 3,
    name: "AFFF Foam Fire Extinguisher 9 Litre",
    sales: 156,
    revenue: 358644,
    stock: 35,
  },
  {
    id: 4,
    name: "Commercial Fire Blanket 1.8m x 1.8m",
    sales: 142,
    revenue: 127658,
    stock: 65,
  },
  {
    id: 5,
    name: "Photoelectric Smoke Alarm Sensor",
    sales: 128,
    revenue: 102272,
    stock: 80,
  },
];

// Customers data
export const mockCustomers = [
  {
    id: 1,
    name: "John Doe",
    email: "john@example.com",
    orders: 12,
    totalSpent: 5600.5,
  },
  {
    id: 2,
    name: "Jane Smith",
    email: "jane@example.com",
    orders: 8,
    totalSpent: 3200.25,
  },
  {
    id: 3,
    name: "Bob Johnson",
    email: "bob@example.com",
    orders: 15,
    totalSpent: 7800.0,
  },
];

// Mock return requests
export const mockReturnRequests = [
  {
    id: "RET-001",
    orderId: "ORD-001",
    customer: {
      name: "John Doe",
      email: "john@example.com",
      phone: "+1234567890",
    },
    requestDate: "2024-01-20T10:30:00",
    items: [
      {
        id: 1,
        name: "ABC Dry Powder Fire Extinguisher 6kg",
        quantity: 1,
        price: 1699,
        reason: "Defective",
        image: extRedImg,
      },
    ],
    reason: "Gauge Pressure Low",
    description: "Pressure gauge arrived showing below recommended green line",
    refundAmount: 1699,
    status: "pending",
    refundStatus: "pending",
    createdAt: "2024-01-20T10:30:00",
    updatedAt: "2024-01-20T10:30:00",
  },
  {
    id: "RET-002",
    orderId: "ORD-002",
    customer: {
      name: "Jane Smith",
      email: "jane@example.com",
      phone: "+1234567891",
    },
    requestDate: "2024-01-18T14:22:00",
    items: [
      {
        id: 2,
        name: "CO₂ Carbon Dioxide Fire Extinguisher 4.5kg",
        quantity: 1,
        price: 3499,
        reason: "Damaged Seal",
        image: extBlackImg,
      },
    ],
    reason: "Damaged Safety Pin Seal",
    description: "Safety seal was broken during transit",
    refundAmount: 3499,
    status: "approved",
    refundStatus: "processed",
    createdAt: "2024-01-18T14:22:00",
    updatedAt: "2024-01-19T09:15:00",
  },
  {
    id: "RET-003",
    orderId: "ORD-003",
    customer: {
      name: "Bob Johnson",
      email: "bob@example.com",
      phone: "+1234567892",
    },
    requestDate: "2024-01-22T09:15:00",
    items: [
      {
        id: 3,
        name: "Floral Summer Dress",
        quantity: 1,
        price: 450,
        reason: "Not as Described",
        image: "/api/placeholder/100/100",
      },
      {
        id: 4,
        name: "Leather Crossbody Bag",
        quantity: 1,
        price: 800,
        reason: "Defective",
        image: "/api/placeholder/100/100",
      },
    ],
    reason: "Not as Described",
    description:
      "Products do not match the description and images on the website",
    refundAmount: 1250,
    status: "processing",
    refundStatus: "pending",
    createdAt: "2024-01-22T09:15:00",
    updatedAt: "2024-01-22T11:30:00",
  },
  {
    id: "RET-004",
    orderId: "ORD-004",
    customer: {
      name: "Alice Brown",
      email: "alice@example.com",
      phone: "+1234567893",
    },
    requestDate: "2024-01-10T16:45:00",
    items: [
      {
        id: 5,
        name: "Commercial Fire Blanket 1.8m x 1.8m",
        quantity: 1,
        price: 899,
        reason: "Defective Pouch",
        image: extRedImg,
      },
    ],
    reason: "Damaged Pouch Pouch",
    description: "Wall mounting pouch tear upon arrival",
    refundAmount: 320,
    status: "rejected",
    refundStatus: "pending",
    createdAt: "2024-01-10T16:45:00",
    updatedAt: "2024-01-12T10:20:00",
    rejectionReason: "Product was used and damaged by customer",
  },
  {
    id: "RET-005",
    orderId: "ORD-005",
    customer: {
      name: "Charlie Wilson",
      email: "charlie@example.com",
      phone: "+1234567894",
    },
    requestDate: "2024-01-15T11:20:00",
    items: [
      {
        id: 6,
        name: "Classic White T-Shirt",
        quantity: 2,
        price: 500,
        reason: "Wrong Size",
        image: "/api/placeholder/100/100",
      },
      {
        id: 7,
        name: "Slim Fit Blue Jeans",
        quantity: 1,
        price: 890,
        reason: "Defective",
        image: "/api/placeholder/100/100",
      },
    ],
    reason: "Wrong Size",
    description: "Both items are smaller than expected",
    refundAmount: 1890,
    status: "completed",
    refundStatus: "processed",
    createdAt: "2024-01-15T11:20:00",
    updatedAt: "2024-01-17T14:00:00",
  },
  {
    id: "RET-006",
    orderId: "ORD-006",
    customer: {
      name: "Diana Prince",
      email: "diana@example.com",
      phone: "+1234567895",
    },
    requestDate: "2024-01-21T13:10:00",
    items: [
      {
        id: 8,
        name: "Floral Summer Dress",
        quantity: 1,
        price: 650,
        reason: "Not as Described",
        image: "/api/placeholder/100/100",
      },
    ],
    reason: "Not as Described",
    description: "Color is completely different from the website image",
    refundAmount: 650,
    status: "pending",
    refundStatus: "pending",
    createdAt: "2024-01-21T13:10:00",
    updatedAt: "2024-01-21T13:10:00",
  },
];

// Analytics summary
export const getAnalyticsSummary = () => {
  const revenueData = generateRevenueData(30);
  const totalRevenue = revenueData.reduce((sum, d) => sum + d.revenue, 0);
  const totalOrders = revenueData.reduce((sum, d) => sum + d.orders, 0);
  const previousPeriodRevenue = generateRevenueData(30).reduce(
    (sum, d) => sum + d.revenue,
    0
  );
  const revenueChange =
    ((totalRevenue - previousPeriodRevenue) / previousPeriodRevenue) * 100;

  return {
    totalRevenue,
    totalOrders,
    totalProducts: 298, // from products.js
    totalCustomers: mockCustomers.length,
    revenueChange: revenueChange.toFixed(2),
    ordersChange: 12.5, // Mock
    productsChange: 5.2, // Mock
    customersChange: 8.3, // Mock
  };
};

export default {
  generateRevenueData,
  mockOrders,
  topProducts,
  mockCustomers,
  mockReturnRequests,
  getAnalyticsSummary,
};
