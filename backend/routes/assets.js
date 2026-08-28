const express = require('express');
const router = express.Router();
const Asset = require('../models/Asset');
const Return = require('../models/Return');
const Allocation = require('../models/Allocation');
const multer = require('multer');
const XLSX = require('xlsx');

const fs = require('fs');
const os = require('os');
const upload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, os.tmpdir())
    },
    filename: function (req, file, cb) {
      cb(null, 'asset-import-' + Date.now() + '-' + file.originalname)
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.toLowerCase();
    if (ext.endsWith('.xlsx') || ext.endsWith('.xls') || ext.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx, .xls, and .csv files are allowed'));
    }
  }
});

// Sheets to skip during import
const SKIP_SHEETS = ['summary', 'o365 user list', 'o365', 'user list'];

// Flexible column name mapper — maps various Excel header names to schema fields
function findColumnValue(row, possibleNames) {
  for (const key of Object.keys(row)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const name of possibleNames) {
      if (normalized === name || normalized.includes(name)) {
        let val = row[key];
        if (typeof val === 'string') {
          const upperVal = val.trim().toUpperCase();
          if (upperVal === 'NA' || upperVal === 'N/A' || upperVal === '-') {
            return '';
          }
        }
        return val;
      }
    }
  }
  return undefined;
}

