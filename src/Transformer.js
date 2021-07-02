const path = require('path');
const { log } = require('./utils');
const fs = require('fs');
const { parse } = require("@babel/parser");
const generate = require("@babel/generator").default;
const template = require('@babel/template').default;
const traverse = require('@babel/traverse').default;
const t = require('@babel/types');
const inquirer =require('inquirer');

const cycle = ['constructor', 'render', 'componentDidMount', 'getDerivedStateFromProps', 'shouldComponentUpdate', 'getSnapshotBeforeUpdate', 'componentDidUpdate','componentWillUnmount'];

class Transformer {
    constructor(main) {
        this.mainFile = path.join(process.cwd(), main.input || 'index.jsx');
        this.outFile = path.join(process.cwd(), main.output || 'index.jsx');
        this.imports = [];
        this.fcBody = [];
        this.classMethod = [];
        this.cycle = [];
        this.state = [];
        this.return = {};
        this.setState = [];
        this.ast = {};
        this.code=""
    }

    walkAst = () => {
        const content = fs.readFileSync(this.mainFile, 'utf-8');
        const ast = parse(content, { sourceType: "module", plugins: ["jsx"] });
        traverse(ast, {
            ClassDeclaration(path) {
                const functions=[];
                path.node.body.body.forEach(item => {
                    const methodName=item.key.name;
                    if(cycle.indexOf(methodName)===-1){
                        functions.push(t.functionDeclaration(item.key,item.params,item.body));
                    }else if(methodName==='render'){
                        functions.push(item.body.body[0])
                    }else if(methodName==='constructor'){
                        // 
                    }
                });
                const blockStatements = t.blockStatement(functions);
                path.replaceWith(t.functionDeclaration(path.node.id, [t.identifier('props')], blockStatements))
            },
            MemberExpression(path){
                const parent=path.parent;
                const node=path.node;
                if(node.object.type==="ThisExpression"&&node.property.name==="state"){
                    path.parentPath.replaceWith(parent.property);
                }
            }
        });
        this.ast = ast;
    }

    output=()=>{
        fs.writeFileSync(this.outFile,this.code)
    }

    genFc = () => {
        const { code } = generate(this.ast, {
            quotes: 'single',
        });
        this.code=code;
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