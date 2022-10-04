namespace ts {
    type TransformNode<T extends Node> = T & {
        replace(node: Node): void;
        remove(): void;
    };

    interface TransformApi<T extends Node> {
        node: TransformNode<T>;
        factory: NodeFactory;
        context: TransformationContext;
        sourceFile: SourceFile;
    }

    export type TransformApiFunction<T extends Node> = (api: TransformApi<T>) => void;

    export interface MacroWithTransformApi<T extends Node> {
        transform(fn: TransformApiFunction<T>): void;
    }

    export function createTransformMacroApi<T extends Node>(hooks: MacroHooks<T>): MacroWithTransformApi<T> {
        return {
            transform(fn) {
                hooks.transform.push(fn);
            }
        };
    }

    export function executeTransformHook(hooks: MacroHooks<Node>, context: TransformationContext, node: Node) {
        return hooks.transform.reduce((node, hook) => {
            let replacement: Node | undefined;
            let remove = false;

            const api: TransformApi<Node> = {
                node: {
                    ...node,
                    replace(newNode) {
                        replacement = newNode;
                    },
                    remove() {
                        remove = true;
                    }
                },
                factory,
                context,
                sourceFile: getSourceFileOfNode(node)
            };

            hook(api);

            if(remove) {
                return factory.createVoidZero();
            }

            if(replacement) {
                return replacement;
            }

            return node;
        }, node);
    }


    export function transformCallExpressionMacro(context: TransformationContext, node: MacroCallExpressionNode): Node | undefined {
        const declaration = getMacroBinding("function", node);
        if(!declaration) return node;

        const hooks = getHooksForMacro<"function", FunctionMacro>(declaration, (hooks) => ({
            declaration,
            ...createTransformMacroApi(hooks),
            ...createCheckApi(hooks)
        }));

        if(!hooks) return node;

        return executeTransformHook(hooks, context, node);
    }

    export function transformTaggedTemplateExpressionMacro(context: TransformationContext, node: MacroTaggedTemplateExpressionNode): Node | undefined {
        const declaration = getMacroBinding("taggedTemplate", node);
        if(!declaration) return node;

        const hooks = getHooksForMacro<"taggedTemplate", TaggedTemplateMacro>(declaration, (hooks) => ({
            declaration,
            ...createTransformMacroApi(hooks),
            ...createCheckApi(hooks)
        }));

        if(!hooks) return node;

        return executeTransformHook(hooks, context, node);
    }

}