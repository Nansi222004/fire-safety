import { createPortal } from "react-dom";
import { FaWhatsapp } from "react-icons/fa";
import { FiPhoneCall } from "react-icons/fi";
import { useSettingsStore } from "../../../../shared/store/settingsStore";

const FloatingContactButtons = () => {
  const general = useSettingsStore((state) => state.settings?.general || {});
  const phone = general.contactPhone || general.supportPhone || "";
  const whatsappPhone = general.whatsappPhone || phone;
  const phoneHref = phone.replace(/[^\d+]/g, "");
  const whatsappDigits = whatsappPhone.replace(/\D/g, "");

  if (!phoneHref && !whatsappDigits) return null;

  return createPortal(
    <div className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[9997] flex flex-col gap-3 md:hidden">
      {phoneHref && (
        <a
          href={`tel:${phoneHref}`}
          aria-label={`Call customer support at ${phone}`}
          title="Call us"
          className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-white shadow-xl transition-transform hover:scale-105 active:scale-95"
        >
          <FiPhoneCall className="text-2xl" />
        </a>
      )}
      {whatsappDigits && (
        <a
          href={`https://wa.me/${whatsappDigits}?text=${encodeURIComponent("Hi, I need help from customer support.")}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Contact customer support on WhatsApp"
          title="Chat on WhatsApp"
          className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-white bg-[#25D366] text-white shadow-xl transition-transform hover:scale-105 active:scale-95"
        >
          <FaWhatsapp className="text-3xl" />
        </a>
      )}
    </div>,
    document.body
  );
};

export default FloatingContactButtons;
