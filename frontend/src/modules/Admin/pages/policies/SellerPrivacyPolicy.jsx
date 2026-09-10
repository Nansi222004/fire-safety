import PolicyEditor from './PolicyEditor';

const DEFAULT_CONTENT = `Seller Partner Privacy Policy

Last updated: ${new Date().toLocaleDateString()}

1. Merchant Data Collection
We collect business registration details, GSTIN certificates, store manager contact info, and bank settlement details to verify and operate your merchant account on SafeFire.

2. Catalog & Pricing Confidentiality
Product inventory, wholesale margins, technician service logs, and internal business metrics are maintained with strict commercial confidentiality.

3. Payouts & Tax Compliance
Settlement and payout records are encrypted and retained as required by statutory financial regulations and tax compliance laws.

4. Data Sharing & Protection
Your proprietary merchant data is never sold, traded, or shared with competing sellers or unauthorized third parties.`;

const SellerPrivacyPolicy = () => {
  return (
    <PolicyEditor 
      title="Seller Partner Privacy Policy" 
      policyKey="seller-privacy" 
      defaultContent={DEFAULT_CONTENT} 
    />
  );
};

export default SellerPrivacyPolicy;
