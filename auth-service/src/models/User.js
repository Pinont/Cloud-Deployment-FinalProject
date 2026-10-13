const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  name: { type: String, required: true, trim: true },
  role: { type: String, enum: ['user', 'owner', 'admin'], default: 'user' },
  failedLogins: { type: Number, default: 0 },
});

/**
 * Return public account details without the password hash or login counters.
 * @returns {Object} The user's id, email, name, and role.
 */
userSchema.methods.toPublic = function toPublic() {
  return { id: this._id, email: this.email, name: this.name, role: this.role };
};

module.exports = mongoose.model('User', userSchema);
