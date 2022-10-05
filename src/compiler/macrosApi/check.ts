namespace ts {
    export enum TypeDefinitionKind {
        Intrinsic,
        Object,
        ObjectMember,
        Array,
        Union,
        Intersection,
        GenericInstance,
        GlobalReference,
        ResolvedType
    }

    export interface TypeDefinition<T extends TypeDefinitionKind = TypeDefinitionKind> {
        kind: T;
    }

    export enum IntrinsicTypes {
        String,
        Number,
        Boolean,
        Any,
        Null,
        Undefined,
        Void,
        Never,
    }

    export interface IntrinsicTypeDefinition extends TypeDefinition<TypeDefinitionKind.Intrinsic> {
        type: IntrinsicTypes;
    }

    export interface ObjectTypeDefinition extends TypeDefinition<TypeDefinitionKind.Object> {
        members: ObjectMemberTypeDefinition[]
    }

    export interface ObjectMemberTypeDefinition extends TypeDefinition<TypeDefinitionKind.ObjectMember> {
        name: string;
        type: TypeDefinition;
        optional: boolean;
    }

    export interface ArrayTypeDefinition extends TypeDefinition<TypeDefinitionKind.Array> {
        elementType: TypeDefinition;
    }

    export interface UnionTypeDefinition extends TypeDefinition<TypeDefinitionKind.Union> {
        types: TypeDefinition[];
    }

    export interface IntersectionTypeDefinition extends TypeDefinition<TypeDefinitionKind.Intersection> {
        types: TypeDefinition[];
    }

    export interface GenericInstanceTypeDefinition extends TypeDefinition<TypeDefinitionKind.GenericInstance> {
        type: TypeDefinition;
        typeArguments: TypeDefinition[];
    }

    export interface GlobalReferenceTypeDefinition extends TypeDefinition<TypeDefinitionKind.GlobalReference> {
        name: string;
        arity: number;
    }

    export interface ResolvedTypeDefinition extends TypeDefinition<TypeDefinitionKind.ResolvedType> {
        type: Type;
    }

    export function isIntrinsicTypeDefinition(type: TypeDefinition): type is IntrinsicTypeDefinition {
        return type.kind === TypeDefinitionKind.Intrinsic;
    }

    export function isObjectTypeDefinition(type: TypeDefinition): type is ObjectTypeDefinition {
        return type.kind === TypeDefinitionKind.Object;
    }

    export function isObjectMemberTypeDefinition(type: TypeDefinition): type is ObjectMemberTypeDefinition {
        return type.kind === TypeDefinitionKind.ObjectMember;
    }

    export function isArrayTypeDefinition(type: TypeDefinition): type is ArrayTypeDefinition {
        return type.kind === TypeDefinitionKind.Array;
    }

    export function isUnionTypeDefinition(type: TypeDefinition): type is UnionTypeDefinition {
        return type.kind === TypeDefinitionKind.Union;
    }

    export function isIntersectionTypeDefinition(type: TypeDefinition): type is IntersectionTypeDefinition {
        return type.kind === TypeDefinitionKind.Intersection;
    }

    export function isGenericInstanceTypeDefinition(type: TypeDefinition): type is GenericInstanceTypeDefinition {
        return type.kind === TypeDefinitionKind.GenericInstance;
    }

    export function isGlobalReferenceTypeDefinition(type: TypeDefinition): type is GlobalReferenceTypeDefinition {
        return type.kind === TypeDefinitionKind.GlobalReference;
    }

    export function isResolvedTypeDefinition(type: TypeDefinition): type is ResolvedTypeDefinition {
        return type.kind === TypeDefinitionKind.ResolvedType;
    }

    export const typeDefinitionFactory = {
        createIntrinsicDefinition(type: IntrinsicTypes): IntrinsicTypeDefinition {
            return {
                kind: TypeDefinitionKind.Intrinsic,
                type
            };
        },
        createObjectDefinition(members: ObjectMemberTypeDefinition[]): ObjectTypeDefinition {
            return {
                kind: TypeDefinitionKind.Object,
                members
            };
        },
        createObjectMemberDefinition(name: string, type: TypeDefinition, optional = false): ObjectMemberTypeDefinition {
            return {
                kind: TypeDefinitionKind.ObjectMember,
                name,
                type,
                optional
            };
        },
        createArrayDefinition(elementType: TypeDefinition): ArrayTypeDefinition {
            return {
                kind: TypeDefinitionKind.Array,
                elementType
            };
        },
        createUnionDefinition(types: TypeDefinition[]): UnionTypeDefinition {
            return {
                kind: TypeDefinitionKind.Union,
                types
            };
        },
        createIntersectionDefinition(types: TypeDefinition[]): IntersectionTypeDefinition {
            return {
                kind: TypeDefinitionKind.Intersection,
                types
            };
        },
        createGenericInstanceDefinition(type: TypeDefinition, typeArguments: TypeDefinition[]): GenericInstanceTypeDefinition {
            return {
                kind: TypeDefinitionKind.GenericInstance,
                type,
                typeArguments
            };
        },
        createGlobalReferenceDefinition(name: string, arity = 0): GlobalReferenceTypeDefinition {
            return {
                kind: TypeDefinitionKind.GlobalReference,
                name,
                arity
            };
        },
        createResolvedTypeDefinition(type: Type): ResolvedTypeDefinition {
            return {
                kind: TypeDefinitionKind.ResolvedType,
                type
            };
        }
    } as const;

    export type TypeDefinitionFactory = typeof typeDefinitionFactory;

    export type CheckDiagnosticType = "message" | "suggestion" | "error";
    export interface CheckApiDiagnostic {
        type: CheckDiagnosticType;
        message: string;
        node?: Node;
    }

    export type CheckApiReportDiagnostic = (diagnostic: CheckApiDiagnostic, node?: Node) => void;

    interface CheckApi<T extends Node> {
        node: T;
        factory: TypeDefinitionFactory;
        sourceFile: SourceFile;
        checker: TypeChecker;
        diagnostic(type: CheckDiagnosticType, text: string, node?: Node): void;
    }

    export type CheckApiFunction<T extends Node> = (api: CheckApi<T>) => TypeDefinition | undefined | void;

    export interface MacroWithCheckApi<T extends Node> {
        check(fn: CheckApiFunction<T>): void;
    }

    export function executeCheckReturnTypeHook(hooks: MacroHooks<Node>, node: Node, checker: TypeChecker, reportDiagnostic: CheckApiReportDiagnostic): TypeDefinition | undefined {
        const hook = hooks.check.pop();
        if(!hook) return;


        const api: CheckApi<Node> = {
            node,
            factory: typeDefinitionFactory,
            sourceFile: getSourceFileOfNode(node),
            checker,
            diagnostic(type, text) {
                reportDiagnostic({ type, message: text });
            }
        };

        return hook(api) ?? undefined;
    }

    export function createCheckApi<T extends Node>(hooks: MacroHooks<T>): MacroWithCheckApi<T> {
        return {
            check(fn) {
                hooks.check.push(fn);
            }
        };
    }

    export function checkFunctionMacro(node: MacroCallExpressionNode, checker: TypeChecker, reportDiagnostic: CheckApiReportDiagnostic): TypeDefinition | undefined {
        const declaration = getMacroBinding("function", node);
        if(!declaration) return;

        const hooks = getHooksForMacro<"function", FunctionMacro>(declaration, (hooks) => ({
            declaration,
            ...createTransformMacroApi(hooks),
            ...createCheckApi(hooks)
        }));

        if(!hooks) return;

        return executeCheckReturnTypeHook(hooks, node, checker, reportDiagnostic);
    }

    export function checkTaggedTemplateExpressionMacro(node: MacroTaggedTemplateExpressionNode, checker: TypeChecker, reportDiagnostic: CheckApiReportDiagnostic): TypeDefinition | undefined {
        const declaration = getMacroBinding("taggedTemplate", node);
        if(!declaration) return;

        const hooks = getHooksForMacro<"taggedTemplate", TaggedTemplateMacro>(declaration, (hooks) => ({
            declaration,
            ...createTransformMacroApi(hooks),
            ...createCheckApi(hooks)
        }));

        if(!hooks) return;

        return executeCheckReturnTypeHook(hooks, node, checker, reportDiagnostic);
    }
}