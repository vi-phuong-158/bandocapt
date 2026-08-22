const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const baseline = require('../lib/operational-baseline');
const pipeline = require('../setup/apps-script');
const workbookConfig = require('../lib/location-workbooks');
const {
    analyzeOperationalBaseline,
    parseArgs,
    runOperationalBaselineDryRun,
} = require('../scripts/reconcile-operational-baseline');

function publicRecord(overrides = {}) {
    return {
        record_id: 'LEGACY_0001', unit_code: 'CA_TINH_PHU_THO', name: 'Công an tỉnh Phú Thọ',
        type: 'police_station', address: 'Địa chỉ thật', phone: '0210', coordinates: '21.3,105.4',
        image_url: 'https://drive.google.com/file/d/example/view', search_aliases: '', updated_at: '2026-08-22T00:00:00.000Z',
        site_type: 'HEADQUARTERS', services: 'POLICE_OFFICE', google_maps_url: 'https://maps.google.com/?q=21.3,105.4',
        cccd_service_mode: '', service_schedule: '', served_units: '', status: 'published', verified_at: '',
        submitter_email: 'must-not-cross-the-boundary@example.test',
        ...overrides,
    };
}

function input(overrides = {}) {
    return {
        public: { sheets: { Published_Locations: [publicRecord()] } },
        private: { sheets: { Unit_Allowlist: [{ unit_code: 'CA_TINH_PHU_THO', active: true }] } },
        ...overrides,
    };
}

test('operational baseline dry-run produces a provenance-marked private plan without PII or writes', () => {
    const report = analyzeOperationalBaseline(input(), { reconciledAt: '2026-08-22T01:00:00.000Z' });
    assert.equal(report.dryRun, true);
    assert.equal(report.writePerformed, false);
    assert.equal(report.publicRecords, 1);
    assert.equal(report.baselineEligible, 1);
    assert.equal(report.baselineExisting, 0);
    assert.equal(report.baselinePlanned, 1);
    assert.equal(report.baselineProjected, 1);
    assert.deepEqual(report.blockers, []);
    const row = report.plannedRows[0];
    assert.equal(row.baseline_source, baseline.BASELINE_SOURCE);
    assert.equal(row.baseline_status, baseline.BASELINE_STATUS);
    assert.equal(row.baseline_version, baseline.BASELINE_VERSION);
    assert.equal(row.record_id, 'LEGACY_0001');
    assert.equal('submitter_email' in row, false);
    assert.equal('request_id' in row, false);
    assert.equal('approver_email' in row, false);
    assert.equal('audit_action' in row, false);
    assert.deepEqual(Object.keys(row), baseline.HEADERS);
    assert.ok(pipeline.WORKBOOK_BOUNDARY.private.includes(baseline.SHEET_NAME));
    assert.equal(workbookConfig.classifyLocationSheet(baseline.SHEET_NAME), 'private');
});

test('a second reconciliation is idempotent and approved staging deterministically overrides the baseline', () => {
    const first = analyzeOperationalBaseline(input(), { reconciledAt: '2026-08-22T01:00:00.000Z' });
    const secondInput = input({
        private: { sheets: {
            Unit_Allowlist: [{ unit_code: 'CA_TINH_PHU_THO', active: true }],
            Operational_Baseline: first.plannedRows,
        } },
    });
    const second = analyzeOperationalBaseline(secondInput, { reconciledAt: '2026-08-22T02:00:00.000Z' });
    assert.equal(second.baselineExisting, 1);
    assert.equal(second.baselinePlanned, 0);
    assert.deepEqual(second.blockers, []);

    const merged = baseline.mergeOperationalRecords({
        baselineRows: first.plannedRows,
        stagingRows: [{
            record_id: 'LEGACY_0001', target_record_id: 'LEGACY_0001', unit_code: 'CA_TINH_PHU_THO',
            location_name: 'Công an tỉnh Phú Thọ (đã duyệt)', public_phone: '0210', coordinates: '21.3,105.4',
            status: 'APPROVED', reviewed_at: '2026-08-22T02:00:00.000Z',
        }],
    });
    assert.equal(merged.length, 1);
    assert.equal(merged[0].name, 'Công an tỉnh Phú Thọ (đã duyệt)');
});

test('dry-run fails closed on duplicates, unknown units, and public/baseline drift', () => {
    const source = input({
        public: { sheets: { Published_Locations: [publicRecord(), publicRecord()] } },
        private: { sheets: {
            Unit_Allowlist: [{ unit_code: 'CA_TINH_PHU_THO', active: true }],
            Operational_Baseline: [{ ...baseline.toBaselineRow(publicRecord({ name: 'Drift' }), '2026-08-22T00:00:00.000Z') }],
        } },
    });
    const report = analyzeOperationalBaseline(source);
    assert.ok(report.blockers.includes('PUBLIC_DUPLICATE_RECORD_ID:LEGACY_0001'));
    assert.ok(report.blockers.includes('BASELINE_PUBLIC_RECORD_MISMATCH:LEGACY_0001'));

    const unknown = analyzeOperationalBaseline(input({
        public: { sheets: { Published_Locations: [publicRecord({ unit_code: 'UNKNOWN_UNIT' })] } },
    }));
    assert.ok(unknown.blockers.includes('UNKNOWN_UNIT_CODE:UNKNOWN_UNIT'));

    const duplicateBaseline = analyzeOperationalBaseline(input({
        private: { sheets: {
            Unit_Allowlist: [{ unit_code: 'CA_TINH_PHU_THO', active: true }],
            Operational_Baseline: [
                baseline.toBaselineRow(publicRecord(), '2026-08-22T00:00:00.000Z'),
                baseline.toBaselineRow(publicRecord(), '2026-08-22T00:00:00.000Z'),
            ],
        } },
    }));
    assert.ok(duplicateBaseline.blockers.includes('BASELINE_DUPLICATE_RECORD_ID:LEGACY_0001'));
});

test('CLI remains dry-run only and report output is local evidence', () => {
    assert.throws(() => parseArgs(['--input', 'fixture.json', '--apply']), /OPERATIONAL_BASELINE_DRY_RUN_ONLY/);
    assert.deepEqual(parseArgs(['--dry-run', '--input', 'fixture.json']), {
        input: 'fixture.json', report: '', reconciledAt: '', dryRun: true,
    });
    assert.throws(() => parseArgs(['--unknown']), /OPERATIONAL_BASELINE_ARGUMENT_INVALID/);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'operational-baseline-'));
    const sourcePath = path.join(dir, 'source.json');
    const reportPath = path.join(dir, 'report.json');
    fs.writeFileSync(sourcePath, JSON.stringify(input()), 'utf8');
    const report = runOperationalBaselineDryRun({ input: sourcePath, report: reportPath, reconciledAt: '2026-08-22T01:00:00.000Z' });
    assert.equal(report.writePerformed, false);
    assert.equal(JSON.parse(fs.readFileSync(reportPath, 'utf8')).baselinePlanned, 1);
});
