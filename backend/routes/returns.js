const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Return = require('../models/Return');
const Allocation = require('../models/Allocation');
const Asset = require('../models/Asset');
const auth = require('../middleware/auth');
const checkPermission = require('../middleware/roleCheck');
const { toStr, sendError } = require('../utils/security');

router.use(auth);
const canManage = checkPermission('returns.html');

// Where a device goes after it comes back. "restock" is the form's
// "Auto-change status to In Stock" option; without it a good device waits as "Returned".
function statusAfterReturn(condition, restock) {
  if (condition === 'Scrap') return 'Scrapped';
  if (condition === 'Poor' || condition === 'Damaged') return 'Under Repair';
  return restock ? 'In Stock' : 'Returned';
}

const toPenalty = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
};

// POST process a return
router.post('/', canManage, async (req, res) => {
  try {
    const assetTagNumber = toStr(req.body.assetTagNumber);
    const deviceCondition = toStr(req.body.deviceCondition) || 'Good';
    const restock = req.body.autoRestock !== false;
    if (!assetTagNumber) return res.status(400).json({ message: 'Asset tag is required.' });

    // Verify Asset exists
    const asset = await Asset.findOne({ assetTagNumber }).select('_id').lean();
    if (!asset) {
      return res.status(404).json({ message: 'Asset not found in database.' });
    }

    const returnRecord = new Return({
      assetTagNumber,
      employeeName: toStr(req.body.employeeName) || 'Unknown',
      returnDate: toStr(req.body.returnDate) || undefined,
      deviceCondition,
      missingAccessories: toStr(req.body.missingAccessories),
      penaltyAmount: toPenalty(req.body.penaltyAmount),
      notes: toStr(req.body.notes)
    });
    await returnRecord.validate();

    // Close the open allocation atomically, so the same device can't be returned twice
    const allocation = await Allocation.findOneAndUpdate(
      { assetTagNumber, status: 'Active' },
      { $set: { status: 'Returned' } },
      { sort: { assignDate: -1 }, new: true }
    );
    if (!allocation) {
      return res.status(400).json({ message: 'Asset is not allocated to anyone, it cannot be returned.' });
    }

    if (!toStr(req.body.employeeName)) returnRecord.employeeName = allocation.employeeName;
    returnRecord.allocationId = allocation._id;
    try {
      await returnRecord.save();
    } catch (err) {
      await Allocation.updateOne({ _id: allocation._id }, { $set: { status: 'Active' } });
      throw err;
    }

    // assignedToName is kept so the user can see who it was last assigned to
    const assetStatus = statusAfterReturn(deviceCondition, restock);
    await Asset.updateOne({ _id: asset._id }, { $set: { status: assetStatus } });

    res.status(201).json({ message: `Asset successfully returned! Status is now ${assetStatus}.`, returnRecord, assetStatus });
  } catch (err) {
    sendError(res, err, 'returns/create');
  }
});

// GET all returns
router.get('/', async (req, res) => {
  try {
    const filter = {};
    const ownership = toStr(req.query.ownership);
    if (ownership && ownership !== 'All') {
      const tags = await Asset.distinct('assetTagNumber', { ownership });
      filter.assetTagNumber = { $in: tags };
    }

    const returns = await Return.find(filter).sort({ returnDate: -1 }).lean();
    res.json(returns);
  } catch (err) {
    sendError(res, err, 'returns/list');
  }
});

// PUT update return (the asset tag is fixed; delete and re-process a return to change it)
router.put('/:id', canManage, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid return id.' });
    const returnRecord = await Return.findById(req.params.id);
    if (!returnRecord) return res.status(404).json({ message: 'Return not found' });

    const body = req.body || {};
    const oldCondition = returnRecord.deviceCondition;
    if (body.employeeName !== undefined) returnRecord.employeeName = toStr(body.employeeName);
    if (body.returnDate !== undefined) returnRecord.returnDate = toStr(body.returnDate) || returnRecord.returnDate;
    if (body.deviceCondition !== undefined) returnRecord.deviceCondition = toStr(body.deviceCondition);
    if (body.missingAccessories !== undefined) returnRecord.missingAccessories = toStr(body.missingAccessories);
    if (body.penaltyAmount !== undefined) returnRecord.penaltyAmount = toPenalty(body.penaltyAmount);
    if (body.notes !== undefined) returnRecord.notes = toStr(body.notes);
    await returnRecord.save();

    // A corrected condition updates the device, unless it has already gone out again
    if (returnRecord.deviceCondition !== oldCondition) {
      const [asset, reallocated] = await Promise.all([
        Asset.findOne({ assetTagNumber: returnRecord.assetTagNumber }).select('status').lean(),
        Allocation.exists({ assetTagNumber: returnRecord.assetTagNumber, status: 'Active' })
      ]);
      if (asset && !reallocated && asset.status !== 'In Use') {
        const status = statusAfterReturn(returnRecord.deviceCondition, asset.status !== 'Returned');
        await Asset.updateOne({ _id: asset._id }, { $set: { status } });
      }
    }

    res.json(returnRecord);
  } catch (err) {
    sendError(res, err, 'returns/update');
  }
});

// DELETE return — undoes the return (reopens its allocation) when the device hasn't been reallocated since
router.delete('/:id', canManage, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid return id.' });
    const returnRecord = await Return.findByIdAndDelete(req.params.id);
    if (!returnRecord) return res.status(404).json({ message: 'Return not found' });

    let reopened = false;
    if (returnRecord.allocationId) {
      const [allocation, reallocated] = await Promise.all([
        Allocation.findById(returnRecord.allocationId).lean(),
        Allocation.exists({ assetTagNumber: returnRecord.assetTagNumber, status: 'Active' })
      ]);
      if (allocation && allocation.status === 'Returned' && !reallocated) {
        await Allocation.updateOne({ _id: allocation._id }, { $set: { status: 'Active' } });
        await Asset.updateOne(
          { assetTagNumber: returnRecord.assetTagNumber },
          { $set: { status: 'In Use', assignedToName: allocation.employeeName } }
        );
        reopened = true;
      }
    }

    res.json({
      message: reopened
        ? `Return deleted. Asset ${returnRecord.assetTagNumber} is back In Use.`
        : 'Return deleted successfully',
      reopened
    });
  } catch (err) {
    sendError(res, err, 'returns/delete');
  }
});

module.exports = router;
