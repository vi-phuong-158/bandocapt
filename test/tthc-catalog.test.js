'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    buildCatalog,
    buildGuideProcedures,
    dedupeProcedures,
    deriveCategoryLabel,
    formatFee,
    resolveFee,
    buildFeeIndex,
    sortProcedures,
    buildCategorySummary,
    hasNonEmptyValue,
    parseGuideProcedureRecord,
    readEnvAssignments,
} = require('../scripts/generate-tthc-catalog');

const { buildCitationSource } = require('../api/chat');

function makeRecord(overrides = {}) {
    return {
        cap: 'trung-uong',
        content_hash: 'hash',
        doi_tuong_chinh: 'cong_dan',
        loai_thu_tuc: 'ho_chieu',
        procedure_id: '5568-tw-01',
        source_decision: '5568/QD-BCA',
        source_type: 'tthc',
        text: 'Tên thủ tục: Cấp hộ chiếu\nLoại thủ tục: Hộ chiếu phổ thông\nCấp xử lý: Cấp Trung ương\n',
        title: 'Cấp hộ chiếu',
        ...overrides,
    };
}

test('deriveCategoryLabel đọc nhãn từ chính dòng "Loại thủ tục:" trong text', () => {
    const record = makeRecord({ text: 'Tên thủ tục: X\nLoại thủ tục: Thị thực và e-visa\n' });
    assert.equal(deriveCategoryLabel(record), 'Thị thực và e-visa');
});

test('deriveCategoryLabel dùng fallback map khi text không có dòng "Loại thủ tục:"', () => {
    const record = makeRecord({ loai_thu_tuc: 'tam_tru', text: 'Tên thủ tục: X\n' });
    assert.equal(deriveCategoryLabel(record), 'Tạm trú');
});

test('formatFee: Không phí ở cả le_phi và phi trả về "Không"', () => {
    assert.equal(formatFee({ le_phi: 'Không', phi: 'Không' }), 'Không');
});

test('formatFee: giữ nguyên "Chưa xác minh" nếu một trong hai trường chưa xác minh', () => {
    assert.equal(formatFee({ le_phi: 'Chưa xác minh', phi: 'Không' }), 'Chưa xác minh');
    assert.equal(formatFee({ le_phi: 'Không', phi: 'Chưa xác minh' }), 'Chưa xác minh');
});

test('formatFee: ghép Lệ phí/Phí khi cả hai đều có giá trị khác Không', () => {
    const result = formatFee({ le_phi: '100.000 đồng', phi: '10 USD/lần' });
    assert.match(result, /Lệ phí: 100\.000 đồng/);
    assert.match(result, /Phí: 10 USD\/lần/);
});

test('formatFee: thiếu dữ liệu (undefined) trả về "Chưa xác minh"', () => {
    assert.equal(formatFee(undefined), 'Chưa xác minh');
});

test('resolveFee: ưu tiên audit khi có, bỏ qua le_phi/phi trong record', () => {
    const record = makeRecord({ procedure_id: '5568-tw-01', le_phi: 'Không', phi: 'Không' });
    const feeIndex = buildFeeIndex([{ procedure_id: '5568-tw-01', le_phi: 'Chưa xác minh', phi: 'Chưa xác minh' }]);
    assert.deepEqual(resolveFee(record, feeIndex), { le_phi: 'Chưa xác minh', phi: 'Chưa xác minh' });
});

test('resolveFee: fallback về le_phi/phi của record khi audit không có id (case matt26265)', () => {
    const record = makeRecord({ procedure_id: 'matt26265', le_phi: 'Không', phi: 'Không' });
    const feeIndex = buildFeeIndex([]);
    assert.deepEqual(resolveFee(record, feeIndex), { le_phi: 'Không', phi: 'Không' });
});

test('resolveFee: không có audit và record cũng không có le_phi/phi -> undefined', () => {
    const record = makeRecord({ procedure_id: 'unknown-id' });
    const feeIndex = buildFeeIndex([]);
    assert.equal(resolveFee(record, feeIndex), undefined);
});

