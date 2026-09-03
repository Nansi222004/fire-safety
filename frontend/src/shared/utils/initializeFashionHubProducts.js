import { products as initialProducts } from "../../data/products";

/**
 * Initialize Fire Safety products for vendor catalog
 */
export const initializeFashionHubProducts = () => {
  const savedProducts = localStorage.getItem("admin-products");
  const existingProducts = savedProducts
    ? JSON.parse(savedProducts)
    : initialProducts;

  if (!savedProducts) {
    localStorage.setItem("admin-products", JSON.stringify(initialProducts));
  }

  return {
    productsAdded: 0,
    totalProducts: existingProducts.length,
  };
};
