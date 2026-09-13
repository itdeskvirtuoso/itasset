const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Allocation = require('../models/Allocation');
const Asset = require('../models/Asset');
const auth = require('../middleware/auth');
const checkPermission = require('../middleware/roleCheck');
const { toStr, sendError } = require('../utils/security');

router.use(auth);
const canManage = checkPermission('allocations.html');

// Moves a device into use for an employee, but only if it is still in stock.
// Returns the asset as it was before the change (null when it was not available).
function claimAsset(assetTagNumber, employeeName) {
  return Asset.findOneAndUpdate(
    { assetTagNumber, status: 'In Stock' },
    { $set: { status: 'In Use', assignedToName: employeeName } },
    { new: false }
  ).lean();
}

async function unavailableMessage(assetTagNumber) {
  const asset = await Asset.findOne({ assetTagNumber }).select('status').lean();
  return asset
    ? { status: 400, message: `Asset is currently ${asset.status} and cannot be allocated.` }
    : { status: 404, message: 'Asset not found in database.' };
}

// Sends an asset back to stock after its allocation is cancelled
async function releaseAsset(assetTagNumber, employeeName) {
  const asset = await Asset.findOne({ assetTagNumber, status: 'In Use' }).select('assignedToName').lean();
  if (!asset) return;
  const set = { status: 'In Stock' };
  if (asset.assignedToName === employeeName) set.assignedToName = '';
  await Asset.updateOne({ _id: asset._id }, { $set: set });
}

// POST new allocation
router.post('/', canManage, async (req, res) => {
  try {
    const employeeName = toStr(req.body.employeeName);
    const assetTagNumber = toStr(req.body.assetTagNumber);
    if (!employeeName || !assetTagNumber) {
      return res.status(400).json({ message: 'Employee name and asset tag are required.' });
    }

    const openAllocation = await Allocation.findOne({ assetTagNumber, status: 'Active' }).select('employeeName').lean();
    if (openAllocation) {
      return res.status(400).json({ message: `This asset is still allocated to ${openAllocation.employeeName}. Process its return first.` });
    }

    const allocation = new Allocation({
      employeeName,
      assetTagNumber,
      assignDate: toStr(req.body.assignDate) || undefined,
      expectedReturnDate: toStr(req.body.expectedReturnDate) || undefined,
      issueNotes: toStr(req.body.issueNotes),
      digitalSignatureRequested: req.body.digitalSignatureRequested === true
    });
    await allocation.validate();

    // Claimed atomically, so two people can't allocate the same device at the same moment
    const previous = await claimAsset(assetTagNumber, employeeName);
    if (!previous) {
      const { status, message } = await unavailableMessage(assetTagNumber);
      return res.status(status).json({ message });
    }

    try {
      await allocation.save();
    } catch (err) {
      await Asset.updateOne({ _id: previous._id }, { $set: { status: previous.status, assignedToName: previous.assignedToName || '' } });
      throw err;
    }

    res.status(201).json({ message: 'Asset successfully allocated!', allocation });
  } catch (err) {
    sendError(res, err, 'allocations/create');
  }
});

// GET all allocations
router.get('/', async (req, res) => {
  try {
    const filter = {};
    const ownership = toStr(req.query.ownership);
    if (ownership && ownership !== 'All') {
      const tags = await Asset.distinct('assetTagNumber', { ownership });
      filter.assetTagNumber = { $in: tags };
    }

    const allocations = await Allocation.find(filter).sort({ assignDate: -1 }).lean();
    res.json(allocations);
  } catch (err) {
    sendError(res, err, 'allocations/list');
  }
});

// PUT update allocation
router.put('/:id', canManage, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid allocation id.' });
    const allocation = await Allocation.findById(req.params.id);
    if (!allocation) return res.status(404).json({ message: 'Allocation not found' });

    const oldTag = allocation.assetTagNumber;
    const oldName = allocation.employeeName;
    const body = req.body || {};

    if (body.employeeName !== undefined) allocation.employeeName = toStr(body.employeeName);
    if (body.assetTagNumber !== undefined) allocation.assetTagNumber = toStr(body.assetTagNumber);
    if (body.assignDate !== undefined) allocation.assignDate = toStr(body.assignDate) || undefined;
    if (body.expectedReturnDate !== undefined) allocation.expectedReturnDate = toStr(body.expectedReturnDate) || null;
    if (body.issueNotes !== undefined) allocation.issueNotes = toStr(body.issueNotes);
    if (body.digitalSignatureRequested !== undefined) allocation.digitalSignatureRequested = body.digitalSignatureRequested === true;
    await allocation.validate();

    // Keep the device records in step with an open allocation
    if (allocation.status === 'Active' && allocation.assetTagNumber !== oldTag) {
      const clash = await Allocation.exists({ _id: { $ne: allocation._id }, assetTagNumber: allocation.assetTagNumber, status: 'Active' });
      if (clash) return res.status(400).json({ message: 'The new asset is already allocated to someone else.' });
      const previous = await claimAsset(allocation.assetTagNumber, allocation.employeeName);
      if (!previous) {
        const { status, message } = await unavailableMessage(allocation.assetTagNumber);
        return res.status(status).json({ message });
      }
      await releaseAsset(oldTag, oldName);
    } else if (allocation.status === 'Active' && allocation.employeeName !== oldName) {
      await Asset.updateOne({ assetTagNumber: allocation.assetTagNumber, status: 'In Use' }, { $set: { assignedToName: allocation.employeeName } });
    }

    await allocation.save();
    res.json(allocation);
  } catch (err) {
    sendError(res, err, 'allocations/update');
  }
});

// DELETE allocation — deleting an open allocation cancels it and returns the device to stock
router.delete('/:id', canManage, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid allocation id.' });
    const allocation = await Allocation.findByIdAndDelete(req.params.id);
    if (!allocation) return res.status(404).json({ message: 'Allocation not found' });

    let assetReleased = false;
    if (allocation.status === 'Active') {
      await releaseAsset(allocation.assetTagNumber, allocation.employeeName);
      assetReleased = true;
    }

    res.json({
      message: assetReleased
        ? `Allocation deleted. Asset ${allocation.assetTagNumber} is back In Stock.`
        : 'Allocation deleted successfully',
      assetReleased
    });
  } catch (err) {
    sendError(res, err, 'allocations/delete');
  }
});

module.exports = router;
