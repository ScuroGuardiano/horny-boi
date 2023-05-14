import parser from 'luaparse';
import * as fs from 'fs/promises';
import { last, splitPacalCase } from './helpers.js';

const code = await fs.readFile("./hello-world.lua").then(b => b.toString("utf-8"));

const operatorReplaceMap = {
    "or": "||",
    "and": "&&"
}

const superTypeProcessors = {
    "Literal": processLiteral,
    "Statement": processStatement,
    "Expression": processExpression,
    "Declaration": processDeclaration,
    "Identifier": processIdentifier,
    "Clause": processClause
}

/**
 * 
 * @param {*} node 
 * @param { boolean } accessValue If there's need to read the value this have to be set on true.
 * that's because when we read the value transpiler must check if value have to be read from global
 * context or from local context and return correct code to access the value.
 * @returns 
 */
function processNode(node, accessValue = false) {
    const superType = getSupertype(node);
    const processor = superTypeProcessors[superType];
    if (!processor) {
        throw new Error(`No processor for node supertype: ${superType}.`);
    }
    return processor(node, accessValue);
}

// #region S C O P E
    /**
     * @typedef { { parent: Scope, variables: Set<string> } } Scope
     */

    /** @type { Scope[] } */
    const scopes = [];

    /** @type { Scope } */
    let currentScope = null;
    
    function enterNewScope() {
        scopes.push({ parent: currentScope, variables: new Set() });
        currentScope = last(scopes);
    }

    function exitScope() {
        scopes.pop();
        currentScope = last(scopes) ?? null;
    }

    /**
     * @param { string[] } variables
     */
    function declareLocal(variables) {
        // currentScope will be always at least chunk, so no null check here
        variables.forEach(v => currentScope.variables.add(v));
    }

    function isLocallyDeclared(key) {
        let current = currentScope;
        while (current !== null) {
            if (current.variables.has(key)) {
                return true;
            }
            current = current.parent;
        }
        return false;
    }

    function isDeclaredInCurrentScope(key) {
        return currentScope.variables.has(key);
    }
// #endregion

// #region S T A T E M E N T S
     
const statementProcessors = {
    "CallStatement": processCallStatement,
    "ReturnStatement": processReturnStatement,
    "IfStatement": processIfStatement,
    "LocalStatement": processLocalStatement,
    "AssignmentStatement": processAssignmentStatement
}

function processStatement(node) {
    const processor = statementProcessors[node.type];
    if (!processor) {
        throw new Error(`Can't process statement ${node.type}.`);
    }
    return processor(node) + ";";
}

function processCallStatement(node) {
    return processCallExpression(node.expression);
}

function processReturnStatement(node) {
    if (node.arguments.length === 0) {
        return "return";
    }
    if (node.arguments.length > 1) {
        throw new Error("Sorry, currently my transpiler doesn't support return of multiple values.");
    }
    return "return " + processNode(node.arguments[0]);
}

function processIfStatement(node) {
    return processClauses(node.clauses);
}

function processLocalStatement(node) {
    if (node.variables.length === 1) {
        const name = processNode(node.variables[0]);
        const value = node.init[0] ? processNode(node.init[0], true) : "null";
        if (isDeclaredInCurrentScope(name)) {
            return `/* let */ ${name} = ${value}`;
        }
        declareLocal([name]);
        return `let ${name} = ${value}`;
    }
    // More than one variable
    const declarations = { names: [], values: [] };
    node.variables.forEach(($var, i) => {
        const name = processNode($var);
        const value = node.init[0] ? processNode(node.init[i], true) : "null";
        declarations.names.push(name);
        declarations.values.push(value);
    });
    const notDeclared = declarations.names.filter(name => !isDeclaredInCurrentScope(name));
    declareLocal(declarations.names);

    if (notDeclared.length === declarations.names.length) {
        return `let [${declarations.names.join(", ")}] = [${declarations.values.join(", ")}]`;
    }

    const declarationsStr = "let " + notDeclared.join(', ');
    const assigments = `[${declarations.names.join(", ")}] = [${declarations.values.join(", ")}]`;
    return `${declarationsStr};\n${assigments}`;
}

function processAssignmentStatement(node) {
    if (node.variables.length === 1) {
        const name = processNode(node.variables[0]);
        const value = processNode(node.init[0], true);
        if (isLocallyDeclared(name)) {
            return `${name} = ${value}`;
        }
        return `$ctx.assignGlobal({ ${name}: ${value} })`;
    }

    const assigments = { names: [], values: [] };
    node.variables.forEach(($var, i) => {
        let name = processNode($var);
        const value = node.init[i] ? processNode(node.init[i], true) : "null";
        if (!isLocallyDeclared(name)) {
            name = `$_${name}`;
        }
        assigments.names.push(name);
        assigments.values.push(value);
    });

    const globals = assigments.names
        .filter(n => n.startsWith("$_"))
        .map(n => n.substring(2));
    const globalsObjAssigments = "{ " + globals.map(g => `${g}: ${"$_" + g}`).join(", ") + " }";
    
    if (globals.length) {
        let out = "{\n"
        out += `  let ${globals.map(g => `$_${g}`).join(', ')};\n`;
        out += `  [${assigments.names.join(', ')}] = [${assigments.values.join(', ')}];\n`;
        out += `  $ctx.assignGlobal(${globalsObjAssigments});\n`
        out += "}"
        return out;
    }
    return `[${assigments.names.join(', ')}] = [${assigments.values.join(', ')}]`;

}

// #endregion

