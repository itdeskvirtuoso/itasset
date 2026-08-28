const express = require('express');
const router = express.Router();
const Return = require('../models/Return');
const Allocation = require('../models/Allocation');
const Asset = require('../models/Asset');

// POST process a return
router.post('/', async (req, res) => {
  try {
    const { assetTagNumber, employeeName, returnDate, deviceCondition, missingAccessories, penaltyAmount, notes } = req.body;

    // Verify Asset exists
    const asset = await Asset.findOne({ assetTagNumber });
    if (!asset) {
      return res.status(404).json({ message: 'Asset not found in database.' });
    }

    // Find active allocation (if any)
    const activeAllocation = await Allocation.findOne({ assetTagNumber, status: 'Active' });

    if (!activeAllocation) {
      return res.status(400).json({ message: 'Asset is not allocated to anyone, it cannot be returned.' });
    }

    let finalEmployeeName = employeeName;
    if (!finalEmployeeName) {
      finalEmployeeName = activeAllocation.employeeName;
    }

    // Create Return Record
    const returnRecord = new Return({
      assetTagNumber,
      employeeName: finalEmployeeName,
      returnDate,
      deviceCondition,
      missingAccessories,
      penaltyAmount,
      notes
    });
    const savedReturn = await returnRecord.save();

    // Update Asset Status based on condition
    if (['Poor', 'Damaged', 'Scrap'].includes(deviceCondition)) {
      asset.status = 'Under Repair';
    } else {
      asset.status = 'In Stock';
    }
    // We no longer clear assignedToName so the user can see who it was last assigned to.
    await asset.save();

    // Mark active allocation as returned
    if (activeAllocation) {
      activeAllocation.status = 'Returned';
      await activeAllocation.save();
    }

    res.status(201).json({ message: 'Asset successfully returned!', returnRecord: savedReturn });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// GET all returns
router.get('/', async (req, res) => {
  try {
    let returns = await Return.find().sort({ returnDate: -1 }).lean();

    if (req.query.ownership && req.query.ownership !== 'All') {
      const assets = await Asset.find({ ownership: req.query.ownership }).select('assetTagNumber').lean();
      const validAssetTags = assets.map(a => a.assetTagNumber);
      returns = returns.filter(ret => validAssetTags.includes(ret.assetTagNumber));
    }

    res.json(returns);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT update return
router.put('/:id', async (req, res) => {
  try {
    const updatedReturn = await Return.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!updatedReturn) return res.status(404).json({ message: 'Return not found' });
    res.json(updatedReturn);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE return
router.delete('/:id', async (req, res) => {
  try {
    const returnRecord = await Return.findByIdAndDelete(req.params.id);
    if (!returnRecord) return res.status(404).json({ message: 'Return not found' });
    res.json({ message: 'Return deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
