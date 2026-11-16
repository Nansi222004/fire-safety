import { FiHeart } from "react-icons/fi";
import toast from "react-hot-toast";
import { useWishlistStore } from "../../store/wishlistStore";

// Heart toggle for the small "similar product" cards. Same behaviour as MobileProductCard's heart;
// stops the click so the card's own "open product" navigation doesn't fire.
const CompactWishlistButton = ({ product, className = "" }) => {
  const { addItem, removeItem, isInWishlist } = useWishlistStore();
  const isFavorite = isInWishlist(product.id);

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isFavorite) {
      removeItem(product.id);
      toast.success("Removed from wishlist");
      return;
    }
    const added = addItem({ id: product.id, name: product.name, price: product.price, image: product.image });
    if (added) toast.success("Added to wishlist");
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={isFavorite ? "Remove from wishlist" : "Add to wishlist"}
      className={className}
    >
      <FiHeart className={`text-xs ${isFavorite ? "text-red-500 fill-red-500" : "text-gray-400"}`} />
    </button>
  );
};

export default CompactWishlistButton;
