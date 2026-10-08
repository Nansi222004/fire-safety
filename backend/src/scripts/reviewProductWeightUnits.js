/**
 * Product weight unit review / explicit correction tool.
 *
 * Canonical unit: Product.weight is kilograms. This tool never infers or
 * automatically converts a product. Corrections must name the product id,
 * its expected current value, and the reviewed replacement value.
 *
 * Usage (from backend/):
 *   node src/scripts/reviewProductWeightUnits.js
 *   node src/scripts/reviewProductWeightUnits.js --apply \
 *     --corrections=PRODUCT_ID:EXPECTED_CURRENT_KG:REPLACEMENT_KG,...
 *
 * Example for a record known to contain the legacy value 500 grams:
 *   --corrections=64...abc:500:0.5
 *
 * The expected-current check makes the operation fail closed if a product was
 * edited after review. Routing never guesses units.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Product from '../models/Product.model.js';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
    const [k, v = 'true'] = arg.replace(/^--/, '').split('=');
    return [k, v];
}));
const apply = args.apply === 'true';

const parseCorrections = (value) => String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
        const [id, expectedRaw, replacementRaw] = entry.split(':');
        const expected = Number(expectedRaw);
        const replacement = Number(replacementRaw);
        if (!mongoose.isValidObjectId(id) || !Number.isFinite(expected) || !(replacement > 0)) {
            throw new Error(`Invalid correction "${entry}". Expected PRODUCT_ID:CURRENT_VALUE:KG_VALUE.`);
        }
        return { id, expected, replacement };
    });

await mongoose.connect(process.env.MONGO_URI);
try {
    if (apply) {
        const corrections = parseCorrections(args.corrections);
        if (!corrections.length) throw new Error('--apply requires --corrections=PRODUCT_ID:CURRENT_VALUE:KG_VALUE,...');

        const reviewed = [];
        for (const correction of corrections) {
            const product = await Product.findById(correction.id).select('name weight');
            if (!product) throw new Error(`Product ${correction.id} no longer exists.`);
            if (Number(product.weight) !== correction.expected) {
                throw new Error(`Product ${correction.id} changed after review: expected ${correction.expected}, found ${product.weight}. No corrections were applied.`);
            }
            reviewed.push({ product, correction });
        }

        const changed = [];
        for (const { product, correction } of reviewed) {
            product.weight = correction.replacement;
            await product.save();
            changed.push({ id: product._id, name: product.name, from: correction.expected, to: correction.replacement });
        }
        for (const item of changed) {
            console.log(`Corrected ${item.id} "${item.name}": ${item.from} → ${item.to} kg`);
        }
        console.log(`Done. ${changed.length} explicitly reviewed product(s) updated.`);
    } else {
        const products = await Product.find({}).select('name weight unit vendorId updatedAt').sort({ weight: 1, name: 1 }).lean();
        console.log(`Product weight review (canonical target: kg). ${products.length} product(s):`);
        for (const product of products) {
            console.log(`  ${product._id}  weight=${product.weight}  unit=${product.unit || '-'}  "${product.name}"  vendor=${product.vendorId}  updated=${product.updatedAt?.toISOString?.().slice(0, 10)}`);
        }
        console.log('\nDry run only. Apply only an explicit, reviewed PRODUCT_ID:CURRENT_VALUE:KG_VALUE correction list.');
    }
} finally {
    await mongoose.disconnect();
}
