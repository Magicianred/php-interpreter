/**
 * @authors
 * https://github.com/eou/php-interpreter
 * @description
 * The main entry of evaluator.
 */

import { Node } from "../php-parser/src/ast/node";
import { AST } from "../php-parser/src/index";
import { Env } from "./environment";
import { IMap } from "./utils/map";
import { Stack } from "./utils/stack";
import { ILocation } from "./variable";

/**
 * @param {AST}     ast - abstract syntax tree
 * @param {Env}     env - execution environment
 * @param {Node}    exp - current execute expressions (AST node)
 * @param {Stack}   stk - stack keeping a log of the functions which are called during the execution
 */
export class Evaluator {
    public ast: AST;
    public env: Env;
    public exp: Node;
    public stk: Stack<IStkNode>;

    /**
     * @description
     * The main entry for running the evaluator
     */
    public run: () => void;

    /**
     * @description
     * The main entry for evaluation
     */
    public evaluate: () => void;

    /**
     * @description
     * The basic assignment operator is "=".
     * And there are "combined operators" for all of the binary arithmetic, array union and string operators
     * @file evaluator/evaluation/assign.ts
     */
    public evaluateAssign: () => void;

    /**
     * @description
     * Convert array on PHP to map object in the variable system
     * @file
     * evaluator/evaluation/array.ts
     */
    public evaluateArray: () => void;

    /**
     * @description
     * Evaluate the global variable
     * @file
     * evaluator/evaluation/global.ts
     */
    public evaluateGlobal: () => void;

    /**
     * @description
     * Evaluate the offset of the array or string or object
     * @file
     * evaluator/evaluation/offset.ts
     */
    public evaluateOffset: () => void;

    /**
     * @description
     * Evaluate the local variable
     * @file
     * evaluator/evaluation/variable.ts
     */
    public evaluateVariable: () => void;

    /**
     * @description
     * Evaluate the binary operator
     * @file
     * evaluator/evaluation/bin.ts
     */
    public evaluateBinary: () => void;

    constructor(ast: AST) {
        this.ast = ast;
        this.env = new Env();
        this.stk = new Stack<IStkNode>();
    }
}

Evaluator.prototype.run = function() {
    // the root node of AST is "Program", its children field contains the expressions we'll evaluate
    this.ast.children.forEach((child: Node) => {
        const stknode: IStkNode = { node: child, val: undefined };
        this.stk.push(stknode);
        this.evaluate();
    });
};

Evaluator.prototype.evaluate = function() {
    // each time evaluate top element of stack
    const expr: Node = this.stk.top.value.node; this.stk.pop();
    if (expr.kind === "expressionstatement") {
        switch (expr.expression.kind) {
            // `[1,2];` `"abc";` `1.6;` actually do nothing before the sequence point so don't need to evaluate
            // if it might be evaluated, it will be treated as a rval which we need its value,
            // such as `$a[];` will throw reading fatal error in offical Zend PHP interpreter
            case "array":
            case "number":
            case "string":
            case "boolean":
                break;
            case "assign": {
                const stknode: IStkNode = {
                    node: expr.expression,
                };
                this.stk.push(stknode);
                this.evaluateAssign();
                break;
            }
            case "variable": {
                // declare a new variable or do nothing if it exists
                const stknode: IStkNode = {
                    node: expr.expression,
                };
                this.stk.push(stknode);
                this.evaluateVariable();
                break;
            }
            default:
                break;
        }
    } else if (expr.kind === "boolean") {
        // directly evaluate
        const stknode: IStkNode = {
            val: Boolean(expr.value),
        };
        this.stk.push(stknode);
    } else if (expr.kind === "number") {
        // directly evaluate
        const stknode: IStkNode = {
            val: Number(expr.value),    // 0x539 == 02471 == 0b10100111001 == 1337e0
        };
        this.stk.push(stknode);
    } else if (expr.kind === "string") {
        // directly evaluate
        const stknode: IStkNode = {
            val: String(expr.value),
        };
        this.stk.push(stknode);
    } else if (expr.kind === "assign") {
        const stknode: IStkNode = {
            node: expr,
        };
        this.stk.push(stknode);
        this.evaluateAssign();
    } else if (expr.kind === "variable") {
        const stknode: IStkNode = {
            node: expr,
        };
        this.stk.push(stknode);
        this.evaluateVariable();
    } else if (expr.kind === "array") {
        const stknode: IStkNode = {
            node: expr,
        };
        this.stk.push(stknode);
        this.evaluateArray();
    } else if (expr.kind === "global") {
        const stknode: IStkNode = {
            node: expr,
        };
        this.stk.push(stknode);
        this.evaluateGlobal();
    } else {
        throw new Error("Eval Error: Unknown expression type: " + expr.kind);
    }
};

/**
 * @description
 * Node in the execution stack. It could be a AST node, an instruction, an operator and a value
 */
export interface IStkNode {
    val?: any;           // Any AST nodes which can be evaluated to a value should store its value here, e.g. 1, true, "abc", { ... }
    loc?: ILocation[];   // Any AST nodes which can be found in memory should store its location here
    inst?: string;       // instructions, e.g. READ, WRITE, END
    node?: Node;         // AST node
}

/**
 * @description
 * Array model extracted from PHP
 * @see 
 * https://github.com/php/php-langspec/blob/master/spec/12-arrays.md
 */
export interface IArray {
    val: IMap<any>;     // array data
    idx: number;        // optimization: array next available index
}

/**
 * @description
 * Object model extracted from PHP
 * @see
 * https://www.php.net/manual/en/language.types.object.php
 * https://www.php.net/manual/en/language.oop5.php
 */
export interface IObject {
    
}
