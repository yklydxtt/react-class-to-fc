"use strict";

const Path = require('path');

class Transformer {
  constructor(main, options = {}) {
    // super();
    this.mainFile = Path.resolve(process.cwd(), main || '');
    this.outFile = Path.resolve(process.cwd(), options.output);
  }

  transform() {}

  start() {
    console.log(this.mainFile, this.outFile);
  }

}

module.exports = Transformer;