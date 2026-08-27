const mongoose = require('mongoose');

const AssetSchema = new mongoose.Schema({
    srNo: { type: String },
    assetTagNumber: { type: String, required: true, unique: true },
    serialNumber: { type: String },
    deviceType: { type: String }, // Laptop, Desktop, Server, Monitor, etc.
    make: { type: String },
    softwareCategory: { type: String },
    model: { type: String },
    processor: { type: String },
    generation: { type: String },
    ram: { type: String },
    storage: { type: String },
    os: { type: String },
    macAddress: { type: String },
    ownership: { type: String, enum: ['Owned', 'Rental', 'VPEL', 'VIRTUOSO'], default: 'VIRTUOSO' },
    vendorName: { type: String },
    purchaseDate: { type: Date },
    warrantyEndDate: { type: Date },
    status: { 
        type: String, 
        enum: ['In Stock', 'In Use', 'Under Repair', 'Lost', 'Damaged', 'Returned', 'Scrapped'],
        default: 'In Stock'
    },
    assignedToName: { type: String, default: '' },
    employeeId: { type: String, default: '' },
    assignedBy: { type: String, default: '' },
    remark: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Asset', AssetSchema);
