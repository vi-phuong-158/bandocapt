'use strict';

const fs = require('node:fs');
const path = require('node:path');
const operationalBaseline = require('../lib/operational-baseline');

function parseArgs(argv) {
    const args = { input: '', report: '', reconciledAt: '', dryRun: true };
    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];
        if (value === '--dry-run') {
            args.dryRun = true;
            continue;
        }
        if (value === '--input') {
            args.input = argv[index + 1] || '';
            index += 1;
            continue;
        }
        if (value === '--report') {
            args.report = argv[index + 1] || '';
            index += 1;
            continue;
        }
        if (value === '--reconciled-at') {
            args.reconciledAt = argv[index + 1] || '';
            index += 1;
            continue;
        }
        if (/^--(?:apply|write|execute)(?:=|$)/.test(value)) throw new Error('OPERATIONAL_BASELINE_DRY_RUN_ONLY');
        if (value.startsWith('--')) throw new Error(`OPERATIONAL_BASELINE_ARGUMENT_INVALID:${value}`);
    }
    return args;
}

function rows(value, name) {
    if (value == null) return [];
    if (!Array.isArray(value)) throw new Error(`ROWS_MUST_BE_ARRAY:${name}`);
    return value;
}

function normalizeInput(parsed) {
    const publicSheets = parsed?.public?.sheets || parsed?.public || {};
    const privateSheets = parsed?.private?.sheets || parsed?.private || {};
    if (!publicSheets || Array.isArray(publicSheets) || typeof publicSheets !== 'object') throw new Error('PUBLIC_SHEETS_REQUIRED');
    if (!privateSheets || Array.isArray(privateSheets) || typeof privateSheets !== 'object') throw new Error('PRIVATE_SHEETS_REQUIRED');
    return {
        publicRecords: rows(publicSheets.Published_Locations, 'Published_Locations'),
        allowlistRows: rows(privateSheets.Unit_Allowlist, 'Unit_Allowlist'),
        baselineRows: rows(privateSheets[operationalBaseline.SHEET_NAME], operationalBaseline.SHEET_NAME),
        baselineSheetPresent: Object.hasOwn(privateSheets, operationalBaseline.SHEET_NAME),
    };
}

function analyzeOperationalBaseline(parsed, options = {}) {
    const input = normalizeInput(parsed);
    const report = operationalBaseline.reconcileOperationalBaseline({
        publicRecords: input.publicRecords,
        baselineRows: input.baselineRows,
        allowlistRows: input.allowlistRows,
        reconciledAt: options.reconciledAt || '',
    });
    return {
        ...report,
        baselineSheet: operationalBaseline.SHEET_NAME,
        baselineSheetPresent: input.baselineSheetPresent,
        baselineHeaders: operationalBaseline.HEADERS,
    };
}

function runOperationalBaselineDryRun(options) {
    if (!options?.input) throw new Error('OPERATIONAL_BASELINE_INPUT_REQUIRED');
    const report = analyzeOperationalBaseline(JSON.parse(fs.readFileSync(options.input, 'utf8')), options);
    if (options.report) {
        const reportPath = path.resolve(options.report);
        fs.mkdirSync(path.dirname(reportPath), { recursive: true });
        fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    }
    return report;
}

if (require.main === module) {
    const report = runOperationalBaselineDryRun(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify({
        DRY_RUN: report.dryRun,
        WRITE_PERFORMED: report.writePerformed,
        PUBLIC_RECORDS: report.publicRecords,
        BASELINE_ELIGIBLE: report.baselineEligible,
        BASELINE_EXISTING: report.baselineExisting,
        BASELINE_PLANNED: report.baselinePlanned,
        BASELINE_PROJECTED: report.baselineProjected,
        DUPLICATE_RECORD_IDS: report.duplicatePublicRecordIds.length,
        UNKNOWN_UNIT_CODES: report.unknownUnitCodes.length,
        BLOCKERS: report.blockers,
    }, null, 2)}\n`);
}

module.exports = { analyzeOperationalBaseline, normalizeInput, parseArgs, runOperationalBaselineDryRun };
