const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    analyzeDualWorkbookMigration,
    parseArgs,
    runDualWorkbookDryRun,
} = require('../scripts/dual-workbook-dry-run');

function sourceWorkbook() {
    return {
        Published_Locations: [
            { record_id: 'LOC_A', name: 'Điểm A', coordinates: '21.325,105.365' },
            { record_id: 'LOC_B', name: 'Điểm B', coordinates: 'invalid' },
        ],
        Unit_Allowlist: [{ unit_code: 'CA_A', allowed_emails: 'staff@example.gov.vn', active: true }],
        Location_Staging: [{ record_id: 'LOC_A', request_id: 'REQ_A', submitter_email: 'staff@example.gov.vn' }],
    };
}

test('dual-workbook dry-run inventories data without writing source or target', () => {
    const report = analyzeDualWorkbookMigration(sourceWorkbook());
    assert.equal(report.dryRun, true);
    assert.equal(report.writePerformed, false);
    assert.equal(report.source.public.Published_Locations.rows, 2);
    assert.equal(report.source.public.Published_Locations.validCoordinates, 1);
    assert.equal(report.source.public.Published_Locations.invalidCoordinates, 1);
    assert.equal(report.source.private.Unit_Allowlist.rows, 1);
    assert.deepEqual(report.blockers, []);
});

test('dry-run flags invalid public schema, empty valid coordinate set, unknown sheets, and private leakage', () => {
    const report = analyzeDualWorkbookMigration(
        { Published_Locations: [{ record_id: 'LOC_A', name: 'Điểm A' }], Unexpected: [] },
        { publicSheets: { Published_Locations: [], Unit_Allowlist: [] }, privateSheets: {} },
    );
    assert.ok(report.blockers.includes('PUBLIC_REQUIRED_COLUMN_MISSING:coordinates'));
    assert.ok(report.blockers.includes('PUBLIC_SCHEMA_INVALID'));
    assert.ok(report.blockers.includes('PUBLIC_NO_VALID_COORDINATES'));
    assert.ok(report.blockers.includes('UNKNOWN_SHEET:Unexpected'));
    assert.ok(report.blockers.includes('PRIVATE_SHEET_IN_PUBLIC_TARGET:Unit_Allowlist'));
});

test('dry-run comparison reports missing, unexpected, and duplicate public records', () => {
    const report = analyzeDualWorkbookMigration(sourceWorkbook(), {
        publicSheets: {
            Published_Locations: [
                { record_id: 'LOC_A', name: 'Điểm A', coordinates: '21.325,105.365' },
                { record_id: 'LOC_A', name: 'Điểm A duplicate', coordinates: '21.325,105.365' },
                { record_id: 'LOC_C', name: 'Điểm C', coordinates: '21.325,105.365' },
            ],
        },
        privateSheets: {},
    });
    assert.deepEqual(report.comparison.publishedLocations.missingInTarget, ['LOC_B']);
    assert.deepEqual(report.comparison.publishedLocations.unexpectedInTarget, ['LOC_C']);
    assert.deepEqual(report.comparison.publishedLocations.duplicateTargetRecordIds, ['LOC_A']);
    assert.ok(report.blockers.includes('TARGET_PUBLIC_RECORD_MISSING:LOC_B'));
    assert.ok(report.blockers.includes('TARGET_PUBLIC_RECORD_UNEXPECTED:LOC_C'));
    assert.ok(report.blockers.includes('TARGET_DUPLICATE_RECORD_ID:Published_Locations:LOC_A'));
});

test('dry-run blocks an empty target and accepts a complete matching dual-workbook target', () => {
    const emptyTargetReport = analyzeDualWorkbookMigration(sourceWorkbook(), {
        publicSheets: { Published_Locations: [] },
        privateSheets: {},
    });
    assert.ok(emptyTargetReport.blockers.includes('TARGET_PUBLIC_EMPTY'));
    assert.ok(emptyTargetReport.blockers.includes('TARGET_PUBLIC_SCHEMA_INVALID'));
    assert.ok(emptyTargetReport.blockers.includes('TARGET_PRIVATE_SHEET_MISSING:Unit_Allowlist'));
    assert.ok(emptyTargetReport.blockers.includes('TARGET_PRIVATE_SHEET_MISSING:Location_Staging'));

    const source = sourceWorkbook();
    const matchingTargetReport = analyzeDualWorkbookMigration(source, {
        publicSheets: { Published_Locations: structuredClone(source.Published_Locations) },
        privateSheets: {
            Unit_Allowlist: structuredClone(source.Unit_Allowlist),
            Location_Staging: structuredClone(source.Location_Staging),
        },
    });
    assert.deepEqual(matchingTargetReport.blockers, []);
});

