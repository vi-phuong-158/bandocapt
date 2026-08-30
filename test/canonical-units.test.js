'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    CANONICAL_UNITS,
    CANONICAL_UNIT_TOTAL,
    getCanonicalUnits,
    findCanonicalUnit,
    isCanonicalUnitCode,
} = require('../lib/canonical-units');
const pipeline = require('../setup/apps-script');

test('canonical unit directory contains exactly 148 units of Phu Tho', () => {
    assert.equal(CANONICAL_UNIT_TOTAL, 148);
    assert.equal(CANONICAL_UNITS.length, 148);

    const countXa = CANONICAL_UNITS.filter(u => u.unitName.startsWith('Công an xã')).length;
    const countPhuong = CANONICAL_UNITS.filter(u => u.unitName.startsWith('Công an phường')).length;
    const countTT = CANONICAL_UNITS.filter(u => u.unitName.startsWith('Công an thị trấn')).length;

    assert.equal(countXa, 133, 'Phu Tho must have exactly 133 commune police units');
    assert.equal(countPhuong, 15, 'Phu Tho must have exactly 15 ward police units');
    assert.equal(countTT, 0, 'Phu Tho must have 0 town police units in canonical list');
    assert.equal(countXa + countPhuong + countTT, 148);
});

test('canonical unit codes and names are strictly unique and valid', () => {
    const codes = new Set();
    const names = new Set();

    CANONICAL_UNITS.forEach(unit => {
        assert.ok(unit.unitCode, 'unitCode must not be empty');
        assert.ok(unit.unitName, 'unitName must not be empty');
        assert.match(unit.unitCode, /^[A-Z0-9_]+$/, 'unitCode must be uppercase alphanumeric and underscores');

        const codeLower = unit.unitCode.toLowerCase();
        const nameLower = unit.unitName.toLowerCase();

        assert.equal(codes.has(codeLower), false, 'Duplicate unitCode: ' + unit.unitCode);
        assert.equal(names.has(nameLower), false, 'Duplicate unitName: ' + unit.unitName);

        codes.add(codeLower);
        names.add(nameLower);
    });

    assert.equal(codes.size, 148);
    assert.equal(names.size, 148);
});

test('all 7 units without current published locations exist in canonical directory', () => {
    const expected7Units = [
        { code: 'CA_XA_VINH_PHU', name: 'Công an xã Vĩnh Phú' },
        { code: 'CA_XA_NHAN_NGHIA', name: 'Công an xã Nhân Nghĩa' },
        { code: 'CA_XA_YEN_PHU', name: 'Công an xã Yên Phú' },
        { code: 'CA_XA_AN_NGHIA', name: 'Công an xã An Nghĩa' },
        { code: 'CA_XA_CAO_DUONG', name: 'Công an xã Cao Dương' },
        { code: 'CA_XA_MUONG_HOA', name: 'Công an xã Mường Hoa' },
        { code: 'CA_PHUONG_TAN_HOA', name: 'Công an phường Tân Hòa' },
    ];

    expected7Units.forEach(({ code, name }) => {
        assert.equal(isCanonicalUnitCode(code), true, 'Unit ' + code + ' must be recognized');
        const found = findCanonicalUnit(code);
        assert.ok(found, 'Unit ' + code + ' must be found');
        assert.equal(found.unitName, name);
    });
});

test('getCanonicalUnits returns 148 safe DTOs sorted in Vietnamese collation', () => {
    const publicUnits = getCanonicalUnits();
    assert.equal(publicUnits.length, 148);

    publicUnits.forEach(unit => {
        assert.ok(unit.unitCode);
        assert.ok(unit.label);
        assert.equal(unit.email, undefined);
        assert.equal(unit.allowed_emails, undefined);
        assert.equal(unit.notes, undefined);
    });

    for (let i = 1; i < publicUnits.length; i++) {
        const prev = publicUnits[i - 1].label;
        const curr = publicUnits[i].label;
        assert.ok(prev.localeCompare(curr, 'vi') <= 0, 'Collation error: ' + prev + ' should be before or equal to ' + curr);
    }
});

test('findCanonicalUnit is case-insensitive and rejects unknown/synthetic units', () => {
    assert.equal(findCanonicalUnit('ca_xa_hy_cuong')?.unitName, 'Công an xã Hy Cương');
    assert.equal(findCanonicalUnit('CA_XA_HY_CUONG')?.unitName, 'Công an xã Hy Cương');
    assert.equal(findCanonicalUnit('Ca_Xa_Hy_Cuong')?.unitName, 'Công an xã Hy Cương');

    assert.equal(findCanonicalUnit('TEST_CA_TEST'), null);
    assert.equal(findCanonicalUnit('CA_UNKNOWN'), null);
    assert.equal(findCanonicalUnit(''), null);
    assert.equal(findCanonicalUnit(null), null);

    assert.equal(isCanonicalUnitCode('CA_XA_HY_CUONG'), true);
    assert.equal(isCanonicalUnitCode('TEST_CA_TEST'), false);
    assert.equal(isCanonicalUnitCode('CA_A'), false);
});

test('pipeline in setup/apps-script.js matches canonical units and resolves active units', () => {
    assert.equal(pipeline.CANONICAL_UNITS.length, 148);
    assert.equal(typeof pipeline.listCanonicalUnits, 'function');
    assert.equal(pipeline.listCanonicalUnits().length, 148);

    const unit = pipeline.resolveCanonicalUnitByCode('ca_xa_vinh_phu');
    assert.ok(unit);
    assert.equal(unit.unitCode, 'CA_XA_VINH_PHU');
    assert.equal(unit.unitName, 'Công an xã Vĩnh Phú');

    const activeUnits = pipeline.resolveActiveUnits([]);
    assert.equal(activeUnits.length, 148);
    assert.equal(pipeline.resolveActiveUnitByCode('CA_XA_VINH_PHU', [])?.unitName, 'Công an xã Vĩnh Phú');
});