function mapRowToAsset(row, sheetDeviceType) {
  const srNo = findColumnValue(row, ['srno', 'slno', 'sno']) || '';
  const assetTagNumber = findColumnValue(row, ['assettag', 'tagno', 'tagnumber', 'assetno']) || '';
  const serialNumber = findColumnValue(row, ['serialnumber', 'serialno', 'assetsrno', 'assetserial', 'key', 'licensekey', 'serialkey']) || '';
  let make = findColumnValue(row, ['make', 'brand', 'manufacturer']) || '';
  let model = findColumnValue(row, ['model', 'modelno', 'modelnumber', 'softwarename', 'software']) || '';

  // Handle combined 'Make & Model' column
  if (!make && !model) {
    const combined = findColumnValue(row, ['makemodel', 'makeandmodel']) || '';
    if (combined) {
      // Try to split on common separators: first word as make, rest as model
      const parts = String(combined).trim().split(/\s+/);
      if (parts.length >= 2) {
        make = parts[0];
        model = parts.slice(1).join(' ');
      } else {
        model = String(combined).trim();
      }
    }
  }
  const processor = findColumnValue(row, ['processor', 'cpu']) || '';
  const generation = findColumnValue(row, ['generation', 'gen']) || '';
  const ram = findColumnValue(row, ['ram', 'memory']) || '';
  const storage = findColumnValue(row, ['storage', 'hdd', 'ssd', 'harddisk']) || '';
  const os = findColumnValue(row, ['os', 'operatingsystem']) || '';
  const employeeId = findColumnValue(row, ['employeeid', 'empid', 'id']) || '';
  let ownership = findColumnValue(row, ['ownership', 'owner', 'rentalagreement', 'company', 'organization', 'vendor', 'vpel/rental']) || '';
  const vendorName = findColumnValue(row, ['vendorname', 'vendor', 'supplier']) || '';
  const assignedToName = findColumnValue(row, ['username', 'assignedto', 'assignname', 'reportingtomanager', 'employeename', 'empname']) || '';
  const assignedBy = findColumnValue(row, ['assignedby', 'admin', 'givenby']) || '';
  const softwareCategory = findColumnValue(row, ['softwarecategory', 'category', 'softwaretype']) || '';
  const remark = findColumnValue(row, ['remark', 'remarks', 'notes', 'note']) || '';

  // Parse dates
  let purchaseDateVal = findColumnValue(row, ['purchasedate', 'dateofpurchase', 'purchaseon', 'start', 'assigndate']);
  let warrantyEndDateVal = findColumnValue(row, ['warrantyenddate', 'warrantyend', 'amcend', 'amcenddate', 'expire', 'expiry', 'renew', 'renewal', 'end', 'validdate', 'amcvalidupto', 'warrantyvalidupto', 'warrantyupto', 'amcupto', 'warranty']);

  let purchaseDate = parseExcelDate(purchaseDateVal, false);
  let warrantyEndDate = parseExcelDate(warrantyEndDateVal, true);

  // Magic fallback for Software sheet where user puts dates in the Remark column
  if (!warrantyEndDate) {
    const remarkVal = findColumnValue(row, ['remark', 'remarks']);
    if (remarkVal) {
      const fallbackDate = parseExcelDate(remarkVal, true);
      if (fallbackDate) warrantyEndDate = fallbackDate;
    }
  }

  // Excel date serial number conversion + robust string parser
  function parseExcelDate(val, preferLast = false) {
    if (!val) return undefined;
    if (typeof val === 'number') {
      // Excel serial date
      const d = XLSX.SSF.parse_date_code(val);
      if (d) return new Date(d.y, d.m - 1, d.d);
    }

    val = String(val).trim();

    // Fix common typos in Indian/English spelling of months
    val = val.replace(/saptember/gi, 'september')
      .replace(/augest/gi, 'august')
      .replace(/febuary/gi, 'february');

    // Extract dates using regex DD.MM.YYYY or DD/MM/YYYY
    const regex = /(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{4})/g;
    const matches = [...val.matchAll(regex)];

    if (matches.length > 0) {
      const match = preferLast ? matches[matches.length - 1] : matches[0];
      const day = parseInt(match[1]);
      const month = parseInt(match[2]) - 1;
      const year = parseInt(match[3]);
      return new Date(year, month, day);
    }

    // Try splitting by 'to' (e.g., '15.04.2026 to 14/04/2027')
    if (val.toLowerCase().includes(' to ')) {
      const parts = val.toLowerCase().split(' to ');
      val = preferLast ? parts[parts.length - 1].trim() : parts[0].trim();
    }

    // Clean up random text
    val = val.replace(/next renew in /gi, '').trim();

    const parsed = new Date(val);
    return isNaN(parsed.getTime()) ? undefined : parsed;
  }

  purchaseDate = parseExcelDate(purchaseDate, false);
  warrantyEndDate = parseExcelDate(warrantyEndDate, true);

  // Determine device type from sheet name or column
  let deviceType = findColumnValue(row, ['devicetype', 'device', 'type', 'assettype']) || sheetDeviceType || '';

  // Map status
  let rawStatus = findColumnValue(row, ['status', 'state', 'condition']);
  let assetStatus = 'In Stock';
  if (rawStatus && typeof rawStatus === 'string') {
    const s = rawStatus.toLowerCase();
    if (s.includes('active') || s.includes('in use') || s.includes('working')) {
      assetStatus = 'In Use';
    } else if (s.includes('repair') || s.includes('not working')) {
      assetStatus = 'Under Repair';
    } else if (s.includes('scrap') || s.includes('damage')) {
      assetStatus = 'Scrapped';
    } else if (s.includes('stock')) {
      assetStatus = 'In Stock';
    }
  }

  // Map ownership
  let ownershipVal = String(ownership).trim().toLowerCase();
  
  if (ownershipVal.includes('rent')) {
      ownershipVal = 'Rental';
  } else if (ownershipVal.includes('vpel') || ownershipVal.includes('virtuoso')) {
      ownershipVal = 'VIRTUOSO';
  } else {
      const ownershipMap = { 'owned': 'Owned', 'rental': 'Rental', 'vpel': 'VIRTUOSO', 'virtuoso': 'VIRTUOSO' };
      ownershipVal = ownershipMap[ownershipVal] || 'Owned';
  }

  // Smart status detection: If assigned to someone, it must be 'In Use'
  const finalAssignedToName = String(assignedToName).trim();
  if (assetStatus === 'In Stock') {
    if (finalAssignedToName && finalAssignedToName !== 'N/A' && finalAssignedToName !== '-') {
      assetStatus = 'In Use';
    } else if (!assetStatus) {
      assetStatus = 'In Stock';
    }
  }

  return {
    srNo: String(srNo).trim(),
    assetTagNumber: String(assetTagNumber).trim(),
    serialNumber: String(serialNumber).trim() || 'N/A',
    deviceType: String(deviceType).trim(),
    make: String(make).trim(),
    model: String(model).trim(),
    processor: String(processor).trim(),
    generation: String(generation).trim(),
    ram: String(ram).trim(),
    storage: String(storage).trim(),
    os: String(os).trim(),
    ownership: ownershipVal,
    vendorName: String(vendorName).trim(),
    purchaseDate,
    warrantyEndDate,
    status: assetStatus,
    assignedToName: String(finalAssignedToName).trim(),
    employeeId: String(employeeId).trim(),
    assignedBy: String(assignedBy).trim(),
    softwareCategory: String(softwareCategory).trim(),
    remark: String(remark).trim()
  };
}

