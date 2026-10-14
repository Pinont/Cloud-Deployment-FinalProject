const mongoose = require('mongoose');

const restaurantSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'name is required'], trim: true },
    category: { type: String, trim: true, lowercase: true },
    priceRange: {
      type: Number,
      required: [true, 'priceRange is required'],
      min: [1, 'priceRange must be 1-4'],
      max: [4, 'priceRange must be 1-4'],
      validate: { validator: Number.isInteger, message: 'priceRange must be 1-4' },
    },
    address: { type: String, trim: true },
    ownerId: { type: String, required: true },
    avgRating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

restaurantSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Restaurant', restaurantSchema);