test('buildCatalog: gộp record gốc + record mới, phát hiện id thiếu toàn văn', () => {
    const original = {
        tthc_a1: makeRecord({ procedure_id: 'a1', loai_thu_tuc: 'ho_chieu', title: 'Thủ tục A1' }),
        tthc_a2: makeRecord({ procedure_id: 'a2', loai_thu_tuc: 'tam_tru', title: 'Thủ tục A2' }),
    };
    const newRecord = makeRecord({ procedure_id: 'new1', loai_thu_tuc: 'tam_tru', title: 'Thủ tục mới', le_phi: 'Không', phi: 'Không' });
    const audit = [
        { procedure_id: 'a1', le_phi: 'Không', phi: 'Không' },
        { procedure_id: 'a2', le_phi: 'Chưa xác minh', phi: 'Chưa xác minh' },
        { procedure_id: 'missing-1', le_phi: 'Không', phi: 'Không' },
    ];

    const catalog = buildCatalog({ original, newRecord, audit, generatedAt: '2026-07-09T00:00:00.000Z' });

    assert.equal(catalog.procedures.length, 3);
    assert.deepEqual(catalog.missingFromBackups, ['missing-1']);
    assert.equal(catalog.generatedAt, '2026-07-09T00:00:00.000Z');

    const a1 = catalog.procedures.find(p => p.procedureId === 'a1');
    assert.equal(a1.fee, 'Không');
    const a2 = catalog.procedures.find(p => p.procedureId === 'a2');
    assert.equal(a2.fee, 'Chưa xác minh');
    const newProc = catalog.procedures.find(p => p.procedureId === 'new1');
    assert.equal(newProc.fee, 'Không');
});

test('buildCatalog: procedureId không trùng lặp', () => {
    const original = {
        tthc_a1: makeRecord({ procedure_id: 'a1' }),
        tthc_a2: makeRecord({ procedure_id: 'a2' }),
    };
    const newRecord = makeRecord({ procedure_id: 'new1' });
    const catalog = buildCatalog({ original, newRecord, audit: [] });
    const ids = catalog.procedures.map(p => p.procedureId);
    assert.equal(new Set(ids).size, ids.length);
});

test('parseGuideProcedureRecord đọc đúng thủ tục, lĩnh vực, cấp và mục wiki từ guide text', () => {
    const parsed = parseGuideProcedureRecord('guide_demo_01_01', {
        loai_thu_tuc: 'cu_tru',
        source_file: 'B. CU TRU.docx',
        text: [
            'Wiki thủ tục hành chính cấp xã 2025',
            'Lĩnh vực: Đăng ký, quản lý cư trú',
            'Cấp xử lý: Cấp xã',
            'Thủ tục: Đăng ký thường trú',
            'Mục wiki: Phí, lệ phí',
            'Nội dung wiki:',
            'Không thu phí.',
        ].join('\n'),
    });

    assert.equal(parsed.title, 'Đăng ký thường trú');
    assert.equal(parsed.category, 'cu_tru');
    assert.equal(parsed.cap, 'xa');
    assert.equal(parsed.sectionTitle, 'Phí, lệ phí');
    assert.equal(parsed.sectionBody, 'Không thu phí.');
});

test('buildGuideProcedures gộp nhiều chunk guide thành một thủ tục và rút phí từ mục phí/lệ phí', () => {
    const procedures = buildGuideProcedures([
        {
            id: 'guide_cu_tru_01_01',
            metadata: {
                loai_thu_tuc: 'cu_tru',
                source_file: 'B. CU TRU.docx',
                text: [
                    'Wiki thủ tục hành chính cấp xã 2025',
                    'Lĩnh vực: Đăng ký, quản lý cư trú',
                    'Cấp xử lý: Cấp xã',
                    'Thủ tục: Đăng ký thường trú',
                    'Mục wiki: Trình tự thực hiện',
                    'Nội dung wiki:',
                    'Bước 1: Nộp hồ sơ.',
                ].join('\n'),
            },
        },
        {
            id: 'guide_cu_tru_08_01',
            metadata: {
                loai_thu_tuc: 'cu_tru',
                source_file: 'B. CU TRU.docx',
                text: [
                    'Wiki thủ tục hành chính cấp xã 2025',
                    'Lĩnh vực: Đăng ký, quản lý cư trú',
                    'Cấp xử lý: Cấp xã',
                    'Thủ tục: Đăng ký thường trú',
                    'Mục wiki: Phí, lệ phí',
                    'Nội dung wiki:',
                    'Không thu phí.',
                ].join('\n'),
            },
        },
    ]);

    assert.equal(procedures.length, 1);
    assert.equal(procedures[0].title, 'Đăng ký thường trú');
    assert.equal(procedures[0].fee, 'Không thu phí.');
    assert.match(procedures[0].text, /Tên thủ tục: Đăng ký thường trú/);
    assert.match(procedures[0].text, /Trình tự thực hiện:/);
    assert.match(procedures[0].text, /Phí, lệ phí:/);
});

