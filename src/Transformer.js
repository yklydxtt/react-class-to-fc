const path = require('path');
const { log } = require('./utils');
const fs = require('fs');
const { parse } = require("@babel/parser");
const generate = require("@babel/generator").default;
const traverse = require('@babel/traverse').default;
const t = require('@babel/types');
const inquirer = require('inquirer');

const cycle = ['constructor', 'render', 'componentDidMount', 'getDerivedStateFromProps', 'shouldComponentUpdate', 'getSnapshotBeforeUpdate', 'componentDidUpdate', 'componentWillUnmount'];
const unusedImports=['Component','PureComponent']
class Transformer {
    constructor(main) {
        this.mainFile = path.join(process.cwd(), main.input || 'index.jsx');
        const [name,ext]=main.input.split('.');
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
        this.outerExpress = [];
        // 函数中的body
        this.componentBody=[];
    }

    walkAst = () => {
        const _self = this;
        const content = fs.readFileSync(this.mainFile, 'utf-8');
        const ast = parse(content, { sourceType: "module", plugins: ["jsx","decorators-legacy"] });
        traverse(ast, {
            ClassDeclaration(path) {
                path.traverse({
                    ClassMethod(path){
                        _self.handleClassFn(path);
                    },
                    ClassProperty(path){
                        _self.handleClassFn(path);
                    }
                })
                // 生成useState
                _self.state.forEach(item => {
                    const decl = t.arrayPattern([t.identifier(item.key), t.identifier(`set${item.key[0].toUpperCase()}${item.key.slice(1)}`)]);
                    const call = t.callExpression(t.identifier("useState"), [item.value])
                    _self.componentBody.unshift(t.variableDeclaration("const", [t.variableDeclarator(decl, call)]))
                });
                const blockStatements = t.blockStatement(_self.componentBody);
                path.replaceWith(t.functionDeclaration(path.node.id, [t.identifier('props')], blockStatements));
            },
            MemberExpression(path) {
                const parent = path.parent;
                const node = path.node;
                if (node.object.type === "ThisExpression" && node.property.name === "state") {
                    if(parent.property){
                        path.parentPath.replaceWith(parent.property);
                    }else{
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
                    blockStatement.replaceWith&&blockStatement.replaceWith(...blockBodyList);
                } else if (node.object.type === 'ThisExpression' && path.parent.type === 'CallExpression') {
                    path.replaceWith(node.property);
                } else if (node.object.type === 'ThisExpression'&&node.property.name!=='props') {
                    _self.outerVariable.push(node.property.name);
                    path.parentPath.get('left').replaceWith(path.node.property);
                }else if(node.object.type === 'ThisExpression'&&node.property.name==='props'){
                    // props解构赋值
                    path.replaceWith(node.property);
                }
            }
        });
        // 处理outerExpression
        const fnoe=this.handleOuterExpress();
        // 处理hooks的引入
        const fnhi=this.handleHooksImports();
        const fns={...fnoe,...fnhi};
        traverse(ast,fns);
        this.ast = ast;
    }

    handleClassFn=(path)=>{
        const node = path.node;
        const methodName = node.key.name;
        if(node.value&&node.value.type==='ObjectExpression'){
            if(node.key.name==='state'){
                node.value.properties.forEach(item => {
                    const state = {};
                    state.key = item.key.name;
                    state.value = item.value
                    this.state.push(state);
                });
                this.collectHooks('useState');
            }
            return;
        }
        if (cycle.indexOf(methodName) === -1) {
            // 处理非生命周期函数
            const params=node.params?node.params:node.value.params;
            if(node.value&&node.value.type==='ArrowFunctionExpression'){
                this.componentBody.push(t.VariableDeclaration('const',[t.VariableDeclarator(node.key,node.value)]));
                return;
            }
            this.componentBody.push(t.functionDeclaration(node.key, params, node.body));
        } else if (methodName === 'constructor') {
            // 处理constructor
            node.body.body.forEach(statement => {
                const expression = statement.expression || {};
                // 处理Super
                if (expression.callee && expression.callee.type === 'Super') {
                    return;
                }
                // 处理this.state
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
            })
        } else if (methodName === 'componentDidMount') {
            // 处理componentDidMount
            this.collectHooks('useEffect');
            const expression = t.expressionStatement(t.callExpression(t.identifier('useEffect'), [this.createArrowFn(node), t.arrayExpression([])]));
            this.componentBody.unshift(expression);
        } else if (methodName === 'componentWillUnmount') {
            // 处理componentWillUnmount
            this.collectHooks('useEffect');
            const expression = t.expressionStatement(t.callExpression(t.identifier('useEffect'), [t.arrowFunctionExpression([], t.blockStatement([t.returnStatement(this.createArrowFn(node))])), t.arrayExpression([])]))
            this.componentBody.push(expression);
        } else if (methodName === 'render') {
            // 处理render
            this.componentBody.push(...node.body.body);
        }
    }

    handleOuterExpress = () => {
        // this.outerExpress
        const _self=this;
        return {
            Program(path) {
                const newNode=path.node;
                _self.outerVariable.forEach(item=>{
                    const variable=t.variableDeclaration('let',[t.variableDeclarator(t.identifier(item))]);
                    newNode.body.unshift(variable);
                });
                path.replaceWith(newNode);
            }
        }
    }

    handleHooksImports=()=>{
        const _self=this;
        return {
            ImportDeclaration(path){
                const node=path.node;
                if(node.source.value==='react'){
                    node.specifiers=(node.specifiers.filter(item=>item.type==='ImportDefaultSpecifier'||unusedImports.indexOf(item.imported.name)===-1));
                    _self.hooks.forEach(hookName=>{
                        node.specifiers.push(t.importSpecifier(t.identifier(hookName),t.identifier(hookName)));
                    })
                }
            }
        }
    }

    createArrowFn=(node)=>{
        const body = node.body;
        let arrowFn;
        if(node.value&&node.value.type==='ArrowFunctionExpression'){
            arrowFn=node.value;
        }else{
            arrowFn=t.arrowFunctionExpression([], body)
        }
        return arrowFn;
    }

    collectHooks = (hookName) => {
        if (this.hooks.indexOf(hookName) === -1) {
            this.hooks.push(hookName);
        }
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