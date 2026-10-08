/**
 * Product weight unit review / migration (SAFE, opt-in).
 *
 * Canonical unit: Product.weight is stored in GRAMS. The Admin product form always used grams,
 * but the Vendor product forms used to send kilograms unconverted (e.g. "5" for 5 kg). Those legacy
 * values cannot be distinguished from grams reliably, so nothing is converted automatically.
 *
 * Usage (from backend/):
 *   node src/scripts/reviewProductWeightUnits.js                    # dry run: list suspicious products
 *   node src/scripts/reviewProductWeightUnits.js --below=100         # change the review threshold (grams)
 *   node src/scripts/reviewProductWeightUnits.js --apply --ids=ID1,ID2
 *        # multiply ONLY the listed products by 1000 (kg → g) after you have confirmed them
 *
 * The threshold is only a review hint for humans; delivery routing never guesses units.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Product from '../models/Product.model.js';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
    const [k, v = 'true'] = arg.replace(/^--/, '').split('=');
    return [k, v];
}));
const below = Number(args.below) || 100;
const apply = args.apply === 'true';
const ids = String(args.ids || '').split(',').map((id) => id.trim()).filter(Boolean);

await mongoose.connect(process.env.MONGO_URI);
try {
    if (apply) {
        if (!ids.length) throw new Error('--apply requires --ids=<comma separated product ids> that you have reviewed.');
        const invalid = ids.filter((id) => !mongoose.isValidObjectId(id));
        if (invalid.length) throw new Error(`Invalid product ids: ${invalid.join(', ')}`);
        const products = await Product.find({ _id: { $in: ids } }).select('name weight').lean();
        for (const product of products) {
            const grams = Math.round(Number(product.weight) * 1000);
            await Product.updateOne({ _id: product._id }, { $set: { weight: grams } });
            console.log(`Converted ${product._id} "${product.name}": ${product.weight} → ${grams} g`);
        }
        console.log(`Done. ${products.length} product(s) updated.`);
    } else {
        const suspicious = await Product.find({ weight: { $lt: below } }).select('name weight vendorId updatedAt').sort({ updatedAt: -1 }).lean();
        console.log(`Products with weight < ${below} g (possibly entered in kg by the old vendor form): ${suspicious.length}`);
        for (const p of suspicious) {
            console.log(`  ${p._id}  weight=${p.weight}  "${p.name}"  vendor=${p.vendorId}  updated=${p.updatedAt?.toISOString?.().slice(0, 10)}`);
        }
        console.log('\nDry run only. Review the list, then run with --apply --ids=... for the products that are really in kg.');
    }
} finally {
    await mongoose.disconnect();
}
