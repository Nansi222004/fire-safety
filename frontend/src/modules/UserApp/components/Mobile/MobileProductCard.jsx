import { FiHeart, FiShoppingBag, FiStar, FiTrash2, FiCheck } from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useCartStore, useUIStore } from "../../../../shared/store/useStore";
import { useWishlistStore } from "../../../../shared/store/wishlistStore";
import {
  formatPrice,
  getPlaceholderImage,
} from "../../../../shared/utils/helpers";
import toast from "react-hot-toast";
import LazyImage from "../../../../shared/components/LazyImage";
import { useState, useRef } from "react";
import useLongPress from "../../hooks/useLongPress";
import LongPressMenu from "./LongPressMenu";
import FlyingItem from "./FlyingItem";
import VendorBadge from "../../../Vendor/components/VendorBadge";
import { getVendorById } from "../../data/catalogData";
import { getVariantSignature } from "../../../../shared/utils/variant";

const MobileProductCard = ({ product }) => {
  const navigate = useNavigate();
  const { items, addItem, removeItem } = useCartStore();
  const openCart = useUIStore((state) => state.openCart);
  const {
    addItem: addToWishlist,
    removeItem: removeFromWishlist,
    isInWishlist,
  } = useWishlistStore();
  const hasNoVariant = (cartItem) => !getVariantSignature(cartItem?.variant || {});
  const isFavorite = isInWishlist(product.id);
  const isInCart = items.some(
    (item) => item.id === product.id && hasNoVariant(item)
  );
  const [isJustAdded, setIsJustAdded] = useState(false);
  const [justFavorited, setJustFavorited] = useState(false);
  const [showLongPressMenu, setShowLongPressMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [showFlyingItem, setShowFlyingItem] = useState(false);
  const [flyingItemPos, setFlyingItemPos] = useState({
    start: { x: 0, y: 0 },
    end: { x: 0, y: 0 },
  });
  const buttonRef = useRef(null);

  const handleAddToCart = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const hasDynamicAxes =
      Array.isArray(product?.variants?.attributes) &&
      product.variants.attributes.some((attr) => Array.isArray(attr?.values) && attr.values.length > 0);
    const hasSizeVariants = Array.isArray(product?.variants?.sizes) && product.variants.sizes.length > 0;
    const hasColorVariants = Array.isArray(product?.variants?.colors) && product.variants.colors.length > 0;
    if (hasDynamicAxes || hasSizeVariants || hasColorVariants) {
      toast.error("Please select variant on product page");
      navigate(`/product/${product.id}`);
      return;
    }

    const addedToCart = await addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      originalPrice: product.originalPrice,
      image: product.image,
      quantity: 1,
      stockQuantity: product.stockQuantity,
      vendorId: product.vendorId,
      vendorName: product.vendorName,
    });
    if (!addedToCart) return;

    setIsJustAdded(true);
    setTimeout(() => setIsJustAdded(false), 1200);

    const isLargeScreen = window.innerWidth >= 1024;
    if (!isLargeScreen) {
      const buttonRect = buttonRef.current?.getBoundingClientRect();
      const startX = buttonRect ? buttonRect.left + buttonRect.width / 2 : 0;
      const startY = buttonRect ? buttonRect.top + buttonRect.height / 2 : 0;

      setTimeout(() => {
        const cartBar = document.querySelector("[data-cart-bar]");
        let endX = window.innerWidth / 2;
        let endY = window.innerHeight - 100;

        if (cartBar) {
          const cartRect = cartBar.getBoundingClientRect();
          endX = cartRect.left + cartRect.width / 2;
          endY = cartRect.top + cartRect.height / 2;
        } else {
          const cartIcon = document.querySelector("[data-cart-icon]");
          if (cartIcon) {
            const cartRect = cartIcon.getBoundingClientRect();
            endX = cartRect.left + cartRect.width / 2;
            endY = cartRect.top + cartRect.height / 2;
          }
        }

        setFlyingItemPos({
          start: { x: startX, y: startY },
          end: { x: endX, y: endY },
        });
        setShowFlyingItem(true);
      }, 50);
    }
  };

  const handleRemoveFromCart = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    removeItem(product.id, {});
    toast.success("Removed from cart!");
  };

  const handleFavorite = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setJustFavorited(true);
    setTimeout(() => setJustFavorited(false), 500);

    if (isFavorite) {
      removeFromWishlist(product.id);
      toast.success("Removed from wishlist");
    } else {
      const addedToWishlist = addToWishlist({
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
      });
      if (addedToWishlist) {
        toast.success("Added to wishlist");
      }
    }
  };

  const handleLongPress = (e) => {
    const target = e?.currentTarget || e?.target;
    if (target && typeof target.getBoundingClientRect === 'function') {
      const rect = target.getBoundingClientRect();
      setMenuPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
      setShowLongPressMenu(true);
    } else if (e?.clientX && e?.clientY) {
      setMenuPosition({
        x: e.clientX,
        y: e.clientY,
      });
      setShowLongPressMenu(true);
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: product.name,
        text: `Check out ${product.name}`,
        url: window.location.origin + `/product/${product.id}`,
      });
    } else {
      navigator.clipboard.writeText(
        window.location.origin + `/product/${product.id}`
      );
      toast.success("Link copied to clipboard");
    }
  };

  const longPressHandlers = useLongPress(handleLongPress, 500);

  return (
    <>
      <motion.div
        whileTap={{ scale: 0.98 }}
        whileHover={{ y: -3 }}
        transition={{ duration: 0.2 }}
        className="glass-card rounded-2xl overflow-hidden mb-4 border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300"
        {...longPressHandlers}>
        <div className="flex gap-4 p-4">
          {/* Product Image */}
          <Link to={`/product/${product.id}`} className="w-24 h-24 flex-shrink-0 rounded-xl overflow-hidden bg-gray-100 block group">
            <LazyImage
              src={product.image}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
              onError={(e) => {
                e.target.src = getPlaceholderImage(200, 200, "Product");
              }}
            />
          </Link>

          {/* Product Info */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex items-start justify-between gap-2 mb-1">
              <Link to={`/product/${product.id}`} className="flex-1">
                <h3 className="font-bold text-gray-800 text-sm line-clamp-2 hover:text-primary-600 transition-colors">
                  {product.name}
                </h3>
              </Link>
              <motion.button
                type="button"
                onClick={handleFavorite}
                whileTap={{ scale: 0.85 }}
                whileHover={{ scale: 1.15 }}
                className="flex-shrink-0 p-1.5 hover:bg-gray-100 rounded-full transition-colors"
                aria-label={isFavorite ? "Remove from wishlist" : "Add to wishlist"}>
                <FiHeart
                  className={`text-lg transition-all duration-200 ${isFavorite ? "text-red-500 fill-red-500" : "text-gray-400 hover:text-red-400"
                    } ${justFavorited ? "animate-heart-pop text-red-500 fill-red-500" : ""}`}
                />
              </motion.button>
            </div>

            <p className="text-xs text-gray-500 mb-2">{product.unit}</p>

            {/* Vendor Badge */}
            {product.vendorId && (
              <div className="mb-2">
                <VendorBadge
                  vendor={getVendorById(product.vendorId)}
                  showVerified={true}
                  size="sm"
                  disableLink={true}
                />
              </div>
            )}

            {/* Rating */}
            {product.rating && (
              <div className="flex items-center gap-1 mb-2">
                <div className="flex items-center">
                  {[...Array(5)].map((_, i) => (
                    <FiStar
                      key={i}
                      className={`text-xs ${i < Math.floor(product.rating)
                        ? "text-yellow-400 fill-yellow-400"
                        : "text-gray-300"
                        }`}
                    />
                  ))}
                </div>
                <span className="text-xs text-gray-600 font-medium">
                  {product.rating} ({product.reviewCount || 0})
                </span>
              </div>
            )}

            {/* Price */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg font-bold text-gray-800">
                {formatPrice(product.price)}
              </span>
              {product.originalPrice && (
                <span className="text-xs text-gray-400 line-through font-medium">
                  {formatPrice(product.originalPrice)}
                </span>
              )}
            </div>

            {/* Add/Remove Button */}
            {isInCart ? (
              <motion.button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openCart();
                }}
                whileTap={{ scale: 0.95 }}
                className="w-full py-3 rounded-xl font-semibold text-sm bg-primary-50 text-primary-600 border border-primary-500 hover:bg-primary-100 transition-all duration-300 flex items-center justify-center gap-2">
                <FiShoppingBag className="text-base text-primary-600" />
                <span>Go to Cart</span>
              </motion.button>
            ) : (
              <motion.button
                ref={buttonRef}
                type="button"
                onClick={handleAddToCart}
                disabled={product.stock === "out_of_stock"}
                whileTap={{ scale: 0.96 }}
                whileHover={{ scale: 1.01 }}
                className={`w-full py-3 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center justify-center gap-2 ${product.stock === "out_of_stock"
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : isJustAdded
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                  : "gradient-green text-white hover:shadow-glow-green"
                  }`}>
                {isJustAdded ? (
                  <>
                    <FiCheck className="text-base" />
                    <span>Added!</span>
                  </>
                ) : (
                  <>
                    <FiShoppingBag className="text-base" />
                    <span>
                      {product.stock === "out_of_stock"
                        ? "Out of Stock"
                        : "Add to Cart"}
                    </span>
                  </>
                )}
              </motion.button>
            )}
          </div>
        </div>
      </motion.div>

      <LongPressMenu
        isOpen={showLongPressMenu}
        onClose={() => setShowLongPressMenu(false)}
        position={menuPosition}
        onAddToCart={handleAddToCart}
        onAddToWishlist={handleFavorite}
        onShare={handleShare}
        isInWishlist={isFavorite}
      />

      {showFlyingItem && (
        <FlyingItem
          image={product.image}
          startPosition={flyingItemPos.start}
          endPosition={flyingItemPos.end}
          onComplete={() => setShowFlyingItem(false)}
        />
      )}
    </>
  );
};

export default MobileProductCard;