// POST import Excel
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const workbook = XLSX.readFile(req.file.path, { cellDates: true });
    const allAssets = [];
    const sheetResults = {};

    for (const sheetName of workbook.SheetNames) {
      // Skip summary/user list sheets
      if (SKIP_SHEETS.some(s => sheetName.toLowerCase().includes(s))) {
        sheetResults[sheetName] = { status: 'skipped', reason: 'Non-data sheet' };
        continue;
      }

      // Determine device type from sheet name
      let sheetDeviceType = sheetName.trim();
      const typeMap = {
        'laptop': 'Laptop', 'laptops': 'Laptop',
        'desktop': 'Desktop', 'desktops': 'Desktop',
        'monitor': 'Monitor', 'monitors': 'Monitor',
        'server': 'Server', 'servers': 'Server',
        'printer': 'Printer', 'printers': 'Printer',
        'keyboard': 'Keyboard', 'keyboards': 'Keyboard',
        'mouse': 'Mouse', 'mice': 'Mouse',
        'networking': 'Networking Device', 'networking devices': 'Networking Device', 'network': 'Networking Device',
        'software': 'Software', 'softwares': 'Software'
      };
      sheetDeviceType = typeMap[sheetDeviceType.toLowerCase()] || sheetDeviceType;

      const sheet = workbook.Sheets[sheetName];

      // Dynamically find the actual header row (skip decorative title rows)
      const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 });


      let headerRowIndex = 0;
      for (let i = 0; i < Math.min(rawRows.length, 20); i++) {
        const rowData = rawRows[i];
        if (Array.isArray(rowData)) {
          const rowStr = rowData.join('').toLowerCase().replace(/[^a-z0-9]/g, '');
          // If the row contains multiple common asset headers, it's the header row
          const keywords = ['assettag', 'serial', 'device', 'model', 'make', 'software', 'username', 'department', 'macaddress', 'srno'];
          let matchCount = 0;
          keywords.forEach(k => {
            if (rowStr.includes(k)) matchCount++;
          });

          if (matchCount >= 2) {
            headerRowIndex = i;
            break;
          }
        }
      }

      let rows = XLSX.utils.sheet_to_json(sheet, { range: headerRowIndex, defval: '' });

      if (rows.length > 0) {
        // Check if the first row is actually a sub-header row (e.g. 'Start', 'End', 'HDD' under merged cells)
        const firstRowVals = Object.values(rows[0]).map(v => String(v).trim().toLowerCase());
        const isSubHeader = firstRowVals.includes('start') || firstRowVals.includes('end') || firstRowVals.includes('hdd') || firstRowVals.includes('ram') || firstRowVals.includes('license key') || firstRowVals.includes('assign date') || firstRowVals.includes('valid date') || firstRowVals.includes('key');

        if (isSubHeader) {
          const subHeaderRow = rows.shift(); // Remove it from data rows
          // Remap all subsequent rows to include the sub-header names in their keys
          for (let r = 0; r < rows.length; r++) {
            const newRow = {};
            for (const key of Object.keys(rows[r])) {
              let newKey = key;
              if (subHeaderRow[key] && typeof subHeaderRow[key] === 'string') {
                newKey = subHeaderRow[key];
              }
              newRow[newKey] = rows[r][key];
            }
            rows[r] = newRow;
          }
        }
      }

      let sheetCount = 0;
      let sheetSkippedReasons = [];
      for (const row of rows) {
        const asset = mapRowToAsset(row, sheetDeviceType);

        // Auto-generate missing asset tags (required by DB schema)
        if (!asset.assetTagNumber || asset.assetTagNumber === 'undefined' || asset.assetTagNumber === '' || asset.assetTagNumber.toUpperCase() === 'NA' || asset.assetTagNumber === 'N/A' || asset.assetTagNumber === '-') {
          if (asset.serialNumber && asset.serialNumber !== 'N/A') {
            asset.assetTagNumber = asset.serialNumber; // Use serial or product key as tag
          } else if (asset.make || asset.model || asset.assignedToName) {
            const prefix = asset.deviceType ? asset.deviceType.substring(0, 3).toUpperCase() : 'AST';
            asset.assetTagNumber = `AUTO-${prefix}-${Math.floor(Math.random() * 1000000)}`;
          } else {
            sheetSkippedReasons.push('Row empty (no serial, make, model, or username)');
            continue; // Skip completely empty rows
          }
        }

        // Skip rows without device type
        if (!asset.deviceType || asset.deviceType === 'undefined' || asset.deviceType === '') {
          sheetSkippedReasons.push('Missing deviceType');
          continue;
        }
        allAssets.push(asset);
        sheetCount++;
      }
      sheetResults[sheetName] = { status: 'parsed', rows: sheetCount, skippedReasons: sheetSkippedReasons.slice(0, 3) };
    }

    if (allAssets.length === 0) {
      return res.status(400).json({ message: 'No valid asset data found in the file', sheetResults });
    }

    // Bulk insert with ordered: false to skip duplicates
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    const errors = [];

    try {
      const result = await Asset.insertMany(allAssets, { ordered: false });
      imported = result.length;
      skipped = allAssets.length - imported;
    } catch (err) {
      if (err.code === 11000 || (err.writeErrors && err.writeErrors.length)) {
        // Some duplicates were found
        imported = err.insertedDocs ? err.insertedDocs.length : (allAssets.length - (err.writeErrors ? err.writeErrors.length : 0));
        const dupeErrors = err.writeErrors ? err.writeErrors.filter(e => e.err && e.err.code === 11000) : [];
        const otherErrors = err.writeErrors ? err.writeErrors.filter(e => !e.err || e.err.code !== 11000) : [];
        skipped = dupeErrors.length;
        failed = otherErrors.length;
        if (otherErrors.length > 0) {
          errors.push(...otherErrors.slice(0, 5).map(e => e.err ? e.err.errmsg : 'Unknown error'));
        }
      } else {
        throw err;
      }
    }

    res.json({
      message: `Import complete! ${imported} assets imported, ${skipped} duplicates skipped, ${failed} failed.`,
      imported,
      skipped,
      failed,
      totalProcessed: allAssets.length,
      sheetResults,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ message: 'Import failed: ' + err.message });
  }
});

