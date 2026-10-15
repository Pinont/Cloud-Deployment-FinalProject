const mongoose = require('mongoose');
const { HHMM } = require('../utils/hours');

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
    openTime: { type: String, match: [HHMM, 'openTime must be HH:mm (00:00-23:59)'] },
    closeTime: { type: String, match: [HHMM, 'closeTime must be HH:mm (00:00-23:59)'] },
    ownerId: { type: String, required: true },
    avgRating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// #37 — opening hours only make sense as a pair.
restaurantSchema.pre('validate', function requireBothHours() {
  if (Boolean(this.openTime) !== Boolean(this.closeTime)) {
    this.invalidate('closeTime', 'openTime and closeTime must be set together');
  }
});

restaurantSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Restaurant', restaurantSchema);
