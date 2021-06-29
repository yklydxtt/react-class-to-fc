#! /usr/bin/env node

const chalk = require('chalk');
const program = require('commander');
const version = require('../package.json').version;

program.version(version);
program.command('')