test('buildGuideProcedures loại mục nội dung nội bộ chatbot (nguyên tắc trả lời, quản trị viên, câu hỏi mẫu)', () => {
    const procedures = buildGuideProcedures([
        {
            id: 'guide_internal_01',
            metadata: {
                loai_thu_tuc: 'ho_chieu',
                source_file: 'A. HO CHIEU.docx',
                text: [
                    'Lĩnh vực: Hộ chiếu phổ thông',
                    'Cấp xử lý: Cấp Trung ương',
                    'Thủ tục: Nguyên tắc trả lời của chatbot',
                    'Mục wiki: Toàn văn thủ tục',
                    'Nội dung wiki:',
                    'Noi dung noi bo.',
                ].join('\n'),
            },
        },
        {
            id: 'guide_internal_02',
            metadata: {
                loai_thu_tuc: 'ho_chieu',
                source_file: 'A. HO CHIEU.docx',
                text: [
                    'Lĩnh vực: Hộ chiếu phổ thông',
                    'Cấp xử lý: Cấp Trung ương',
                    'Thủ tục: Người dùng: "Tôi bị mất hộ chiếu"',
                    'Mục wiki: Toàn văn thủ tục',
                    'Nội dung wiki:',
                    'Cau hoi mau.',
                ].join('\n'),
            },
        },
    ]);

    assert.equal(procedures.length, 0);
});

test('buildGuideProcedures bỏ guide trùng tên với thủ tục tthc đã có', () => {
    const procedures = buildGuideProcedures([
        {
            id: 'guide_01',
            metadata: {
                loai_thu_tuc: 'cu_tru',
                source_file: 'B. CU TRU.docx',
                text: [
                    'Lĩnh vực: Đăng ký, quản lý cư trú',
                    'Cấp xử lý: Cấp xã',
                    'Thủ tục: Đăng ký thường trú',
                    'Mục wiki: Toàn văn thủ tục',
                    'Nội dung wiki:',
                    'Noi dung.',
                ].join('\n'),
            },
        },
    ], [
        { title: 'Đăng ký thường trú' },
    ]);

    assert.equal(procedures.length, 0);
});

test('dedupeProcedures: gộp thủ tục trùng (lĩnh vực+cấp+tên), giữ bản có phí đã xác minh', () => {
    const richer = { category: 'thi_thuc', cap: 'tinh', title: 'Cấp thị thực', fee: 'Lệ phí: 25 USD', text: 'chi tiết đầy đủ' };
    const poorer = { category: 'thi_thuc', cap: 'tinh', title: 'Cấp thị thực', fee: 'Chưa xác minh', text: 'ngắn' };
    const distinct = { category: 'thi_thuc', cap: 'tinh', title: 'Cấp lại thị thực', fee: 'Chưa xác minh', text: 'x' };

    const { procedures, dropped } = dedupeProcedures([poorer, richer, distinct]);
    assert.equal(dropped, 1);
    assert.equal(procedures.length, 2);
    const kept = procedures.find(p => p.title === 'Cấp thị thực');
    assert.equal(kept.fee, 'Lệ phí: 25 USD', 'phải giữ bản có phí đã xác minh');
    assert.ok(procedures.some(p => p.title === 'Cấp lại thị thực'), 'thủ tục khác tên không bị gộp');
});

test('sortProcedures: sắp theo thứ tự lĩnh vực cố định rồi cấp rồi tên', () => {
    const procedures = [
        { category: 'tam_tru', cap: 'xa', title: 'B' },
        { category: 'ho_chieu', cap: 'tinh', title: 'A' },
        { category: 'ho_chieu', cap: 'trung-uong', title: 'C' },
    ];
    const sorted = sortProcedures(procedures);
    assert.deepEqual(sorted.map(p => `${p.category}/${p.cap}/${p.title}`), [
        'ho_chieu/trung-uong/C',
        'ho_chieu/tinh/A',
        'tam_tru/xa/B',
    ]);
});

test('buildCategorySummary: đếm đúng số lượng theo lĩnh vực và sắp theo CATEGORY_ORDER', () => {
    const procedures = [
        { category: 'tam_tru', categoryLabel: 'Tạm trú' },
        { category: 'ho_chieu', categoryLabel: 'Hộ chiếu' },
        { category: 'ho_chieu', categoryLabel: 'Hộ chiếu' },
    ];
    const summary = buildCategorySummary(procedures);
    assert.deepEqual(summary, [
        { key: 'ho_chieu', label: 'Hộ chiếu', count: 2 },
        { key: 'tam_tru', label: 'Tạm trú', count: 1 },
    ]);
});

test('readEnvAssignments bỏ comment và giữ cả key có giá trị rỗng để caller tự quyết định', () => {
    const env = readEnvAssignments([
        '# comment',
        'PINECONE_API_KEY=abc',
        'PINECONE_NAMESPACE=',
    ].join('\n'));

    assert.equal(env.get('PINECONE_API_KEY'), 'abc');
    assert.equal(env.get('PINECONE_NAMESPACE'), '');
});

