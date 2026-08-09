'use strict';

const fs = require('node:fs');
const path = require('node:path');
const pipeline = require('../setup/apps-script');

function parseArgs(argv) {
    const args = { apply: false, input: '', outputDir: '' };
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === '--apply') args.apply = true;
        if (argv[index] === '--input') args.input = argv[index + 1] || '';
        if (argv[index] === '--output-dir') args.outputDir = argv[index + 1] || '';
    }
    return args;
}

function readJson(inputPath) {
    if (!inputPath) throw new Error('MISSING_INPUT');
    return JSON.parse(fs.readFileSync(inputPath, 'utf8'));
}

function rowCount(value) {
    return Array.isArray(value) ? value.length : 0;
}

function hasPrivateField(record) {
    return Object.keys(record || {}).some(key => !pipeline.PUBLIC_FIELDS.includes(key));
}

function planDualWorkbookMigration(source = {}) {
    const publicRecords = source.publishedRecords || source.public?.Published_Locations || [];
    const privateData = source.private || source;
    const privateSheets = {
        Unit_Allowlist: privateData.allowlistRows || privateData.Unit_Allowlist || [],
        Location_Staging: privateData.stagingRecords || privateData.Location_Staging || [],
        Approval_Audit_Log: privateData.auditEntries || privateData.Approval_Audit_Log || [],
        Staff_Verification_Audit: privateData.verificationEvents || privateData.Staff_Verification_Audit || [],
        Idempotency_Ledger: privateData.idempotencyLedger || privateData.Idempotency_Ledger || [],
        Intake_Setup_Info: privateData.setupInfo || privateData.Intake_Setup_Info || [],
        Form_Responses: privateData.formResponses || privateData.Form_Responses || [],
    };
    if (!Array.isArray(publicRecords)) throw new Error('PUBLISHED_RECORDS_MUST_BE_ARRAY');
    const publicPrivateFieldRows = publicRecords.filter(hasPrivateField).map(record => record.record_id || '(missing-record-id)');
    const allowlistCheck = pipeline.validateAllowlistDuplicates(privateSheets.Unit_Allowlist);
    const report = {
        publicRecordCount: publicRecords.length,
        privateRowCounts: Object.fromEntries(Object.entries(privateSheets).map(([name, rows]) => [name, rowCount(rows)])),
        publicPrivateFieldRows,
        allowlistErrors: allowlistCheck.errors,
        allowlistWarnings: allowlistCheck.warnings,
        rollback: {
            sourceUntouched: true,
            outputIsNewDirectory: true,
            rollbackAction: 'discard generated fixture directory and keep source export',
        },
    };
    return {
        ok: publicPrivateFieldRows.length === 0 && allowlistCheck.ok,
        report,
        publicWorkbook: { Published_Locations: publicRecords.map(record => Object.fromEntries(pipeline.PUBLIC_FIELDS.filter(field => Object.hasOwn(record, field)).map(field => [field, record[field]]))) },
        privateWorkbook: privateSheets,
    };
}

function applyDualWorkbookMigration(plan, outputDir) {
    if (!outputDir) throw new Error('APPLY_REQUIRES_OUTPUT_DIR');
    if (!plan.ok) throw new Error('MIGRATION_VALIDATION_FAILED');
    const resolved = path.resolve(outputDir);
    if (fs.existsSync(resolved)) throw new Error('OUTPUT_DIR_MUST_NOT_EXIST');
    fs.mkdirSync(resolved, { recursive: true });
    fs.writeFileSync(path.join(resolved, 'public-workbook.json'), `${JSON.stringify(plan.publicWorkbook, null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(resolved, 'private-workbook.json'), `${JSON.stringify(plan.privateWorkbook, null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(resolved, 'migration-report.json'), `${JSON.stringify(plan.report, null, 2)}\n`, 'utf8');
}

if (require.main === module) {
    const args = parseArgs(process.argv.slice(2));
    const plan = planDualWorkbookMigration(readJson(args.input));
    if (args.apply) applyDualWorkbookMigration(plan, args.outputDir);
    process.stdout.write(`${JSON.stringify({ applied: args.apply, ok: plan.ok, report: plan.report }, null, 2)}\n`);
}

module.exports = { parseArgs, planDualWorkbookMigration, applyDualWorkbookMigration };