// GET search assets
router.get('/search', async (req, res) => {
  try {
    const query = req.query.q;
    console.log('============= SEARCH TRIGGERED =============');
    console.log(`Original Query: "${query}"`);

    if (!query) return res.json([]);

    // Remove spaces and hyphens from the query to make it ultra-robust for asset tags
    // e.g. "R E 111" or "re-111" becomes "re111"
    const robustQuery = query.replace(/[\s-]/g, '');
    console.log(`Robust Query for regex: "${robustQuery}"`);

    // Create case-insensitive regex for the search term (using the robust query)
    // We search the database using BOTH the original query and the robust query for maximum coverage
    const regexOriginal = new RegExp(query, 'i');
    const regexRobust = new RegExp(robustQuery, 'i');

    // Search across multiple fields
    const searchQuery = {
      $or: [
        { assetTagNumber: { $in: [regexOriginal, regexRobust] } },
        { serialNumber: { $in: [regexOriginal, regexRobust] } },
        { deviceType: regexOriginal },
        { make: regexOriginal },
        { model: regexOriginal },
        { assignedToName: regexOriginal },
        { employeeId: regexOriginal }
      ]
    };

    if (req.query.ownership && req.query.ownership !== 'All') {
      searchQuery.ownership = req.query.ownership;
    }

    const assets = await Asset.find(searchQuery).limit(10).select('assetTagNumber deviceType make model status assignedToName').lean();

    res.json(assets);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET all assets
router.get('/', async (req, res) => {
  try {
    const filters = {};
    if (req.query.status) filters.status = req.query.status;
    if (req.query.deviceType) filters.deviceType = req.query.deviceType;
    if (req.query.department) filters['assignedTo.department'] = req.query.department;
    if (req.query.ownership && req.query.ownership !== 'All') filters.ownership = req.query.ownership;

    const assets = await Asset.find(filters).sort({ createdAt: -1 }).lean();
    res.json(assets);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET dashboard statistics
router.get('/dashboard-stats', async (req, res) => {
  try {
    const baseFilter = {};
    let validAssetTags = null;

    if (req.query.ownership && req.query.ownership !== 'All') {
      baseFilter.ownership = req.query.ownership;
      const assetsForOwnership = await Asset.find({ ownership: req.query.ownership }).select('assetTagNumber').lean();
      validAssetTags = assetsForOwnership.map(a => a.assetTagNumber);
    }

    const [totalAssets, inUse, inStock, underRepair] = await Promise.all([
      Asset.countDocuments(baseFilter),
      Asset.countDocuments({ ...baseFilter, status: 'In Use' }),
      Asset.countDocuments({ ...baseFilter, status: 'In Stock' }),
      Asset.countDocuments({ ...baseFilter, status: 'Under Repair' })
    ]);

    let returnedAssets, activeAllocations;
    let recentAllocationsQuery = {};
    let recentReturnsQuery = {};

    if (validAssetTags) {
      recentAllocationsQuery.assetTagNumber = { $in: validAssetTags };
      recentReturnsQuery.assetTagNumber = { $in: validAssetTags };
      [returnedAssets, activeAllocations] = await Promise.all([
        Return.countDocuments({ assetTagNumber: { $in: validAssetTags } }),
        Allocation.countDocuments({ assetTagNumber: { $in: validAssetTags } })
      ]);
    } else {
      [returnedAssets, activeAllocations] = await Promise.all([
        Return.countDocuments(),
        Allocation.countDocuments()
      ]);
    }

    // Aggregations for charts
    const assetsByDeviceType = await Asset.aggregate([
      { $match: baseFilter },
      { $group: { _id: '$deviceType', count: { $sum: 1 } } }
    ]);

    const assetsByStatus = await Asset.aggregate([
      { $match: baseFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const [recentActivities, recentAllocations, recentReturns] = await Promise.all([
      Asset.find(baseFilter).sort({ updatedAt: -1 }).limit(5).select('assetTagNumber deviceType status updatedAt').lean(),
      Allocation.find(recentAllocationsQuery).sort({ assignDate: -1 }).limit(5).select('employeeName assetTagNumber assignDate expectedReturnDate issueNotes').lean(),
      Return.find(recentReturnsQuery).sort({ returnDate: -1 }).limit(5).select('assetTagNumber employeeName deviceCondition returnDate penaltyAmount notes').lean()
    ]);

    // Live 6-month trend data for advanced graphical representation
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const d = new Date();
    const trendLabels = [];
    const monthIndexes = []; // Store actual month indices to match data

    for (let i = 5; i >= 0; i--) {
        const d2 = new Date();
        d2.setMonth(d.getMonth() - i);
        trendLabels.push(monthNames[d2.getMonth()]);
        monthIndexes.push(d2.getMonth()); // Keep track of the month index (0-11) for this column
    }

    // Date boundary: 1st day of the month, 5 months ago (so it covers the current month + 5 previous)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    // Fetch live raw data for the last 6 months
    const [liveAddedAssets, liveAllocations, liveReturns] = await Promise.all([
      Asset.find({ ...baseFilter, createdAt: { $gte: sixMonthsAgo } }).select('createdAt').lean(),
      Allocation.find({ ...recentAllocationsQuery, assignDate: { $gte: sixMonthsAgo } }).select('assignDate').lean(),
      Return.find({ ...recentReturnsQuery, returnDate: { $gte: sixMonthsAgo } }).select('returnDate').lean()
    ]);

    // Initialize counts arrays with 0s
    const addedCounts = [0, 0, 0, 0, 0, 0];
    const allocatedCounts = [0, 0, 0, 0, 0, 0];
    const returnedCounts = [0, 0, 0, 0, 0, 0];

    // Helper to bucket data by month
    const bucketData = (dataArray, dateField, targetArray) => {
        dataArray.forEach(item => {
            if (item[dateField]) {
                const itemMonth = new Date(item[dateField]).getMonth();
                // Find where this month sits in our rolling 6-month window
                const index = monthIndexes.lastIndexOf(itemMonth);
                if (index !== -1) {
                    targetArray[index]++;
                }
            }
        });
    };

    bucketData(liveAddedAssets, 'createdAt', addedCounts);
    bucketData(liveAllocations, 'assignDate', allocatedCounts);
    bucketData(liveReturns, 'returnDate', returnedCounts);

    const trendData = {
        labels: trendLabels,
        added: addedCounts,
        allocated: allocatedCounts,
        returned: returnedCounts
    };

    res.json({
      kpis: {
        totalAssets,
        inUse,
        inStock,
        underRepair,
        returnedAssets,
        activeAllocations
      },
      charts: {
        assetsByDeviceType,
        assetsByStatus,
        trendData
      },
      recentActivities,
      recentAllocations,
      recentReturns
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET single asset
router.get('/:id', async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id).lean();
    if (!asset) return res.status(404).json({ message: 'Asset not found' });
    res.json(asset);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST new asset
router.post('/', async (req, res) => {
  const asset = new Asset(req.body);
  try {
    const newAsset = await asset.save();
    res.status(201).json(newAsset);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT update asset
router.put('/:id', async (req, res) => {
  try {
    const updatedAsset = await Asset.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!updatedAsset) return res.status(404).json({ message: 'Asset not found' });
    res.json(updatedAsset);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE asset
router.delete('/:id', async (req, res) => {
  try {
    const asset = await Asset.findByIdAndDelete(req.params.id);
    if (!asset) return res.status(404).json({ message: 'Asset not found' });
    res.json({ message: 'Asset deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
router.delete('/:id', async (req, res) => {
  try {
    const asset = await Asset.findByIdAndDelete(req.params.id);
    if (!asset) return res.status(404).json({ message: 'Asset not found' });
    res.json({ message: 'Asset deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
