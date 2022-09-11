const fs = require('fs');
const path = require('path');
const webpack = require('../lib/webpack');

fs.rmSync(path.join(__dirname, 'dist'), { recursive: true, force: true });

const compiler = webpack({
  mode: 'none',
  entry: {
    'require-expression': path.join(__dirname, 'src/require-expression.js'),
    // 'dynamic-import': path.join(__dirname, 'src/dynamic-import.js'),
    // cjs: path.join(__dirname, 'src/cjs.js'),
    // esm: path.join(__dirname, 'src/esm.js'),
  },
  output: {
    path: path.join(__dirname, 'dist'),
  },
});

compiler.run((err, stats) => {
  if (err) {
    console.error(err);
    return;
  }
  if (stats.hasErrors()) {
    const errors = stats.toJson().errors;
    console.error(errors);
    return;
  }
  console.log('编译成功');
});
