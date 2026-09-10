import PolicyEditor from './PolicyEditor';

const DEFAULT_CONTENT = `Delivery Partner Privacy Policy

Last updated: ${new Date().toLocaleDateString()}

1. Information We Collect
We collect delivery partner identification, contact information, vehicle details, driving license, and KYC credentials required to register and operate on the SafeFire logistics network.

2. Location Tracking & Telematics
Real-time GPS location data is collected solely during active duty (when toggled "Online") and while executing delivery or return pickup routes to calculate transit times and assign nearest safety orders.

3. Payout & Financial Data
Bank account details and settlement records are encrypted and processed securely for delivery earnings payouts.

4. Data Protection & Security
Partner data is confidential, never sold to third parties, and only shared with customers and vendors as necessary to fulfill emergency equipment deliveries.`;

const DeliveryPrivacyPolicy = () => {
  return (
    <PolicyEditor 
      title="Delivery Partner Privacy Policy" 
      policyKey="delivery-privacy" 
      defaultContent={DEFAULT_CONTENT} 
    />
  );
};

export default DeliveryPrivacyPolicy;
