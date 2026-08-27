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

module.exports = mongoose.model('Allocation', AllocationSchema);