test('dry-run blocks duplicate source record and request identifiers', () => {
    const source = sourceWorkbook();
    source.Published_Locations.push({
        record_id: 'LOC_A', name: 'Điểm A duplicate', coordinates: '21.325,105.365',
    });
    source.Location_Staging.push({ record_id: 'LOC_B', request_id: 'REQ_A' });
    const report = analyzeDualWorkbookMigration(source);
    assert.ok(report.blockers.includes('SOURCE_DUPLICATE_RECORD_ID:Published_Locations:LOC_A'));
    assert.ok(report.blockers.includes('SOURCE_DUPLICATE_REQUEST_ID:Location_Staging:REQ_A'));
});

test('dry-run recognizes approved semantic aliases as required public columns', () => {
    const report = analyzeDualWorkbookMigration({
        Published_Locations: [{ record_id: 'LOC_A', 'Tên đơn vị': 'Điểm A', 'Tọa độ': '21.325,105.365' }],
    });
    assert.deepEqual(report.source.public.Published_Locations.missingRequiredColumns, []);
    assert.deepEqual(report.blockers, []);
});

test('dry-run blocks private columns and public sheets crossing workbook boundaries', () => {
    const source = sourceWorkbook();
    source.Published_Locations[0].submitter_email = 'private@example.gov.vn';
    const report = analyzeDualWorkbookMigration(source, {
        publicSheets: { Published_Locations: structuredClone(source.Published_Locations) },
        privateSheets: {
            Published_Locations: [],
            Unit_Allowlist: structuredClone(source.Unit_Allowlist),
            Location_Staging: structuredClone(source.Location_Staging),
        },
    });
    assert.ok(report.blockers.includes('PRIVATE_COLUMN_IN_PUBLIC_SOURCE:submitter_email'));
    assert.ok(report.blockers.includes('PRIVATE_COLUMN_IN_PUBLIC_TARGET:submitter_email'));
    assert.ok(report.blockers.includes('PUBLIC_SHEET_IN_PRIVATE_TARGET:Published_Locations'));
});

function fidelitySource(records) {
    return { Published_Locations: records };
}

function fidelityTarget(records) {
    return { publicSheets: { Published_Locations: records }, privateSheets: {} };
}

test('dry-run accepts identical published records without fidelity blockers', () => {
    const records = [{ record_id: 'LOC_A', name: 'Điểm A', coordinates: '21.325,105.365' }];
    const report = analyzeDualWorkbookMigration(fidelitySource(records), fidelityTarget(structuredClone(records)));
    assert.deepEqual(report.comparison.publishedLocations.fidelity, {
        mismatchedRecordIds: [], coordinateLost: [], coordinateInvalid: [], coordinateChanged: [],
    });
    assert.deepEqual(report.blockers, []);
});

test('dry-run blocks per-record coordinate drift, loss, and invalid target values', () => {
    const source = fidelitySource([
        { record_id: 'LOC_CHANGED', name: 'Điểm changed', coordinates: '21.325,105.365' },
        { record_id: 'LOC_LOST', name: 'Điểm lost', coordinates: '21.326,105.366' },
        { record_id: 'LOC_INVALID', name: 'Điểm invalid', coordinates: '21.327,105.367' },
    ]);
    const report = analyzeDualWorkbookMigration(source, fidelityTarget([
        { record_id: 'LOC_CHANGED', name: 'Điểm changed', coordinates: '21.500,105.500' },
        { record_id: 'LOC_LOST', name: 'Điểm lost', coordinates: '' },
        { record_id: 'LOC_INVALID', name: 'Điểm invalid', coordinates: 'invalid' },
    ]));
    assert.deepEqual(report.comparison.publishedLocations.fidelity.coordinateChanged, ['LOC_CHANGED']);
    assert.deepEqual(report.comparison.publishedLocations.fidelity.coordinateLost, ['LOC_LOST']);
    assert.deepEqual(report.comparison.publishedLocations.fidelity.coordinateInvalid, ['LOC_INVALID']);
    assert.ok(report.blockers.includes('TARGET_COORDINATE_CHANGED:LOC_CHANGED'));
    assert.ok(report.blockers.includes('TARGET_COORDINATE_LOST:LOC_LOST'));
    assert.ok(report.blockers.includes('TARGET_COORDINATE_INVALID:LOC_INVALID'));
});

