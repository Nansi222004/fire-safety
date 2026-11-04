import { useSettingsStore } from "../store/settingsStore";

export const CUSTOMER_CARE_PATH = "/customer-care";
export const DEFAULT_SUPPORT_HOURS = "Available 24x7";

const WHATSAPP_GREETING = "Hi, I need help from customer support.";

/** Customer care contact details from Admin → Settings → General, ready to use in links. */
const useCustomerCare = () => {
  const general = useSettingsStore((state) => state.settings?.general || {});
  const phone = general.contactPhone || general.supportPhone || "";
  const whatsappDigits = (general.whatsappPhone || phone).replace(/\D/g, "");
  const configuredEmail = general.contactEmail || general.supportEmail || "";
  // The settings fall back to a placeholder address until the admin saves a real one.
  const email = configuredEmail.endsWith("@example.com") ? "" : configuredEmail;
  const phoneDigits = phone.replace(/[^\d+]/g, "");

  return {
    phone,
    email,
    hours: general.supportHours || DEFAULT_SUPPORT_HOURS,
    phoneHref: phoneDigits ? `tel:${phoneDigits}` : "",
    whatsappHref: whatsappDigits
      ? `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(WHATSAPP_GREETING)}`
      : "",
    emailHref: email ? `mailto:${email}` : "",
  };
};

export default useCustomerCare;
