const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
// Name removed
  username: {
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
    enum: ['Super Admin', 'Employee'],
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
