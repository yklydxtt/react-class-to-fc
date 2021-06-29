module.exports = parseInt(process.versions.node) < 8
  ? require('./lib/index')
  : require('./src/index');