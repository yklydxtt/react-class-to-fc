const path = require('path');
const { log } = require('./utils');
const fs = require('fs');
const { parse } = require("@babel/parser");
const generate = require("@babel/generator").default;
const template = require('@babel/template').default;
const traverse = require('@babel/traverse').default;
const t = require('@babel/types');
const inquirer = require('inquirer');

const cycle = ['constructor', 'render', 'componentDidMount', 'getDerivedStateFromProps', 'shouldComponentUpdate', 'getSnapshotBeforeUpdate', 'componentDidUpdate', 'componentWillUnmount'];

class Transformer {
    constructor(main) {
        this.mainFile = path.join(process.cwd(), main.input || 'index.jsx');
        this.outFile = path.join(process.cwd(), main.output || 'index.jsx');
        this.imports = [];
        this.fcBody = [];
        this.classMethod = [];
        this.cycle = [];
        this.state = [];
        this.hooks=[];
        this.variable = {};
        this.setState = [];
        this.ast = {};
        this.code = "";
        this.outerExpress = [];
    }

    walkAst = () => {
        const _self=this;
        const content = fs.readFileSync(this.mainFile, 'utf-8');
        const ast = parse(content, { sourceType: "module", plugins: ["jsx"] });
        traverse(ast, {
            ClassDeclaration(path) {
                const functions = [];
                path.traverse({
                    ClassMethod(path) {
                        const node = path.node;
                        const methodName = node.key.name;
                        if (cycle.indexOf(methodName) === -1) {
                            functions.push(t.functionDeclaration(node.key, node.params, node.body));
                        } else if (methodName === 'render') {
                            functions.push(node.body.body[0])
                        } else if (methodName === 'constructor') {
                            node.body.body.forEach(statement => {
                                const expression = statement.expression || {};
                                // 处理Super
                                if (expression.callee && expression.callee.type === 'Super') {
                                    return;
                                }
                                // 处理this.state
                                if (expression.type === 'AssignmentExpression') {
                                    if (expression.left.property.name === 'state') {
                                        expression.right.properties.forEach(item=>{
                                            const state={};
                                            state.key=item.key.name;
                                            state.value=item.value
                                            _self.state.push(state);
                                        })
                                    }
                                    return;
                                }
                                this.outerExpress.push(statement);
                            })
                        }
                    }
                })
                _self.state.forEach(item=>{
                    const decl=t.arrayPattern([t.identifier(item.key),t.identifier(`set${item.key[0].toUpperCase()}${item.key.slice(1)}`)]);
                    const call=t.callExpression(t.identifier("useState"),[item.value])
                    functions.unshift(t.variableDeclaration("const",[t.variableDeclarator(decl,call)]))
                })
                const blockStatements = t.blockStatement(functions);
                path.replaceWith(t.functionDeclaration(path.node.id, [t.identifier('props')], blockStatements));
            },
            MemberExpression(path) {
                const parent = path.parent;
                const node = path.node;
                if (node.object.type === "ThisExpression" && node.property.name === "state") {
                    path.parentPath.replaceWith(parent.property);
                }
            }
        });
        // 处理outerExpression
        
        this.ast = ast;
    }

    output = () => {
        fs.writeFileSync(this.outFile, this.code)
    }

    genFc = () => {
        const { code } = generate(this.ast, {
            quotes: 'single',
        });
        this.code = code;
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
            }]).then((answers) => {
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