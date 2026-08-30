'use strict';

const canonicalData = require('../data/phutho-canonical-units.json');

const CANONICAL_UNITS = Object.freeze(
    canonicalData.map(u => Object.freeze({
        unitCode: String(u.unitCode || '').trim(),
        unitName: String(u.unitName || '').trim(),
    }))
);

const CANONICAL_UNIT_TOTAL = CANONICAL_UNITS.length;

const unitsByNormalizedCode = new Map();
CANONICAL_UNITS.forEach(unit => {
    const key = unit.unitCode.toLowerCase();
    if (key) unitsByNormalizedCode.set(key, unit);
});

function getCanonicalUnits() {
    return CANONICAL_UNITS.map(unit => ({
        unitCode: unit.unitCode,
        label: unit.unitName,
    })).sort((a, b) => a.label.localeCompare(b.label, 'vi'));
}

function findCanonicalUnit(unitCode) {
    const key = String(unitCode || '').trim().toLowerCase();
    return unitsByNormalizedCode.get(key) || null;
}

function isCanonicalUnitCode(unitCode) {
    return Boolean(findCanonicalUnit(unitCode));
}

module.exports = {
    CANONICAL_UNITS,
    CANONICAL_UNIT_TOTAL,
    getCanonicalUnits,
    findCanonicalUnit,
    isCanonicalUnitCode,
};
