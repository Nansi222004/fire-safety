import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    variant: {
        size: String,
        color: String,
        material: String,
        selection: {
            type: Map,
            of: String
        }
    },
    quantity: {
        type: Number,
        required: true,
        min: 1,
        default: 1
    },
    priceAtAddition: {
        type: Number
    }
}, { _id: true });

const cartSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
        index: true
    },
    items: [cartItemSchema],
    totalItems: {
        type: Number,
        default: 0
    },
    totalAmount: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

// Middleware to update totals
cartSchema.pre('save', function(next) {
    this.totalItems = this.items.reduce((sum, item) => sum + item.quantity, 0);
    next();
});

const Cart = mongoose.model('Cart', cartSchema);
export default Cart;
