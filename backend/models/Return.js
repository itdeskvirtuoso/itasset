const mongoose = require('mongoose');

const ReturnSchema = new mongoose.Schema({
    assetTagNumber: { type: String, required: true },
    employeeName: { type: String, required: true },
    returnDate: { type: Date, default: Date.now },
    deviceCondition: { type: String, enum: ['Excellent', 'Good', 'Fair', 'Poor', 'Damaged', 'Scrap'], required: true },
    missingAccessories: { type: String },
    penaltyAmount: { type: Number, default: 0, min: 0 },
    notes: { type: String },
    // The allocation this return closed, so deleting the return can reopen it
    allocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Allocation' }
}, { timestamps: true });

// Add performance indexes
ReturnSchema.index({ assetTagNumber: 1 });
ReturnSchema.index({ employeeName: 1 });

module.exports = mongoose.model('Return', ReturnSchema);
