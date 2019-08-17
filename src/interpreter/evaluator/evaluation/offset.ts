/**
 * @authors
 * https://github.com/eou/php-interpreter
 * @description
 * The file for offset evaluation (an element in an array or a string)
 * @see
 * https://www.php.net/manual/en/arrayaccess.offsetset.php
 * https://github.com/php/php-langspec/blob/master/spec/10-expressions.md#subscript-operator
 */

import { Node } from "../../php-parser/src/ast/node";
import { Evaluator, IStkNode } from "../evaluator";

/**
 * @description
 * subscript-expression:
 *      dereferencable-expression   [   expression_optional   ]
 * dereferencable-expression:
 *      variable
 *      (   expression   )
 *      array-creation-expression
 *      string-literal
 * A subscript-expression designates a (possibly non-existent) element of an array or string or object of a type that implements `ArrayAccess`.
 */
Evaluator.prototype.evaluateOffset = function() {
    const offsetNode = this.stk.top.value; this.stk.pop();
    if (offsetNode.node.kind !== "offsetlookup") {
        throw new Error("Eval Error: Evaluate wrong AST node: " + offsetNode.node.kind + ", should be offsetlookup");
    }

    // `$a = $b[];`, `$b[$a[]] = 1;` is illegal
    if ((offsetNode.inst === undefined || offsetNode.inst !== "WRITE")
        && !offsetNode.node.offset) {
        throw new Error("Fatal error:  Cannot use [] for reading.");
    }

    const stknode: IStkNode = {};
    const inst = offsetNode.inst;   // READ or WRITE

    if (inst === "READ") {
        /**
         * READ
         * if `$a[1][2]` doesnt exist, it will print notice: Undefined variable: a and then return null, it won't create any new array
         */
        if (offsetNode.node.offset) {
            // could be false, e.g. $a[] = 1;
            this.stk.push({ node: offsetNode.node.offset, inst: "READ" });   // read offset value, e.g. $a, $a[1],
        }
        this.stk.push({ node: offsetNode.node.what, inst: "READ" });
        // evaluate 'what' which is the deref name, a "variable" or "array" or "string" AST node
        this.evaluate();
        const derefNode = this.stk.top.value; this.stk.pop();
        if (derefNode.val === undefined) {
            // cannot find this array or string
            console.error("Notice: Undefined variable " + offsetNode.node.what.name);
            stknode.val = null;
            this.stk.push(stknode);
            return;
        } else if (derefNode.val === null) {
            // do nothing
            stknode.val = null;
            this.stk.push(stknode);
            return;
        } else {
            // evaluate 'offset' which is a key in the deref, and it should be integer or string
            this.evaluate();
            const keyNode: Node = this.stk.top.value; this.stk.pop();
            let offsetName = keyNode.val;
            if (offsetName !== undefined) {
                if (typeof offsetName !== "number" && typeof offsetName !== "boolean" && typeof offsetName !== "string") {
                    console.error("Warning: Illegal offset type " + offsetName);    // only warning but not terminate program
                    offsetName = "";  // treat offset as null which is [] => 1
                }
                switch (typeof offsetName) {
                    case "boolean": {
                        offsetName = Number(offsetName);
                        break;
                    }
                    case "string": {
                        // check if it could be converted to number
                        const validDecInt = /^(|[-]?0|-[1-9][0-9]*)$/;    // 010 × | 10.0 × | -10 √ | -0 √
                        if (validDecInt.test(offsetName)) {
                            offsetName = Number(offsetName);
                        }
                        break;
                    }
                    case "number": {
                        offsetName = Math.trunc(offsetName);  // maybe 0 and -0, but the storing map's key is string, they will all be 0
                        break;
                    }
                    default:
                        break;
                }
            }
            if (typeof derefNode.val === "boolean" || typeof derefNode.val === "number") {
                stknode.val = null;
                this.stk.push(stknode);
                return;
            } else if (typeof derefNode.val === "string") {
                // The subscript operator can not be used on a string value in a byRef context
                if (offsetNode.node.what.byref) {
                    throw new Error("Fatal error:  Uncaught Error: Cannot create references to/from string offsets.");
                }
                // If both dereferencable-expression and expression designate strings,
                // expression is treated as if it specified the int key zero instead and a non-fatal error is produces.
                if (typeof offsetName === "string") {
                    offsetName = 0;
                }
                const str: string = derefNode.val;
                if (offsetName < 0) {
                    // If the integer is negative, the position is counted backwards from the end of the string
                    offsetName += str.length;
                }
                if (str[offsetName] === undefined) {
                    console.error("Notice: Uninitialized string offset " + offsetName);
                }
                stknode.val = str[offsetName];  // if it still out of bound, there will be a undefined
                this.stk.push(stknode);
                return;
            } else if (typeof derefNode.val === "object" && derefNode.val.type === "IArray") {
                const array = derefNode.val.elt;
                if (array.size === 0 || array.get(offsetName) === undefined) {
                    console.error("Notice: Undefined offset: " + offsetName);
                    stknode.val = null;
                } else {
                    stknode.val = array.get(offsetName);
                }
                this.stk.push(stknode);
                return;
            } else if (typeof derefNode.val === "object" && derefNode.val.type === "IObject") {
                // TODO: any objects belonging to a class which implements `ArrayAccess`
            } else {
                throw new Error("Eval error: undefined dereferencable-expression type in reading offset");
            }
        }
    } else if (inst === "WRITE") {
        /**
         * WRITE
         * if `$a[][1][0]` doesnt exist, it will create a new array then assgin null to it, the empty offset will be 0
         */
        if (offsetNode.node.offset) {
            // could be false, e.g. $a[] = 1;
            this.stk.push({ node: offsetNode.node.offset, inst: "READ" });   // read offset value, e.g. $a, $a[1],
        }
        this.stk.push({ node: offsetNode.node.what, inst: "WRITE" });   // get the array or string or object's location
        // evaluate 'what' which is the deref name, a "variable" or "array" or "string" AST node
        this.evaluate();
        const derefNode = this.stk.top.value; this.stk.pop();
        // should be "variable" node, if it is a value on the left of the assignment, it will throw fatal error before pushed into stack

        let offsetName = null;
        if (offsetNode.node.offset) {
            // evaluate 'offset' which is a key in the deref, and it should be integer or string
            this.evaluate();
            const keyNode: Node = this.stk.top.value; this.stk.pop();
            offsetName = keyNode.val;
            if (offsetName !== undefined) {
                if (typeof offsetName !== "number" && typeof offsetName !== "boolean" && typeof offsetName !== "string") {
                    console.error("Warning: Illegal offset type " + offsetName);    // only warning but not terminate program
                    offsetName = "";  // treat offset as null which is [] => 1
                }
                switch (typeof offsetName) {
                    case "boolean": {
                        offsetName = Number(offsetName);
                        break;
                    }
                    case "string": {
                        // check if it could be converted to number
                        const validDecInt = /^(|[-]?0|-[1-9][0-9]*)$/;    // 010 × | 10.0 × | -10 √ | -0 √
                        if (validDecInt.test(offsetName)) {
                            offsetName = Number(offsetName);
                        }
                        break;
                    }
                    case "number": {
                        offsetName = Math.trunc(offsetName);  // maybe 0 and -0, but the storing map's key is string, they will all be 0
                        break;
                    }
                    default:
                        break;
                }
            } else {
                // $a[$c] = 1;
                console.error("Notice: Undefined variable " + offsetNode.node.offset.name);
                offsetName = "";
            }
        } else {
            offsetName = 0;
        }

        // Now there are deref and offset, we can get its memory location
        if (typeof derefNode.loc.type === "boolean" || typeof derefNode.loc.type === "number") {
            console.error("Warning:  Cannot use a scalar value as an array");
            stknode.loc = undefined;
            this.stk.push(stknode);
            return;
        } else if (typeof derefNode.loc.type === "string") {
            // The subscript operator can not be used on a string value in a byRef context
            if (offsetNode.node.what.byref) {
                throw new Error("Fatal error:  Uncaught Error: Cannot create references to/from string offsets.");
            }
            // If both dereferencable-expression and expression designate strings,
            // expression is treated as if it specified the int key zero instead and a non-fatal error is produces.
            if (typeof offsetName === "string") {
                offsetName = 0;
            }
            if (typeof this.env.get(derefNode.loc.idx).heap._var.vstore.get(derefNode.loc.vstoreId).val !== "string") {
                throw new Error("Eval Error: wrong type in writing string offset");
            }
            const str: string = this.env.get(derefNode.loc.idx).heap._var.vstore.get(derefNode.loc.vstoreId).val;
            if (offsetName < 0) {
                // If the integer is negative, the position is counted backwards from the end of the string
                offsetName += str.length;
                // $a = "abc"; $a[-10] = "d";
                if (offsetName < 0) {
                    console.error("Warning: Illegal string offset " + offsetName);
                }
            }

            const loc = derefNode.loc;
            loc.offset = offsetName;
            stknode.loc = loc;
            this.stk.push(stknode);
            return;
        } else if (derefNode.loc.type === "array") {
            let loc = derefNode.loc;
            
            this.stk.push(stknode);
            return;
        } else if (derefNode.loc.type === "object") {
            // TODO: any objects belonging to a class which implements `ArrayAccess`
        } else if (derefNode.loc.type === "null") {
            // need to create a new array

        } else {
            throw new Error("Eval error: undefined type dereferencable-expression in writing offset");
        }
    } else {
        throw new Error("Eval error: " + inst +  " instruction in offset Node");
    }
};
