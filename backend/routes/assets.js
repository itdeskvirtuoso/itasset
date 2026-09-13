const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Asset = require('../models/Asset');
const Return = require('../models/Return');
const Allocation = require('../models/Allocation');
const multer = require('multer');
const XLSX = require('xlsx');
const auth = require('../middleware/auth');
const checkPermission = require('../middleware/roleCheck');
const { toStr, pick, sendError } = require('../utils/security');

router.use(auth);

// Fields a client may set on an asset; everything else (_id, timestamps, ...) is ignored
const ASSET_FIELDS = [
  'srNo', 'assetTagNumber', 'serialNumber', 'deviceType', 'make', 'softwareCategory', 'model',
  'processor', 'generation', 'ram', 'storage', 'os', 'macAddress', 'ownership', 'vendorName',
  'purchaseDate', 'warrantyEndDate', 'status', 'assignedToName', 'employeeId', 'assignedBy', 'remark'
];

// Kept in memory and parsed straight from the buffer: no temp files to clean up,
// and the uploaded file name never touches a disk path
const IMPORT_MAX_BYTES = 20 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMPORT_MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx, .xls, and .csv files are allowed'));
    }
  }
});

function receiveImportFile(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 20 MB).' : err.message;
    res.status(400).json({ message });
  });
}

// Sheets to skip during import
const SKIP_SHEETS = ['summary', 'o365 user list', 'o365', 'user list'];

// Header cell -> lowercase letters/digits only ("Serial No." -> "serialno")
const normalizeHeader = (key) => String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
const BLANK_CELLS = new Set(['NA', 'N/A', '-']);
const cleanCell = (val) => (typeof val === 'string' && BLANK_CELLS.has(val.trim().toUpperCase()) ? '' : val);

// Exact header names win. A partial match ("warrantyvalidupto" contains "warranty") is only tried
// for names of 5+ letters, so short names like "id", "os", "ram" or "end" can't grab unrelated
// columns such as "Valid Date", "Cost", "Program" or "Vendor Name". Pass fuzzyNames to narrow it further.
const FUZZY_MIN_LENGTH = 5;
function findColumnValue(row, exactNames, fuzzyNames = exactNames.filter((n) => n.length >= FUZZY_MIN_LENGTH)) {
  const headers = Object.keys(row).map((key) => ({ key, norm: normalizeHeader(key) }));
  for (const name of exactNames) {
    const hit = headers.find((h) => h.norm === name);
    if (hit) return cleanCell(row[hit.key]);
  }
  for (const name of fuzzyNames) {
    const hit = headers.find((h) => h.norm.includes(name));
    if (hit) return cleanCell(row[hit.key]);
  }
  return undefined;
}

// Excel serial number, Date cell, or text such as "15.04.2026 to 14/04/2027"
function parseExcelDate(val, preferLast = false) {
  if (val === undefined || val === null || val === '') return undefined;
  if (val instanceof Date) return isNaN(val.getTime()) ? undefined : val;
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    return d ? new Date(d.y, d.m - 1, d.d) : undefined;
  }

  let text = String(val).trim();

  // Fix common typos in Indian/English spelling of months
  text = text.replace(/saptember/gi, 'september')
    .replace(/augest/gi, 'august')
    .replace(/febuary/gi, 'february');

  // Extract dates using regex DD.MM.YYYY or DD/MM/YYYY
  const matches = [...text.matchAll(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/g)];
  if (matches.length > 0) {
    const match = preferLast ? matches[matches.length - 1] : matches[0];
    return new Date(parseInt(match[3], 10), parseInt(match[2], 10) - 1, parseInt(match[1], 10));
  }

  // Try splitting by 'to' (e.g., '15 April 2026 to 14 April 2027')
  if (text.toLowerCase().includes(' to ')) {
    const parts = text.toLowerCase().split(' to ');
    text = preferLast ? parts[parts.length - 1].trim() : parts[0].trim();
  }

  // Clean up random text
  text = text.replace(/next renew in /gi, '').trim();

  const parsed = new Date(text);
  return isNaN(parsed.getTime()) ? undefined : parsed;
}

// Sheet status text -> schema status. Negative phrases are checked first:
// "Not Working" is a repair, "Inactive" is stock.
function mapStatus(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const s = raw.toLowerCase();
  if (/not\s*working|repair|faulty|defective/.test(s)) return 'Under Repair';
  if (/scrap/.test(s)) return 'Scrapped';
  if (/damage/.test(s)) return 'Damaged';
  if (/lost|missing|stolen/.test(s)) return 'Lost';
  if (/return/.test(s)) return 'Returned';
  if (/inactive|in\s*stock|stock|spare|available|unused/.test(s)) return 'In Stock';
  if (/active|in\s*use|working|assigned|allocated/.test(s)) return 'In Use';
  return null;
}

