const express = require('express');
const router = express.Router();
const Allocation = require('../models/Allocation');
const Asset = require('../models/Asset');

// POST new allocation
router.post('/', async (req, res) => {
  try {
    const { employeeName, assetTagNumber, assignDate, expectedReturnDate, issueNotes, digitalSignatureRequested } = req.body;

    // Verify Asset exists and is In Stock
    const asset = await Asset.findOne({ assetTagNumber });
    if (!asset) {
      return res.status(404).json({ message: 'Asset not found in database.' });
    }
    if (asset.status !== 'In Stock') {
      return res.status(400).json({ message: `Asset is currently ${asset.status} and cannot be allocated.` });
    }

    // Create Allocation
    const allocation = new Allocation({
      employeeName,
      assetTagNumber,
      assignDate,
      expectedReturnDate,
      issueNotes,
      digitalSignatureRequested
    });
    const savedAllocation = await allocation.save();

    // Update Asset Status to 'In Use'
    asset.status = 'In Use';
    asset.assignedToName = employeeName;
    await asset.save();

    res.status(201).json({ message: 'Asset successfully allocated!', allocation: savedAllocation });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// GET all active allocations
router.get('/', async (req, res) => {
  try {
    let allocations = await Allocation.find().sort({ assignDate: -1 });

    if (req.query.ownership && req.query.ownership !== 'All') {
      const assets = await Asset.find({ ownership: req.query.ownership }).select('assetTagNumber');
      const validAssetTags = assets.map(a => a.assetTagNumber);
      allocations = allocations.filter(alloc => validAssetTags.includes(alloc.assetTagNumber));
    }

    res.json(allocations);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT update allocation
router.put('/:id', async (req, res) => {
  try {
    const updatedAllocation = await Allocation.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!updatedAllocation) return res.status(404).json({ message: 'Allocation not found' });
    res.json(updatedAllocation);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE allocation
router.delete('/:id', async (req, res) => {
  try {
    const allocation = await Allocation.findByIdAndDelete(req.params.id);
    if (!allocation) return res.status(404).json({ message: 'Allocation not found' });
    res.json({ message: 'Allocation deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
