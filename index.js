module.exports = parseInt(process.versions.node) < 8
  ? require('./lib/Transformer')
  : require('./src/Transformer');