test('hasNonEmptyValue coi chuỗi rỗng và khoảng trắng là không hợp lệ', () => {
    assert.equal(hasNonEmptyValue(''), false);
    assert.equal(hasNonEmptyValue('   '), false);
    assert.equal(hasNonEmptyValue('value'), true);
});

test('data/tthc-catalog.json đã commit: gồm cả TTHC thật và guide, không trùng lặp', () => {
    const catalogPath = path.resolve(__dirname, '..', 'data', 'tthc-catalog.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

    assert.equal(catalog.sourceMode, 'live');
    assert.equal(catalog.includeGuides, true, 'catalog commit gồm cả guide để phủ đủ lĩnh vực');
    // Bộ đầy đủ (tthc + guide) ~145; chặn cả trường hợp thiếu và phình bất thường.
    assert.ok(
        catalog.procedures.length >= 100 && catalog.procedures.length <= 200,
        `Kỳ vọng ~145 thủ tục (tthc + guide), có ${catalog.procedures.length}`
    );

    // Phải có cả thủ tục thật (tthc) lẫn guide — không mất nhóm nào
    assert.ok(
        catalog.procedures.some(p => String(p.procedureId).startsWith('guide:')),
        'catalog phải chứa entry guide'
    );
    assert.ok(
        catalog.procedures.some(p => !String(p.procedureId).startsWith('guide:')),
        'catalog phải giữ thủ tục TTHC thật (procedure_id deep-link được từ chatbot)'
    );

    const ids = catalog.procedures.map(p => p.procedureId);
    assert.equal(new Set(ids).size, ids.length, 'procedureId phải duy nhất');

    for (const proc of catalog.procedures) {
        assert.ok(proc.title, `Thiếu title: ${proc.procedureId}`);
        assert.ok(proc.text, `Thiếu text: ${proc.procedureId}`);
        assert.ok(proc.fee, `Thiếu fee: ${proc.procedureId}`);
        assert.ok(proc.category, `Thiếu category: ${proc.procedureId}`);
        assert.ok(proc.categoryLabel, `Thiếu categoryLabel: ${proc.procedureId}`);
    }

    // Không được lộ nội dung nội bộ chatbot (nguyên tắc trả lời / quản trị viên / câu hỏi mẫu)
    const internalPattern = /(nguyên tắc trả lời|quản trị viên|chatbot|^người dùng\s*:)/i;
    const leaked = catalog.procedures.filter(p => internalPattern.test(p.title));
    assert.equal(leaked.length, 0, `catalog lộ nội dung nội bộ: ${leaked.map(p => p.title).join(' | ')}`);

    const categoryCountSum = catalog.categories.reduce((sum, c) => sum + c.count, 0);
    assert.equal(categoryCountSum, catalog.procedures.length);
    // Lĩnh vực TTHC cốt lõi phải có mặt
    assert.ok(catalog.categories.some(c => c.key === 'ho_chieu'));
    assert.ok(catalog.categories.some(c => c.key === 'thi_thuc'));

    // Không còn thẻ trùng (cùng lĩnh vực + cấp + tên)
    const dupKeys = new Map();
    for (const p of catalog.procedures) {
        const key = `${p.category}|${p.cap}|${p.title.toLowerCase()}`;
        dupKeys.set(key, (dupKeys.get(key) || 0) + 1);
    }
    assert.equal([...dupKeys.values()].filter(v => v > 1).length, 0, 'không được có thủ tục trùng title+cap');

    // Live mode đủ dữ liệu: không còn liệt kê nhầm thủ tục "thiếu"
    assert.deepEqual(catalog.missingFromBackups, []);
});

test('buildCitationSource trả về procedure_id và title để chatbot liên kết tới danh mục', () => {
    const source = buildCitationSource({
        source_file: 'tthc_5568-tw-01.json',
        article: 'Điều 1',
        source_url: '',
        effective_date: '2026-01-01',
        last_verified_at: '2026-07-01',
        procedure_id: '5568-tw-01',
        title: 'Cấp hộ chiếu phổ thông ở trong nước',
    }, 0.8);

    assert.equal(source.procedure_id, '5568-tw-01');
    assert.equal(source.title, 'Cấp hộ chiếu phổ thông ở trong nước');
});

test('buildCitationSource trả về procedure_id rỗng khi metadata không có (vd vector văn bản luật)', () => {
    const source = buildCitationSource({
        source_file: 'luat-xnc.json',
        article: 'Điều 5',
    }, 0.7);

    assert.equal(source.procedure_id, '');
    assert.equal(source.title, '');
});
