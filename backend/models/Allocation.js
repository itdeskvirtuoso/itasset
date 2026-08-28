const mongoose = require('mongoose');

const AllocationSchema = new mongoose.Schema({
    employeeName: { type: String, required: true },
    assetTagNumber: { type: String, required: true },
    assignDate: { type: Date, required: true },
    expectedReturnDate: { type: Date },
    issueNotes: { type: String },
    digitalSignatureRequested: { type: Boolean, default: false },
    status: { type: String, enum: ['Active', 'Returned'], default: 'Active' }
}, { timestamps: true });

// Add performance indexes
AllocationSchema.index({ assetTagNumber: 1 });
AllocationSchema.index({ employeeName: 1 });
AllocationSchema.index({ status: 1 });

module.exports = mongoose.model('Allocation', AllocationSchema);
