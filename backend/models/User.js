const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['Super Admin', 'User 1', 'User 2'],
    required: true
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  phone: {
    type: String,
    trim: true
  },
  employeeId: {
    type: String,
    trim: true
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
