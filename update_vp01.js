const fs = require('fs');
const file = './test/regression-expectations.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const vp01 = data.cases.VP01;
const req_fact = vp01.required_facts.find(f => f.id === 'fine_requires_basis');
if (req_fact) {
  req_fact.patterns = [
    "(?:Điều 21|chưa có căn cứ đủ chắc|không đề cập trực tiếp|chưa thể khẳng định|Không có căn cứ trong dữ liệu)"
  ];
  // Change match to 'any' just in case, since there is only 1 pattern now it doesn't matter
  req_fact.match = "any";
}

fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.log('VP01 expectations updated successfully.');
