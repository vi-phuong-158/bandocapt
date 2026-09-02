(function accommodationBetaModule(globalScope) {
  'use strict';

  const PHU_THO_BOUNDS = Object.freeze({
    minLat: 20.55,
    maxLat: 21.7,
    minLng: 104.75,
    maxLng: 105.5
  });
  const MAX_RECORDS = 5000;
  const ALLOWED_SOURCE_TYPES = new Set(['PILOT_INTERNAL', 'CSV_IMPORT']);
  const ID_PATTERN = /^ACC_[A-Za-z0-9_-]{3,80}$/;
  const CODE_PATTERN = /^[A-Za-z0-9_-]{2,80}$/;
  const PHONE_PATTERN = /^[0-9+()\-\s]{7,32}$/;

  function text(value, field, min, max) {
    if (typeof value !== 'string') throw new Error(`${field} must be text`);
    const normalized = value.trim().replace(/[\u0000-\u001f\u007f]/g, '');
    if (normalized.length < min || normalized.length > max) {
      throw new Error(`${field} has an invalid length`);
    }
    return normalized;
  }

  function code(value, field, required) {
    if ((value === undefined || value === null || value === '') && !required) return '';
    const normalized = text(value, field, 2, 80);
    if (!CODE_PATTERN.test(normalized)) throw new Error(`${field} has invalid characters`);
    return normalized;
  }

  function coordinate(value, field, lower, upper) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < lower || numeric > upper) {
      throw new Error(`${field} is outside the approved Phu Tho boundary`);
    }
    return numeric;
  }

  function date(value, field) {
    const normalized = text(value, field, 10, 40);
    if (Number.isNaN(Date.parse(normalized))) throw new Error(`${field} is not a valid date`);
    return normalized;
  }

  function toPublicRecord(raw, pilotLocalityCode) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('record must be an object');
    const id = text(raw.id, 'id', 7, 84);
    if (!ID_PATTERN.test(id)) throw new Error('id must use the ACC_ public identifier format');
    const localityCode = code(raw.localityCode, 'localityCode', true);
    if (localityCode !== pilotLocalityCode) throw new Error('record is outside the pilot locality');
    const sourceType = text(raw.sourceType, 'sourceType', 3, 32);
    if (!ALLOWED_SOURCE_TYPES.has(sourceType)) throw new Error('sourceType is not approved');
    const verificationStatus = text(raw.verificationStatus, 'verificationStatus', 3, 24);
    if (verificationStatus !== 'ACTIVE') throw new Error('only ACTIVE records are publishable');

    const publicRecord = {
      id,
      kind: 'accommodation',
      name: text(raw.name, 'name', 2, 160),
      address: text(raw.address, 'address', 4, 260),
      latitude: coordinate(raw.latitude, 'latitude', PHU_THO_BOUNDS.minLat, PHU_THO_BOUNDS.maxLat),
      longitude: coordinate(raw.longitude, 'longitude', PHU_THO_BOUNDS.minLng, PHU_THO_BOUNDS.maxLng),
      localityCode,
      policeUnitCode: code(raw.policeUnitCode, 'policeUnitCode', false),
      contactPhone: raw.contactPhone ? text(raw.contactPhone, 'contactPhone', 7, 32) : '',
      sourceType,
      verificationStatus,
      lastVerifiedAt: date(raw.lastVerifiedAt, 'lastVerifiedAt'),
      updatedAt: date(raw.updatedAt, 'updatedAt')
    };
    if (publicRecord.contactPhone && !PHONE_PATTERN.test(publicRecord.contactPhone)) {
      throw new Error('contactPhone has invalid characters');
    }
    return Object.freeze(publicRecord);
  }

  function prepareDataset(config) {
    const featureConfig = config && typeof config === 'object' ? config : {};
    if (featureConfig.enabled !== true) {
      return Object.freeze({ enabled: false, pilotLocalityCode: '', records: Object.freeze([]), rejected: Object.freeze([]) });
    }

    const pilotCodes = Array.isArray(featureConfig.pilotLocalityCodes) ? featureConfig.pilotLocalityCodes : [];
    if (pilotCodes.length !== 1) throw new Error('Accommodation beta requires exactly one pilot locality');
    const pilotLocalityCode = code(pilotCodes[0], 'pilotLocalityCodes[0]', true);
    const rawRecords = Array.isArray(featureConfig.records) ? featureConfig.records : [];
    if (rawRecords.length > MAX_RECORDS) throw new Error(`Accommodation beta exceeds ${MAX_RECORDS} records`);

    const seenIds = new Set();
    const records = [];
    const rejected = [];
    rawRecords.forEach((record, index) => {
      try {
        const publicRecord = toPublicRecord(record, pilotLocalityCode);
        if (seenIds.has(publicRecord.id)) throw new Error('duplicate public identifier');
        seenIds.add(publicRecord.id);
        records.push(publicRecord);
      } catch (error) {
        rejected.push(Object.freeze({ index, reason: error.message }));
      }
    });

    return Object.freeze({
      enabled: true,
      pilotLocalityCode,
      records: Object.freeze(records),
      rejected: Object.freeze(rejected)
    });
  }

  function resolvePoliceUnit(record, policeLocations) {
    if (!record || !Array.isArray(policeLocations)) return null;
    const unitCode = record.policeUnitCode || record.localityCode;
    if (!unitCode) return null;
    const exactMatches = policeLocations.filter((location) => location && String(location.unitCode || '') === unitCode);
    return exactMatches.length === 1 ? exactMatches[0] : null;
  }

  function filterRecords(records, query) {
    const normalizedQuery = String(query || '').trim().toLocaleLowerCase('vi-VN');
    if (!normalizedQuery) return Array.isArray(records) ? records.slice() : [];
    return (Array.isArray(records) ? records : []).filter((record) => {
      const searchable = [record.name, record.address, record.localityCode, record.policeUnitCode]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('vi-VN');
      return searchable.includes(normalizedQuery);
    });
  }

  function benchmark(records, query) {
    const start = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    const matches = filterRecords(records, query);
    const end = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    return Object.freeze({ recordCount: Array.isArray(records) ? records.length : 0, matchCount: matches.length, filterMs: end - start });
  }

  const api = Object.freeze({
    PHU_THO_BOUNDS,
    MAX_RECORDS,
    prepareDataset,
    resolvePoliceUnit,
    filterRecords,
    benchmark
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  globalScope.AccommodationBeta = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