test('dry-run blocks semantic public data mismatch even when record IDs and coordinates match', () => {
    const report = analyzeDualWorkbookMigration(
        fidelitySource([{ record_id: 'LOC_A', name: 'Công an phường A', coordinates: '21.325,105.365' }]),
        fidelityTarget([{ record_id: 'LOC_A', name: 'Công an phường B', coordinates: '21.325,105.365' }]),
    );
    assert.deepEqual(report.comparison.publishedLocations.missingInTarget, []);
    assert.deepEqual(report.comparison.publishedLocations.unexpectedInTarget, []);
    assert.deepEqual(report.comparison.publishedLocations.fidelity.mismatchedRecordIds, ['LOC_A']);
    assert.ok(report.blockers.includes('TARGET_PUBLIC_RECORD_MISMATCH:LOC_A'));
});

test('dry-run compares other canonical public fields without comparing private fields', () => {
    const source = [{
        record_id: 'LOC_A', name: 'Điểm A', coordinates: '21.325,105.365', phone: '0210 123 456',
    }];
    const target = structuredClone(source);
    target[0].phone = '0210 999 999';
    const report = analyzeDualWorkbookMigration(fidelitySource(source), fidelityTarget(target));
    assert.ok(report.blockers.includes('TARGET_PUBLIC_RECORD_MISMATCH:LOC_A'));
});

test('dry-run canonicalizes approved aliases and formatting-only coordinate differences', () => {
    const report = analyzeDualWorkbookMigration(
        fidelitySource([{ record_id: 'LOC_A', 'Tên đơn vị': 'Điểm A', 'Tọa độ': '21.325, 105.365' }]),
        fidelityTarget([{ record_id: 'LOC_A', name: 'Điểm A', coordinates: '21.325,105.365' }]),
    );
    assert.deepEqual(report.comparison.publishedLocations.fidelity, {
        mismatchedRecordIds: [], coordinateLost: [], coordinateInvalid: [], coordinateChanged: [],
    });
    assert.deepEqual(report.blockers, []);
});

test('dry-run blocks partial coordinate loss even when other target records stay valid', () => {
    const records = [
        { record_id: 'LOC_A', name: 'Điểm A', coordinates: '21.325,105.365' },
        { record_id: 'LOC_B', name: 'Điểm B', coordinates: '21.326,105.366' },
        { record_id: 'LOC_C', name: 'Điểm C', coordinates: '21.327,105.367' },
    ];
    const target = structuredClone(records);
    target[1].coordinates = '';
    const report = analyzeDualWorkbookMigration(fidelitySource(records), fidelityTarget(target));
    assert.equal(report.target.public.Published_Locations.validCoordinates, 2);
    assert.ok(report.blockers.includes('TARGET_COORDINATE_LOST:LOC_B'));
});

test('CLI dry-run rejects write flags and only writes an explicit local report', () => {
    assert.throws(() => parseArgs(['--source', 'fixture.json', '--apply']), /DUAL_WORKBOOK_DRY_RUN_ONLY/);
    assert.throws(() => parseArgs(['--source', 'fixture.json', '--write']), /DUAL_WORKBOOK_DRY_RUN_ONLY/);
    assert.throws(() => parseArgs(['--source', 'fixture.json', '--apply=true']), /DUAL_WORKBOOK_DRY_RUN_ONLY/);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bandocapt-dual-workbook-'));
    const source = path.join(directory, 'source.json');
    const reportPath = path.join(directory, 'report.json');
    fs.writeFileSync(source, JSON.stringify({ sheets: sourceWorkbook() }), 'utf8');
    const before = fs.readFileSync(source, 'utf8');
    const report = runDualWorkbookDryRun({ source, report: reportPath });
    assert.equal(report.writePerformed, false);
    assert.equal(fs.readFileSync(source, 'utf8'), before);
    assert.equal(JSON.parse(fs.readFileSync(reportPath, 'utf8')).dryRun, true);
});
