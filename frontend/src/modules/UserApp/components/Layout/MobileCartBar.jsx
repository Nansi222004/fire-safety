import { createPortal } from "react-dom";
import { useCartStore, useUIStore } from "../../../../shared/store/useStore";
import { FiShoppingBag, FiChevronRight } from "react-icons/fi";
import { formatPrice } from "../../../../shared/utils/helpers";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const MobileCartBar = () => {
  const { items, getTotal } = useCartStore();
  const toggleCart = useUIStore((state) => state.toggleCart);
  const cartAnimationTrigger = useUIStore(
    (state) => state.cartAnimationTrigger
  );
  const itemCount = useCartStore((state) => state.getItemCount());
  const total = getTotal();
  const [pulseAnimation, setPulseAnimation] = useState(false);

  useEffect(() => {
    if (cartAnimationTrigger > 0) {
      setPulseAnimation(true);
      setTimeout(() => setPulseAnimation(false), 600);
    }
  }, [cartAnimationTrigger]);

  if (itemCount === 0) {
    return null;
  }

  const cartBarContent = (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed right-4 md:right-8 z-[9998] safe-area-bottom bottom-[calc(4rem+10px)] md:bottom-8">
      <motion.button
        data-cart-bar
        onClick={toggleCart}
        className="h-13 md:h-14 px-4 md:px-5 rounded-full bg-[#E31E24] hover:bg-[#c6151b] text-white shadow-2xl flex items-center justify-center hover:shadow-3xl active:scale-[0.95] transition-all duration-300 group relative gap-2.5 border-2 border-white/20"
        animate={
          pulseAnimation
            ? {
              scale: [1, 1.08, 1],
            }
            : {}
        }
        transition={{ duration: 0.4 }}>
        <motion.div
          animate={
            pulseAnimation
              ? {
                rotate: [0, -10, 10, -10, 0],
              }
              : {}
          }
          transition={{ duration: 0.5 }}>
          <FiShoppingBag className="text-xl md:text-2xl text-white" />
        </motion.div>
        <span className="font-bold text-xs md:text-sm tracking-wide text-white">View Cart</span>
        <motion.span
          key={itemCount}
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          className="w-6 h-6 text-gray-900 rounded-full flex items-center justify-center text-xs font-black shadow-md border-2 border-white"
          style={{ backgroundColor: "#ffc101" }}>
          {itemCount > 9 ? "9+" : itemCount}
        </motion.span>
      </motion.button>
    </motion.div>
  );

  // Use portal to render outside of transformed containers (like PageTransition)
  return createPortal(cartBarContent, document.body);
};

export default MobileCartBar;
