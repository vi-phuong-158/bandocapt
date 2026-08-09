'use strict';

const fs = require('node:fs');
const path = require('node:path');
const pipeline = require('../setup/apps-script');

function parseArgs(argv) {
    const args = { apply: false, input: '', output: '' };
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === '--apply') args.apply = true;
        if (argv[index] === '--input') args.input = argv[index + 1] || '';
        if (argv[index] === '--output') args.output = argv[index + 1] || '';
    }
    return args;
}

function readRecords(inputPath) {
    const parsed = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.records)) return parsed.records;
    throw new Error('INPUT_MUST_BE_JSON_ARRAY_OR_RECORDS_OBJECT');
}

function migratePublishedLocations(options) {
    if (!options.input) throw new Error('MISSING_INPUT');
    const records = readRecords(options.input);
    const result = pipeline.migrateLegacyLocations(records);
    if (options.apply) {
        if (!options.output) throw new Error('APPLY_REQUIRES_OUTPUT');
        const outputPath = path.resolve(options.output);
        if (path.resolve(options.input) === outputPath) throw new Error('OUTPUT_MUST_DIFFER_FROM_INPUT');
        if (fs.existsSync(outputPath)) fs.copyFileSync(outputPath, `${outputPath}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, `${JSON.stringify({ records: result.records, report: result.report }, null, 2)}\n`, 'utf8');
    }
    return { ...result, applied: Boolean(options.apply) };
}

if (require.main === module) {
    const result = migratePublishedLocations(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify({ applied: result.applied, report: result.report }, null, 2)}\n`);
}

module.exports = { parseArgs, migratePublishedLocations };