// #region E X P R E S S I O N S
const expressionProcessors = {
    "CallExpression": processCallExpression,
    "BinaryExpression": processBinaryExpression,
    "LogicalExpression": processLogicalExpression
}

function shouldUseParenthes(expressionArgumentNode) {
    const superType = getSupertype(expressionArgumentNode);
    return !["Identifier", "Literal"].includes(superType);
}

function processExpression(node) {
    const processor = expressionProcessors[node.type];
    if (!processor) {
        throw new Error(`Can't process expression ${node.type}.`);
    }
    return processor(node);
}

function processCallExpression(node) {
    // let name = builtInFunctionsReplaceMap[node.base.name] ?? node.base.name;
    let name = node.base.name;
    if (!isLocallyDeclared(node.base.name)) {
        if (node.arguments.length) {
            return `$ctx.callGlobalFn("${node.base.name}", ${processArguments(node.arguments)})`;
        }
        return `$ctx.callGlobalFn("${node.base.name}")`;
    }

    return name + "(" + processArguments(node.arguments) + ")";
}

function processBinaryExpressionArgument(node) {
    if (shouldUseParenthes(node)) {
        return `(${processNode(node, true)})`;
    }
    return processNode(node, true);
}

function processBinaryExpression(node) {
    const operator = operatorReplaceMap[node.operator] ?? node.operator;

    return `${processBinaryExpressionArgument(node.left)} ${operator} ${processBinaryExpressionArgument(node.right)}`;
}

function processLogicalExpression(node) {
    const operator = operatorReplaceMap[node.operator] ?? node.operator;
    // return processNode(node.left) + ` ${operator} ` + processNode(node.right);
    return `${processBinaryExpressionArgument(node.left)} ${operator} ${processBinaryExpressionArgument(node.right)}`;
}
// #endregion

// #region L I T E R A L S
const literalProcessors = {
    "StringLiteral": processStringLiteral,
    "NumericLiteral": processNumericLiteral
}

function processLiteral(node) {
    const processor = literalProcessors[node.type];
    if (!processor) {
        throw new Error(`Can't process literal ${node.type}.`);
    }
    return processor(node);
}

function processStringLiteral(node) {
    return node.raw;
}

function processNumericLiteral(node) {
    return node.value.toString();
}
// #endregion

// #region I D E N T I F I E R S
function processIdentifier(node, accessValue = false) {
    if (accessValue) {
        if (!isLocallyDeclared(node.name)) {
            return `$ctx.getGlobal("${node.name}")`;
        }
    }
    return node.name;
}
// #endregion

// #region D E C L A R A T I O N S
const declarationProcessors = {
    "FunctionDeclaration": processFunctionDeclaration
}

function processDeclaration(node) {
    const processor = declarationProcessors[node.type];
    if (!processor) {
        throw new Error(`Can't process declaration ${node.type}.`);
    }
    return processor(node) + "\n";
}

function processFunctionDeclaration(node) {
    enterNewScope();
    let declaration = "";
    const fnName = processNode(node.identifier);

    if (node.isLocal) {
        declaration += "function " + fnName + "(";
        declareLocal([fnName]);
    } else {
        declaration += "function ("
    }

    let params = node.parameters.map(param => processNode(param));
    declareLocal(params);
    declaration += params.join(", ") + ") {";
    const body = processBody(node.body);
    
    let completeCode = declaration + "\n" + body + "\n}";

    if (!node.isLocal) {
        completeCode = `$ctx.declareGlobalFn("${fnName}", ${completeCode})`;
    }
    exitScope();
    return completeCode;
}
// #endregion

// #region C L A U S E S
const clausesProcessors = {
    "IfClause": processIfClause,
    "ElseifClause": processElseIfClause,
    "ElseClause": processElseClause
}

function processClause(node) {
    const processor = clausesProcessors[node.type];
    if (!processor) {
        throw new Error(`Can't process clause ${node.type}.`);
    }
    return processor(node);
}

function processClauses(nodeList) {
    return nodeList.map(node => processClause(node)).join("\n");
}

function processIfClause(node) {
    enterNewScope();
    let out = "if (";
    out += processNode(node.condition) + ") {\n";
    out += processBody(node.body) + "\n}"
    exitScope();
    return out;
}

function processElseIfClause(node) {
    enterNewScope();
    let out = "else if (";
    out += processNode(node.condition) + ") {\n";
    out += processBody(node.body) + "\n}"
    exitScope();
    return out;
}

function processElseClause(node) {
    enterNewScope();
    let out = "else {\n";
    out += processBody(node.body) + "\n}"
    exitScope();
    return out;
}

// #endregion

// #region O T H E R S
function getSupertype(node) {
    return last(splitPacalCase(node.type));
}

function processBody(nodeList, indent = "  ") {
    let lines = nodeList.map(node => processNode(node));
    let out = lines.join("\n");
    if (typeof indent === "string") {
        out = out.split('\n').map(line => indent + line).join('\n');
    }
    return out;
}

function processArguments(nodeList) {
    const args = [];
    nodeList.forEach(argNode => args.push(processNode(argNode, true)));
    return args.join(', ');
}
// #endregion

const header = `import { LuaLib, LuaContext } from './lualib.js';

const $ctx = new LuaContext();\n\n`

export default function transpile(ast) {
    enterNewScope();
    return header + processBody(ast.body, null);
}

const ast = parser.parse(code);

await fs.writeFile("./out.ast.json", JSON.stringify(ast, null, 2));
await fs.writeFile("./out.js", transpile(ast));
