"use strict";

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _unsupportedIterableToArray(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }

function _unsupportedIterableToArray(o, minLen) { if (!o) return; if (typeof o === "string") return _arrayLikeToArray(o, minLen); var n = Object.prototype.toString.call(o).slice(8, -1); if (n === "Object" && o.constructor) n = o.constructor.name; if (n === "Map" || n === "Set") return Array.from(o); if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen); }

function _arrayLikeToArray(arr, len) { if (len == null || len > arr.length) len = arr.length; for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i]; return arr2; }

function _iterableToArrayLimit(arr, i) { var _i = arr == null ? null : typeof Symbol !== "undefined" && arr[Symbol.iterator] || arr["@@iterator"]; if (_i == null) return; var _arr = []; var _n = true; var _d = false; var _s, _e; try { for (_i = _i.call(arr); !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const path = require('path');

const _require = require('./utils'),
      log = _require.log;

const fs = require('fs');

const _require2 = require("@babel/parser"),
      parse = _require2.parse;

const generate = require("@babel/generator").default;

const traverse = require('@babel/traverse').default;

const t = require('@babel/types');

const inquirer = require('inquirer');

const cycle = ['constructor', 'render', 'componentDidMount', 'getDerivedStateFromProps', 'shouldComponentUpdate', 'getSnapshotBeforeUpdate', 'componentDidUpdate', 'componentWillUnmount'];
const unusedImports = ['Component', 'PureComponent'];

class Transformer {
  constructor(main) {
    _defineProperty(this, "walkAst", () => {
      const _self = this;

      const content = fs.readFileSync(this.mainFile, 'utf-8');
      const ast = parse(content, {
        sourceType: "module",
        plugins: ["jsx", "decorators-legacy"]
      });
      traverse(ast, {
        ClassDeclaration(path) {
          path.traverse({
            ClassMethod(path) {
              _self.handleClassFn(path);
            },

            ClassProperty(path) {
              _self.handleClassFn(path);
            }

          }); // 生成useState

          _self.state.forEach(item => {
            const decl = t.arrayPattern([t.identifier(item.key), t.identifier(`set${item.key[0].toUpperCase()}${item.key.slice(1)}`)]);
            const call = t.callExpression(t.identifier("useState"), [item.value]); // 防止命名重复的问题，暂时用var

            _self.componentBody.unshift(t.variableDeclaration("var", [t.variableDeclarator(decl, call)]));
          });

          const blockStatements = t.blockStatement(_self.componentBody);
          path.replaceWith(t.functionDeclaration(path.node.id, [t.identifier('props')], blockStatements));
        },

        MemberExpression(path) {
          const parent = path.parent;
          const node = path.node;

          if (node.object.type === "ThisExpression" && node.property.name === "state") {
            if (parent.property) {
              path.parentPath.replaceWith(parent.property);
            } else {
              path.parentPath.parentPath.remove();
            }
          } else if (node.object.type === 'ThisExpression' && node.property.name === 'setState') {
            // 暂时先处理对象形式，后续处理函数形式
            const states = {};
            parent.arguments[0].properties.forEach(item => {
              states[item.key.name] = item.value;
            });
            const blockStatement = path.parentPath.parentPath;
            const blockBodyList = [];

            for (let state in states) {
              const statement = t.expressionStatement(t.callExpression(t.identifier(`set${state[0].toUpperCase()}${state.slice(1)}`), [states[state]]));
              blockBodyList.push(statement);
            }

            blockStatement.replaceWith && blockStatement.replaceWith(...blockBodyList);
          } else if (node.object.type === 'ThisExpression' && path.parent.type === 'CallExpression') {
            path.replaceWith(node.property);
          } else if (node.object.type === 'ThisExpression' && node.property.name !== 'props') {
            _self.outerVariable.push(node.property.name);

            path.parentPath.get('left').replaceWith(path.node.property);
          } else if (node.object.type === 'ThisExpression' && node.property.name === 'props') {
            // props解构赋值
            path.replaceWith(node.property);
          }
        }

      }); // 处理outerExpression

      const fnoe = this.handleOuterExpress(); // 处理hooks的引入

      const fnhi = this.handleHooksImports(); // 处理state为var的问题

      const fnVar = this.handleReplaceVar();

      const fns = _objectSpread(_objectSpread(_objectSpread({}, fnoe), fnhi), fnVar);

      traverse(ast, fns);
      this.ast = ast;
    });

    _defineProperty(this, "handleClassFn", path => {
      const node = path.node;
      const methodName = node.key.name; // 处理state={}

      if (node.value && node.value.type === 'ObjectExpression') {
        if (node.key.name === 'state') {
          node.value.properties.forEach(item => {
            const state = {};
            state.key = item.key.name;
            state.value = item.value;
            this.state.push(state);
          });
          this.collectHooks('useState');
        }

        return;
      }

      if (cycle.indexOf(methodName) === -1) {
        // 处理非生命周期函数
        const params = node.params ? node.params : node.value.params;

        if (node.value && node.value.type === 'ArrowFunctionExpression') {
          this.componentBody.push(t.VariableDeclaration('const', [t.VariableDeclarator(node.key, node.value)]));
          return;
        }

        this.componentBody.push(t.functionDeclaration(node.key, params, node.body));
      } else if (methodName === 'constructor') {
        // 处理constructor
        node.body.body.forEach(statement => {
          const expression = statement.expression || {}; // 处理Super

          if (expression.callee && expression.callee.type === 'Super') {
            return;
          } // 处理this.state


          if (expression.type === 'AssignmentExpression') {
            if (expression.left.property.name === 'state') {
              expression.right.properties.forEach(item => {
                const state = {};
                state.key = item.key.name;
                state.value = item.value;
                this.state.push(state);
              });
              this.collectHooks('useState');
            }

            return;
          }

          this.outerExpress.push(statement);
        });
      } else if (methodName === 'componentDidMount') {
        // 处理componentDidMount
        this.collectHooks('useEffect');
        const expression = t.expressionStatement(t.callExpression(t.identifier('useEffect'), [this.createArrowFn(node), t.arrayExpression([])]));
        this.componentBody.unshift(expression);
      } else if (methodName === 'componentWillUnmount') {
        // 处理componentWillUnmount
        this.collectHooks('useEffect');
        const expression = t.expressionStatement(t.callExpression(t.identifier('useEffect'), [t.arrowFunctionExpression([], t.blockStatement([t.returnStatement(this.createArrowFn(node))])), t.arrayExpression([])]));
        this.componentBody.push(expression);
      } else if (methodName === 'render') {
        // 处理render
        this.componentBody.push(...node.body.body);
      }
    });

    _defineProperty(this, "handleOuterExpress", () => {
      // this.outerExpress
      const _self = this;

      return {
        Program(path) {
          const newNode = path.node;

          _self.outerVariable.forEach(item => {
            const variable = t.variableDeclaration('let', [t.variableDeclarator(t.identifier(item))]);
            newNode.body.unshift(variable);
          });

          path.replaceWith(newNode);
        }

      };
    });

    _defineProperty(this, "handleHooksImports", () => {
      const _self = this;

      return {
        ImportDeclaration(path) {
          const node = path.node;

          if (node.source.value === 'react') {
            node.specifiers = node.specifiers.filter(item => item.type === 'ImportDefaultSpecifier' || unusedImports.indexOf(item.imported.name) === -1);

            _self.hooks.forEach(hookName => {
              node.specifiers.push(t.importSpecifier(t.identifier(hookName), t.identifier(hookName)));
            });
          }
        }

      };
    });

    _defineProperty(this, "handleReplaceVar", () => {
      return {
        VariableDeclaration(path) {
          if (path.node.declarations && path.node.declarations[0].init && path.node.declarations[0].init.callee && path.node.declarations[0].init.callee.name === 'useState') {
            path.node.kind = "const";
          }
        }

      };
    });

    _defineProperty(this, "createArrowFn", node => {
      const body = node.body;
      let arrowFn;

      if (node.value && node.value.type === 'ArrowFunctionExpression') {
        arrowFn = node.value;
      } else {
        arrowFn = t.arrowFunctionExpression([], body);
      }

      return arrowFn;
    });

    _defineProperty(this, "collectHooks", hookName => {
      if (this.hooks.indexOf(hookName) === -1) {
        this.hooks.push(hookName);
      }
    });

    _defineProperty(this, "output", () => {
      fs.writeFileSync(this.outFile, this.code);
      log(`${this.outFile}文件生成成功！`, 'success');
    });

    _defineProperty(this, "genFc", () => {
      const _generate = generate(this.ast, {
        quotes: 'single'
      }),
            code = _generate.code;

      this.code = code;
    });

    this.mainFile = path.join(process.cwd(), main.input || 'index.jsx');

    const _main$input$split = main.input.split('.'),
          _main$input$split2 = _slicedToArray(_main$input$split, 2),
          name = _main$input$split2[0],
          ext = _main$input$split2[1];

    this.outFile = path.join(process.cwd(), main.output || `${name}.fc.${ext}`);
    this.imports = [];
    this.classMethod = [];
    this.cycle = [];
    this.hooks = [];
    this.outerVariable = [];
    this.state = [];
    this.setState = [];
    this.ast = {};
    this.code = "";
    this.outerExpress = []; // 函数中的body

    this.componentBody = [];
  }

  checkFile() {
    if (!/(\.jsx?)/.test(this.mainFile)) {
      log(`not support the file format ${this.mainFile}`);
      process.exit();
    }

    if (!fs.existsSync(this.mainFile)) {
      log(`The source file dose no exist: ${this.mainFile}`);
      process.exit();
    }

    if (!fs.statSync(this.mainFile).isFile()) {
      log(`The source file is not a file: ${this.mainFile}`);
      process.exit();
    }

    if (fs.existsSync(this.outFile)) {
      inquirer.prompt([{
        type: 'confirm',
        message: `The file ${this.outFile} is already exists in output directory. Continue?`,
        name: 'ok'
      }]).then(answers => {
        if (!answers.ok) {
          process.exit();
        }
      });
    }
  }

  start() {
    this.checkFile();
    this.walkAst();
    this.genFc();
    this.output();
  }

}

module.exports = Transformer;