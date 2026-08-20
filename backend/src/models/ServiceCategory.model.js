import mongoose from 'mongoose';

const serviceCategorySchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        slug: { type: String, required: true, unique: true },
        description: { type: String, trim: true, default: '' },
        image: { type: String, default: '' },
        sortOrder: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

serviceCategorySchema.index({ isActive: 1, sortOrder: 1, name: 1 });

const ServiceCategory = mongoose.model('ServiceCategory', serviceCategorySchema);
export { ServiceCategory };
export default ServiceCategory;