function mapOwnership(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (value.includes('rent')) return 'Rental';
  if (value.includes('vpel') || value.includes('virtuoso')) return 'VIRTUOSO';
  return 'Owned';
}

function mapRowToAsset(row, sheetDeviceType) {
  const srNo = findColumnValue(row, ['srno', 'slno', 'sno']) || '';
  const assetTagNumber = findColumnValue(row, ['assettag', 'tagno', 'tagnumber', 'assetno']) || '';
  const serialNumber = findColumnValue(row, ['serialnumber', 'serialno', 'assetsrno', 'assetserial', 'key', 'licensekey', 'serialkey']) || '';
  let make = findColumnValue(row, ['make', 'brand', 'manufacturer']) || '';
  let model = findColumnValue(row, ['model', 'modelno', 'modelnumber', 'softwarename', 'software'], ['modelno', 'modelnumber', 'softwarename', 'software']) || '';

  // Handle combined 'Make & Model' column
  if (!make && !model) {
    const combined = findColumnValue(row, ['makemodel', 'makeandmodel']) || '';
    if (combined) {
      // First word as make, rest as model
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
  const employeeId = findColumnValue(row, ['employeeid', 'empid', 'empcode', 'employeecode', 'id']) || '';
  const ownership = findColumnValue(row, ['ownership', 'owner', 'vpelrental', 'rentalagreement', 'company', 'organization']) || '';
  const vendorName = findColumnValue(row, ['vendorname', 'vendor', 'supplier']) || '';
  const assignedToName = findColumnValue(row, ['username', 'assignedto', 'assignname', 'reportingtomanager', 'employeename', 'empname']) || '';
  const assignedBy = findColumnValue(row, ['assignedby', 'admin', 'givenby']) || '';
  const softwareCategory = findColumnValue(row, ['softwarecategory', 'category', 'softwaretype']) || '';
  const remark = findColumnValue(row, ['remark', 'remarks', 'notes', 'note']) || '';

  // Parse dates
  const purchaseDate = parseExcelDate(findColumnValue(row, ['purchasedate', 'dateofpurchase', 'purchaseon', 'start', 'assigndate']), false);
  let warrantyEndDate = parseExcelDate(findColumnValue(row, ['warrantyenddate', 'warrantyend', 'amcend', 'amcenddate', 'expire', 'expiry', 'renew', 'renewal', 'end', 'validdate', 'amcvalidupto', 'warrantyvalidupto', 'warrantyupto', 'amcupto', 'warranty']), true);

  // Fallback for the Software sheet where dates are written in the Remark column
  if (!warrantyEndDate && remark) {
    warrantyEndDate = parseExcelDate(remark, true);
  }

  // Device type from a column, else the sheet name. "device" alone must match exactly,
  // otherwise a "Device Condition" column would become the type.
  let deviceType = findColumnValue(row, ['devicetype', 'device', 'type', 'assettype'], ['devicetype', 'assettype']) || sheetDeviceType || '';
  deviceType = String(deviceType).trim();

  // If deviceType is generic ('Sheet1') or missing, check if it's Software
  const hasSoftwareCol = Object.keys(row).some((k) => normalizeHeader(k).includes('software'));
  if ((!deviceType || deviceType.toLowerCase().startsWith('sheet')) && hasSoftwareCol) {
    deviceType = 'Software';
  }

  // Status from the sheet; without one, an assigned device is in use
  const finalAssignedToName = String(assignedToName).trim();
  let assetStatus = mapStatus(findColumnValue(row, ['status', 'state', 'condition']));
  if (!assetStatus) {
    assetStatus = finalAssignedToName ? 'In Use' : 'In Stock';
  }

  return {
    srNo: String(srNo).trim(),
    assetTagNumber: String(assetTagNumber).trim(),
    serialNumber: String(serialNumber).trim() || 'N/A',
    deviceType,
    make: String(make).trim(),
    model: String(model).trim(),
    processor: String(processor).trim(),
    generation: String(generation).trim(),
    ram: String(ram).trim(),
    storage: String(storage).trim(),
    os: String(os).trim(),
    ownership: mapOwnership(ownership),
    vendorName: String(vendorName).trim(),
    purchaseDate,
    warrantyEndDate,
    status: assetStatus,
    assignedToName: finalAssignedToName,
    employeeId: String(employeeId).trim(),
    assignedBy: String(assignedBy).trim(),
    softwareCategory: String(softwareCategory).trim(),
    remark: String(remark).trim()
  };
}

// POST import Excel
router.post('/import', checkPermission('assets.html'), receiveImportFile, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    let workbook;
    try {
      workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    } catch (err) {
      return res.status(400).json({ message: 'The file could not be read. Make sure it is a valid Excel or CSV file.' });
    }
    const allAssets = [];
    const sheetResults = {};

    for (const sheetName of workbook.SheetNames) {
      // Skip summary/user list sheets
      if (SKIP_SHEETS.some((s) => sheetName.toLowerCase().includes(s))) {
        sheetResults[sheetName] = { status: 'skipped', reason: 'Non-data sheet' };
        continue;
      }

      // Determine device type from sheet name
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
      const sheetDeviceType = typeMap[sheetName.trim().toLowerCase()] || sheetName.trim();

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
          const matchCount = keywords.filter((k) => rowStr.includes(k)).length;
          if (matchCount >= 2) {
            headerRowIndex = i;
            break;
          }
        }
      }

      const rows = XLSX.utils.sheet_to_json(sheet, { range: headerRowIndex, defval: '' });

      if (rows.length > 0) {
        // Check if the first row is actually a sub-header row (e.g. 'Start', 'End', 'HDD' under merged cells)
        const firstRowVals = Object.values(rows[0]).map((v) => String(v).trim().toLowerCase());
        const subHeaderWords = ['start', 'end', 'hdd', 'ram', 'license key', 'assign date', 'valid date', 'key'];
        const isSubHeader = subHeaderWords.some((w) => firstRowVals.includes(w));

        if (isSubHeader) {
          const subHeaderRow = rows.shift(); // Remove it from data rows
          // Remap all subsequent rows to include the sub-header names in their keys
          for (let r = 0; r < rows.length; r++) {
            const newRow = {};
            for (const key of Object.keys(rows[r])) {
              const newKey = subHeaderRow[key] && typeof subHeaderRow[key] === 'string' ? subHeaderRow[key] : key;
              newRow[newKey] = rows[r][key];
            }
            rows[r] = newRow;
          }
        }
      }

      let sheetCount = 0;
      const sheetSkippedReasons = [];
      for (const row of rows) {
        const asset = mapRowToAsset(row, sheetDeviceType);

        // Auto-generate missing asset tags (required by DB schema)
        const tag = asset.assetTagNumber;
        if (!tag || tag === 'undefined' || tag.toUpperCase() === 'NA' || tag === 'N/A' || tag === '-') {
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
        if (!asset.deviceType || asset.deviceType === 'undefined') {
          sheetSkippedReasons.push('Missing deviceType');
          continue;
        }
        allAssets.push(asset);
        sheetCount++;
      }
      sheetResults[sheetName] = { status: 'parsed', rows: sheetCount, skippedReasons: [...new Set(sheetSkippedReasons)].slice(0, 3) };
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
        const writeErrors = err.writeErrors || [];
        imported = err.insertedDocs ? err.insertedDocs.length : (allAssets.length - writeErrors.length);
        const dupeErrors = writeErrors.filter((e) => e.err && e.err.code === 11000);
        const otherErrors = writeErrors.filter((e) => !e.err || e.err.code !== 11000);
        skipped = dupeErrors.length;
        failed = otherErrors.length;
        if (otherErrors.length > 0) {
          errors.push(...otherErrors.slice(0, 5).map((e) => (e.err && e.err.errmsg) || 'Unknown error'));
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
    sendError(res, err, 'assets/import');
  }
});

// GET search assets
router.get('/search', async (req, res) => {
  try {
    const query = toStr(req.query.q);
    if (!query) return res.json([]);

    // Remove spaces and hyphens from the query to make it ultra-robust for asset tags
    // e.g. "R E 111" or "re-111" becomes "re111"
    const robustQuery = query.replace(/[\s-]/g, '');

    // Match the typed text literally: "(", "+" or "*" must not break (or bend) the regex
    const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regexOriginal = new RegExp(escapeRegex(query), 'i');
    const regexRobust = new RegExp(escapeRegex(robustQuery || query), 'i');

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

    const ownership = toStr(req.query.ownership);
    if (ownership && ownership !== 'All') {
      searchQuery.ownership = ownership;
    }

    const assets = await Asset.find(searchQuery).limit(10).select('assetTagNumber serialNumber deviceType make model status assignedToName employeeId').lean();

    res.json(assets);
  } catch (err) {
    sendError(res, err, 'assets/search');
  }
});

// GET all assets
router.get('/', async (req, res) => {
  try {
    const filters = {};
    const status = toStr(req.query.status);
    const deviceType = toStr(req.query.deviceType);
    const ownership = toStr(req.query.ownership);
    if (status) filters.status = status;
    if (deviceType) filters.deviceType = deviceType;
    if (ownership && ownership !== 'All') filters.ownership = ownership;

    const assets = await Asset.find(filters).sort({ createdAt: -1 }).lean();
    res.json(assets);
  } catch (err) {
    sendError(res, err, 'assets/list');
  }
});

// GET dashboard statistics
router.get('/dashboard-stats', async (req, res) => {
  try {
    const baseFilter = {};
    let validAssetTags = null;

    const ownership = toStr(req.query.ownership);
    if (ownership && ownership !== 'All') {
      baseFilter.ownership = ownership;
      validAssetTags = await Asset.distinct('assetTagNumber', { ownership });
    }

    const [totalAssets, inUse, inStock, underRepair] = await Promise.all([
      Asset.countDocuments(baseFilter),
      Asset.countDocuments({ ...baseFilter, status: 'In Use' }),
      Asset.countDocuments({ ...baseFilter, status: 'In Stock' }),
      Asset.countDocuments({ ...baseFilter, status: 'Under Repair' })
    ]);

    const recentAllocationsQuery = {};
    const recentReturnsQuery = {};
    if (validAssetTags) {
      recentAllocationsQuery.assetTagNumber = { $in: validAssetTags };
      recentReturnsQuery.assetTagNumber = { $in: validAssetTags };
    }

    const [returnedAssets, activeAllocations] = await Promise.all([
      Return.countDocuments(recentReturnsQuery),
      Allocation.countDocuments(recentAllocationsQuery)
    ]);

    // Aggregations for charts
    const [deviceTypeGroups, statusGroups, openAllocations] = await Promise.all([
      // Case- and space-insensitive, so "Laptop", "LAPTOP" and " laptop" count as one type
      Asset.aggregate([
        { $match: baseFilter },
        { $project: { type: { $trim: { input: { $toString: { $ifNull: ['$deviceType', ''] } } } } } },
        { $group: { _id: { $toLower: '$type' }, count: { $sum: 1 }, variants: { $addToSet: '$type' } } },
        { $sort: { count: -1 } }
      ]),
      Asset.aggregate([
        { $match: baseFilter },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      // Allocations still out with an employee
      Allocation.countDocuments({ ...recentAllocationsQuery, status: { $ne: 'Returned' } })
    ]);

    // Display name: keep a mixed-case spelling if one exists ("Laptop"), short codes upper-case
    // ("UPS"), otherwise title-case ("MONITOR" -> "Monitor"). Blank / NA types become "Unspecified".
    const BLANK_TYPES = new Set(['', 'na', 'n/a', '-', 'null', 'undefined']);
    const typeLabel = (key, variants) => {
      const mixed = variants.find((v) => v !== v.toUpperCase() && v !== v.toLowerCase());
      if (mixed) return mixed;
      if (key.length <= 3) return key.toUpperCase();
      return key.replace(/\b\w/g, (ch) => ch.toUpperCase());
    };
    const assetsByDeviceType = [];
    let unspecifiedCount = 0;
    deviceTypeGroups.forEach((group) => {
      if (BLANK_TYPES.has(group._id)) {
        unspecifiedCount += group.count;
        return;
      }
      const variants = group.variants.filter(Boolean).sort();
      assetsByDeviceType.push({ _id: typeLabel(group._id, variants), count: group.count, variants });
    });
    if (unspecifiedCount) assetsByDeviceType.push({ _id: 'Unspecified', count: unspecifiedCount, variants: [] });

    // Every status from the schema in a fixed order, so bars and colours never shift
    const statusCounts = new Map(statusGroups.map((group) => [group._id || 'Unspecified', group.count]));
    const assetsByStatus = Asset.schema.path('status').enumValues.map((status) => ({ _id: status, count: statusCounts.get(status) || 0 }));
    statusCounts.forEach((count, status) => {
      if (!assetsByStatus.some((s) => s._id === status)) assetsByStatus.push({ _id: status, count });
    });

    const [recentActivities, recentAllocations, recentReturns] = await Promise.all([
      Asset.find(baseFilter).sort({ updatedAt: -1 }).limit(5).select('assetTagNumber deviceType status updatedAt').lean(),
      Allocation.find(recentAllocationsQuery).sort({ assignDate: -1 }).limit(5).select('employeeName assetTagNumber assignDate expectedReturnDate issueNotes').lean(),
      Return.find(recentReturnsQuery).sort({ returnDate: -1 }).limit(5).select('assetTagNumber employeeName deviceCondition returnDate penaltyAmount notes').lean()
    ]);

    // Live 6-month trend (current month + 5 before), bucketed by calendar year AND month.
    // Months are built from day 1, so "31 Aug minus 6 months" can't overflow into the wrong month.
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${month.getFullYear()}-${month.getMonth()}`,
        label: `${monthNames[month.getMonth()]} ${String(month.getFullYear()).slice(-2)}`
      });
    }
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [liveAddedAssets, liveAllocations, liveReturns] = await Promise.all([
      Asset.find({ ...baseFilter, createdAt: { $gte: sixMonthsAgo } }).select('createdAt').lean(),
      Allocation.find({ ...recentAllocationsQuery, assignDate: { $gte: sixMonthsAgo } }).select('assignDate').lean(),
      Return.find({ ...recentReturnsQuery, returnDate: { $gte: sixMonthsAgo } }).select('returnDate').lean()
    ]);

    const bucketByMonth = (docs, dateField) => {
      const counts = months.map(() => 0);
      docs.forEach((doc) => {
        if (!doc[dateField]) return;
        const date = new Date(doc[dateField]);
        const index = months.findIndex((m) => m.key === `${date.getFullYear()}-${date.getMonth()}`);
        if (index !== -1) counts[index]++; // future-dated records fall outside the window
      });
      return counts;
    };
    const sumOf = (values) => values.reduce((total, v) => total + v, 0);

    const addedCounts = bucketByMonth(liveAddedAssets, 'createdAt');
    const allocatedCounts = bucketByMonth(liveAllocations, 'assignDate');
    const returnedCounts = bucketByMonth(liveReturns, 'returnDate');

    const trendData = {
      labels: months.map((m) => m.label),
      added: addedCounts,
      allocated: allocatedCounts,
      returned: returnedCounts,
      net: allocatedCounts.map((v, i) => v - returnedCounts[i]),
      totals: { added: sumOf(addedCounts), allocated: sumOf(allocatedCounts), returned: sumOf(returnedCounts) }
    };

    res.json({
      kpis: {
        totalAssets,
        inUse,
        inStock,
        underRepair,
        returnedAssets,
        activeAllocations,
        openAllocations
      },
      charts: {
        assetsByDeviceType,
        assetsByStatus,
        trendData
      },
      recentActivities,
      recentAllocations,
      recentReturns,
      generatedAt: new Date()
    });
  } catch (err) {
    sendError(res, err, 'assets/dashboard-stats');
  }
});

// GET single asset
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid asset id.' });
    const asset = await Asset.findById(req.params.id).lean();
    if (!asset) return res.status(404).json({ message: 'Asset not found' });
    res.json(asset);
  } catch (err) {
    sendError(res, err, 'assets/get');
  }
});

// POST new asset
router.post('/', checkPermission('assets.html'), async (req, res) => {
  try {
    const newAsset = await Asset.create(pick(req.body, ASSET_FIELDS));
    res.status(201).json(newAsset);
  } catch (err) {
    sendError(res, err, 'assets/create');
  }
});

// PUT update asset
router.put('/:id', checkPermission('edit_asset'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid asset id.' });
    const updatedAsset = await Asset.findByIdAndUpdate(
      req.params.id,
      { $set: pick(req.body, ASSET_FIELDS) },
      { new: true, runValidators: true }
    );
    if (!updatedAsset) return res.status(404).json({ message: 'Asset not found' });
    res.json(updatedAsset);
  } catch (err) {
    sendError(res, err, 'assets/update');
  }
});

// DELETE asset
router.delete('/:id', checkPermission('delete_asset'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid asset id.' });
    const asset = await Asset.findByIdAndDelete(req.params.id);
    if (!asset) return res.status(404).json({ message: 'Asset not found' });
    res.json({ message: 'Asset deleted' });
  } catch (err) {
    sendError(res, err, 'assets/delete');
  }
});

module.exports = router;
