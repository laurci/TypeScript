namespace ts {

    export const RuntimeValue = {
        string: "",
        number: 0,
        boolean: false,
        symbol: Symbol(),
        object: {},
        promise: new Promise<any>(() => {})
    };

    export type MacroDeclarationNode = Omit<FunctionDeclaration | FunctionExpression, "name"> & { name: Identifier };

    export function isMacroDeclarationNode(node: Node): node is MacroDeclarationNode {
        return (isFunctionDeclaration(node) || isFunctionExpression(node)) && !!node.name && isIdentifier(node.name) && hasSyntacticModifier(node, ModifierFlags.Macro);
    }

    export type MacroCallExpressionNode = Omit<CallExpression, "expression"> & {
        expression: Omit<NonNullExpression, "expression"> & {expression: Identifier}
    };

    export function isMacroCallExpressionNode(node: Node): node is MacroCallExpressionNode {
        return isCallExpression(node) && isNonNullExpression(node.expression) && isIdentifier(node.expression.expression);
    }

    export function isCompilerModuleSpecifier(node: Expression): node is StringLiteral {
        return isStringLiteral(node) && node.text === "compiler";
    }

    export interface MacroResult {
        kind: "replace" | "append" | "prepend" | "remove" | "appendAll" | "prependAll";
    }

    export interface MacroReplaceResult extends MacroResult {
        kind: "replace";
        node: Node;
    }

    export function isMacroReplaceResult(result: MacroResult): result is MacroReplaceResult {
        return result.kind === "replace";
    }

    export interface MacroAppendResult extends MacroResult {
        kind: "append";
        node: Node;
    }

    export function isMAcroAppendResult(result: MacroResult): result is MacroAppendResult {
        return result.kind === "append";
    }

    export interface MacroPrependResult extends MacroResult {
        kind: "prepend";
        node: Node;
    }

    export function isMacroPrependResult(result: MacroResult): result is MacroPrependResult {
        return result.kind === "prepend";
    }

    export interface MacroRemoveResult extends MacroResult {
        kind: "remove";
    }

    export function isMacroRemoveResult(result: MacroResult): result is MacroRemoveResult {
        return result.kind === "remove";
    }

    export interface MacroAppendAllResult extends MacroResult {
        kind: "appendAll";
        node: Node;
    }

    export function isMacroAppendAllResult(result: MacroResult): result is MacroAppendAllResult {
        return result.kind === "appendAll";
    }

    export interface MacroPrependAllResult extends MacroResult {
        kind: "prependAll";
        node: Node;
    }

    export function isMacroPrependAllResult(result: MacroResult): result is MacroPrependAllResult {
        return result.kind === "prependAll";
    }

    export class MacroResults {
        private list: MacroResult[] = [];

        public static toList(results: MacroResults) {
            return results.list;
        }

        private static replacementNode(newNode: Node, oldNode: Node) {
            return {
                ...newNode,
                parent: oldNode.parent
            };
        }

        public static toReplacement(node: Node, results: MacroResults): Node | undefined {
            const result = MacroResults.toList(results);
            const remove = result.some(isMacroRemoveResult);
            if(remove) return factory.createVoidZero();

            const replace = result.find(x => isMacroReplaceResult(x)) as MacroReplaceResult;
            if(replace) {
                return this.replacementNode(replace.node, node);
            }

            return node;
        }

        replace(node: Node) {
            this.list.push({ kind: "replace", node } as MacroReplaceResult);
        }

        append(node: Node) {
            this.list.push({ kind: "append", node } as MacroAppendResult);
        }

        prepend(node: Node) {
            this.list.push({ kind: "prepend", node } as MacroPrependResult);
        }

        remove() {
            this.list.push({ kind: "remove" } as MacroRemoveResult);
        }

        appendAll(node: Node) {
            this.list.push({ kind: "appendAll", node } as MacroAppendAllResult);
        }

        prependAll(node: Node) {
            this.list.push({ kind: "prependAll", node } as MacroPrependAllResult);
        }
    }

    export function createBaseMacroContext(sourceFile: SourceFile, context: TransformationContext): BaseMacroContext {
        return {
            factory: context.factory,
            sourceFile,
            context,
            result: new MacroResults(),
        };
    }

    export interface BaseMacroContext {
        readonly factory: NodeFactory;
        readonly context: TransformationContext;
        readonly sourceFile: SourceFile;
        readonly result: MacroResults;
    };

    export interface CallExpressionMacroContext extends BaseMacroContext {
        readonly node: MacroCallExpressionNode;
    };

    export type MacroFunction<T extends BaseMacroContext = BaseMacroContext> = (this: T, ...args: any[]) => void;

    const macroBindings = new Map<Node, MacroDeclarationNode>();
    const metaprogramSources = new Set<string>();

    export function bindMacro(node: Node, declaration: MacroDeclarationNode) {
        macroBindings.set(node, declaration);
    }

    export function getMacroBinding(node: Node): MacroDeclarationNode | undefined {
        return macroBindings.get(node);
    }

    export function getMacroDeclarations(): MacroDeclarationNode[] {
        const macros: MacroDeclarationNode[] = [];
        macroBindings.forEach((macro) => macros.push(macro));
        return macros;
    }

    export function addMetaprogramSourceFile(path: string) {
        metaprogramSources.add(path);
    }

    export function getMetaprogramSourceFiles(): string[] {
        const sourceFiles: string[] = [];
        metaprogramSources.forEach((source) => sourceFiles.push(source));
        return sourceFiles;
    }

    export function executeCallExpressionMacro(context: TransformationContext, node: MacroCallExpressionNode, declaration: MacroDeclarationNode): Node | undefined {
        const macroContext: CallExpressionMacroContext = {
            ...createBaseMacroContext(getSourceFileOfNode(node), context),
            node
        };

        const macro = loadMacro<CallExpressionMacroContext>(declaration);

        macro.apply(macroContext);

        return MacroResults.toReplacement(node, macroContext.result);
    }

}