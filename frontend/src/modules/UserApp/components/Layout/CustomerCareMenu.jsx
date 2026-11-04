import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { FaWhatsapp } from "react-icons/fa";
import { FiChevronDown, FiFileText, FiHeadphones, FiHelpCircle, FiPhoneCall } from "react-icons/fi";
import useCustomerCare, { CUSTOMER_CARE_PATH } from "../../../../shared/hooks/useCustomerCare";

const itemClass =
  "flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 rounded-xl transition-colors text-left text-gray-700 text-sm font-semibold";

/** Header "24x7 Customer Care" link with a hover / click dropdown of contact options. */
const CustomerCareMenu = () => {
  const { phone, hours, phoneHref, whatsappHref } = useCustomerCare();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setIsOpen(false);
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const close = () => setIsOpen(false);

  return (
    <div
      ref={menuRef}
      className="relative hidden lg:block shrink-0"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={close}
    >
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="group flex items-center gap-1.5 text-gray-600 hover:text-primary-600 transition-colors focus:outline-none"
        title="24x7 Customer Care"
      >
        <FiHeadphones className="text-xl lg:text-2xl p-0.5" />
        <span className="text-xs lg:text-sm font-semibold tracking-wide hidden xl:inline whitespace-nowrap">
          24x7 Customer Care
        </span>
        <FiChevronDown className={`hidden xl:inline text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            // pt-3 bridges the gap below the button so the menu stays open while the pointer moves into it.
            className="absolute right-0 top-full pt-3 z-[1000]"
          >
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-2.5 min-w-[260px]">
              <div className="px-3 py-2 border-b border-gray-100 mb-1.5">
                <p className="font-bold text-gray-800 text-sm">Customer Care</p>
                <p className="text-xs text-gray-500 mt-0.5">{hours}</p>
              </div>
              {phoneHref && (
                <a href={phoneHref} role="menuitem" onClick={close} className={itemClass}>
                  <FiPhoneCall className="text-[#E31E24] text-base" />
                  <span className="flex flex-col leading-tight">
                    Call us
                    <span className="text-xs font-medium text-gray-500">{phone}</span>
                  </span>
                </a>
              )}
              {whatsappHref && (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  role="menuitem"
                  onClick={close}
                  className={itemClass}
                >
                  <FaWhatsapp className="text-[#25D366] text-base" />
                  <span>Chat on WhatsApp</span>
                </a>
              )}
              <Link to="/support" role="menuitem" onClick={close} className={itemClass}>
                <FiFileText className="text-gray-500 text-base" />
                <span>Raise a ticket</span>
              </Link>
              <Link to="/policy/faq" role="menuitem" onClick={close} className={itemClass}>
                <FiHelpCircle className="text-gray-500 text-base" />
                <span>Help Center / FAQ</span>
              </Link>
              <Link
                to={CUSTOMER_CARE_PATH}
                role="menuitem"
                onClick={close}
                className="block mt-1.5 pt-2.5 border-t border-gray-100 px-3 pb-1 text-xs font-bold text-[#E31E24] hover:underline"
              >
                All contact options →
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CustomerCareMenu;
