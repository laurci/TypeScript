namespace ts {
    export function isCompilerModuleSpecifier(node: Expression): node is StringLiteral {
        return isStringLiteral(node) && node.text === "compiler";
    }

    export type MacroDeclarationNode = Omit<FunctionDeclaration | FunctionExpression, "name"> & { name: Identifier };

    export type MacroCallExpressionNode = Omit<CallExpression, "expression"> & {
        expression: Omit<NonNullExpression, "expression"> & {expression: Identifier}
    };

    export type MacroTaggedTemplateExpressionNode = Omit<TaggedTemplateExpression, "tag"> & { tag: Omit<NonNullExpression, "expression"> & {expression: Identifier} };

    export function isMacroDeclarationNode(node: Node): node is MacroDeclarationNode {
        return (isFunctionDeclaration(node) || isFunctionExpression(node)) && !!node.name && isIdentifier(node.name) && hasSyntacticModifier(node, ModifierFlags.Macro);
    }

    export function isMacroCallExpressionNode(node: Node): node is MacroCallExpressionNode {
        return isCallExpression(node) && isNonNullExpression(node.expression) && isIdentifier(node.expression.expression);
    }

    export function isMacroTaggedTemplateExpressionNode(node: Node): node is MacroTaggedTemplateExpressionNode {
        return isTaggedTemplateExpression(node) && isNonNullExpression(node.tag) && isIdentifier(node.tag.expression);
    }

    export type MacroDeclarationType = "function" | "taggedTemplate" | "derive";
    interface MacroDeclaration<TType extends MacroDeclarationType = MacroDeclarationType, TNode extends Node = Node> {
        type: TType;
        node: TNode;
    };

    type MacroDeclarationsMapper<T extends {
        [key in MacroDeclarationType]: MacroDeclaration<key, Node>
    }> = T;

    type MacroNodesMapper<T extends {
        [key in MacroDeclarationType]: Node
    }> = T;

    type FunctionMacroDeclaration = MacroDeclaration<"function", MacroDeclarationNode>;
    type TaggedTemplateMacroDeclaration = MacroDeclaration<"taggedTemplate", MacroDeclarationNode>;
    type DeriveMacroDeclaration = MacroDeclaration<"derive", MacroDeclarationNode>;

    type MacroDeclarationsMap = MacroDeclarationsMapper<{
        function: FunctionMacroDeclaration;
        taggedTemplate: TaggedTemplateMacroDeclaration;
        derive: DeriveMacroDeclaration;
    }>;

    type MacroNodesMap = MacroNodesMapper<{
        function: MacroCallExpressionNode;
        taggedTemplate: MacroTaggedTemplateExpressionNode;
        derive: ClassDeclaration;
    }>;


    export function isMacroDeclarationOfType<T extends MacroDeclarationType>(type: T, declaration: MacroDeclaration): declaration is MacroDeclarationsMap[T] {
        return declaration.type === type;
    }

    export interface MacroHooks<TNode extends Node> {
        transform: TransformApiFunction<TNode>[];
        check: CheckApiFunction<TNode>[];
    }

    function createEmptyHooks<TNode extends Node>(): MacroHooks<TNode> {
        return {
            transform: [],
            check: []
        };
    }

    export interface BaseMacro {
    }

    interface MacroWithDeclaration<T extends MacroDeclaration> {
        declaration: T
    };

    export interface FunctionMacro extends BaseMacro, MacroWithDeclaration<FunctionMacroDeclaration>, MacroWithTransformApi<MacroCallExpressionNode>, MacroWithCheckApi<MacroCallExpressionNode> {

    }

    export interface TaggedTemplateMacro extends BaseMacro, MacroWithDeclaration<TaggedTemplateMacroDeclaration>, MacroWithTransformApi<MacroTaggedTemplateExpressionNode>, MacroWithCheckApi<MacroTaggedTemplateExpressionNode> {

    }

    export interface DeriveMacro<_T> extends BaseMacro, MacroWithDeclaration<DeriveMacroDeclaration>, MacroWithTransformApi<ClassDeclaration>, MacroWithCheckApi<ClassDeclaration> {

    }

    export interface UsingMacro extends BaseMacro, MacroWithDeclaration<FunctionMacroDeclaration>, MacroWithTransformApi<UseStatement>, MacroWithCheckApi<MacroCallExpressionNode> {

    }

    export type MacroExecutor<T extends BaseMacro = BaseMacro> = (this: T, ...args: any[]) => void;

    const macroBindings = new Map<Node, MacroDeclaration>();
    const deriveMacros = new Map<string, DeriveMacroDeclaration>();
    const macroHooks = new Map<MacroDeclaration, MacroHooks<Node>>();
    const metaprogramSources = new Set<string>();

    export function bindMacro<TType extends MacroDeclarationType>(macroType: TType, declarationNode: MacroDeclarationsMap[TType]["node"], node: MacroNodesMap[TType]) {
        macroBindings.set(node, {
            node: declarationNode,
            type: macroType
        });
    }

    export function getMacroBinding<TType extends MacroDeclarationType>(_type: TType, node: MacroNodesMap[TType]): MacroDeclarationsMap[TType] | undefined {
        return macroBindings.get(node) as MacroDeclarationsMap[TType];
    }

    export function tryBindDeriveMacroNode(declaration: MacroDeclarationNode) {
        const thisParameter = getThisParameter(declaration as FunctionDeclaration);
        if(thisParameter && thisParameter.type && isTypeReferenceNode(thisParameter.type)) {
            if(isIdentifier(thisParameter.type.typeName) && thisParameter.type.typeName.escapedText === "DeriveMacro") {
                const firstTypeArgument = thisParameter.type.typeArguments?.[0];
                if(firstTypeArgument && isTypeReferenceNode(firstTypeArgument) && isIdentifier(firstTypeArgument.typeName)) {
                    if(!deriveMacros.has(firstTypeArgument.typeName.escapedText.toString())) {
                        deriveMacros.set(firstTypeArgument.typeName.escapedText.toString(), {
                            type: "derive",
                            node: declaration
                        });
                    }
                }
            }
        }
    }

    export function getDeriveMacros(node: ClassDeclaration): DeriveMacroDeclaration[] {
        const declarations: DeriveMacroDeclaration[] = [];

        const derivesElements = getClassDerivesHeritageElements(node);
        for(let derivesElement of derivesElements) {
            if(isIdentifier(derivesElement.expression)) {
                const declaration = deriveMacros.get(derivesElement.expression.escapedText.toString());
                if(declaration) {
                    declarations.push(declaration);
                }
            }
        }

        return declarations;
    }

    export function getDeriveMacrosMap() {
        return deriveMacros;
    }

    export function getMacroDeclarations(): MacroDeclaration[] {
        const macros: MacroDeclaration[] = [];
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

    export function getHooksForMacro<T extends MacroDeclarationType, TMacro extends BaseMacro>(declaration: MacroDeclarationsMap[T], contextProvider: (hooks: MacroHooks<MacroNodesMap[T]>) => TMacro): MacroHooks<MacroNodesMap[T]> {
        if(macroHooks.has(declaration)) return macroHooks.get(declaration) as MacroHooks<MacroNodesMap[T]>;

        const executor = loadMacro<TMacro>(declaration.node);

        const hooks = createEmptyHooks<MacroNodesMap[T]>();
        const macroContext: TMacro = contextProvider(hooks);

        executor.call(macroContext);

        macroHooks.set(declaration, hooks);
        return hooks;
    }
}
