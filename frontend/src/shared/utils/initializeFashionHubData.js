import { useOrderStore } from "../store/orderStore";
import { useCommissionStore } from "../store/commissionStore";
import { products } from "../../data/products";
import { getVendorById } from "../../data/vendors";

const extRedImg = "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=600&q=80";
const extBlackImg = "https://images.unsplash.com/photo-1599481238640-4c1288750d7a?auto=format&fit=crop&w=600&q=80";

/**
 * Initialize demo order data for Fire Safety vendor catalog
 */
export const initializeFashionHubData = () => {
  const orderStore = useOrderStore.getState();
  const commissionStore = useCommissionStore.getState();

  const existingOrders = orderStore.orders || [];
  const existingOrderIds = new Set(existingOrders.map((o) => o.id));

  const dummyOrders = [
    {
      id: "ORD-FS-001",
      userId: null,
      date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      status: "delivered",
      items: [
        {
          id: 1,
          productId: 1,
          name: "ABC Dry Powder Fire Extinguisher 6kg",
          quantity: 2,
          price: 1699,
          vendorId: 1,
          vendorName: "Demo Safety Equipment",
          image: extRedImg,
        },
      ],
      vendorItems: [
        {
          vendorId: 1,
          vendorName: "Demo Safety Equipment",
          items: [
            {
              id: 1,
              productId: 1,
              name: "ABC Dry Powder Fire Extinguisher 6kg",
              quantity: 2,
              price: 1699,
              image: extRedImg,
            },
          ],
          subtotal: 3398,
          shipping: 150,
          tax: 611,
          discount: 0,
        },
      ],
      shippingAddress: {
        name: "Demo Customer",
        street: "123 Safety Avenue",
        city: "Mumbai",
        state: "MH",
        zipCode: "400001",
        country: "India",
        phone: "+919876543210",
      },
      paymentMethod: "card",
      subtotal: 3398,
      shipping: 150,
      tax: 611,
      discount: 0,
      total: 4159,
      trackingNumber: "TRKFS001",
      estimatedDelivery: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];

  const newOrders = dummyOrders.filter((order) => !existingOrderIds.has(order.id));

  if (newOrders.length > 0) {
    useOrderStore.setState((state) => ({
      orders: [...state.orders, ...newOrders],
    }));
  }

  const finalOrderStore = useOrderStore.getState();

  return {
    ordersAdded: newOrders.length,
    totalOrders: finalOrderStore.orders.length,
  };
};
