const fs = require('fs');
const path = require('path');

function readJson(start, end) {
  const result = [];
  for (let i = start; i <= end; i++) {
    const json = require(`./${i}.json`);
    const tmp = json.obj.list.filter(e => e.bz.includes('杭州')) || [];
    console.log(i, '----', tmp.length);
    result.push(...tmp);
  }
  return result;
}

// readJson(1, 19);

fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify(readJson(1, 19), null, 2));
