import * as common from '../../../common';
import * as limitOrder from '../limitOrder';
import * as routerTypes from '../types';
import * as typefest from 'type-fest';
import * as aggregatorHelper from '../aggregatorHelper';
import * as iters from 'itertools';
import { BaseRouter } from '../BaseRouter';

// === Route definition ====
export const COMPONENTS = [
    'signerBalanceAllowanceChecker',
    'approvedSignerAddressGetter',
    'syIOTokenAmountGetter',
    'aggregatorResultGetter',
    'intermediateSyAmountGetter',
    'limitOrderMatcher',
    'contractMethodBuilder',
    'gasUsedEstimator',
    'netOutGetter',
    'netOutInNativeEstimator',
] as const;
export type ComponentName = (typeof COMPONENTS)[number];

type _Route<RequiredComponents extends ComponentName> = common.AssertHasKey<
    ComponentName,
    {
        readonly signerBalanceAllowanceChecker: SignerBalanceAllowanceChecker<RequiredComponents>;
        readonly approvedSignerAddressGetter: ApprovedSignerAddressGetter<RequiredComponents>;
        readonly syIOTokenAmountGetter: SYIOTokenAmountGetter<RequiredComponents>;
        readonly aggregatorResultGetter: AggregatorResultGetter<RequiredComponents>;
        readonly intermediateSyAmountGetter: IntermediateSyAmountGetter<RequiredComponents>;
        readonly limitOrderMatcher: LimitOrderMatcher<RequiredComponents>;
        readonly contractMethodBuilder: ContractMethodBuilder<RequiredComponents>;

        readonly gasUsedEstimator: GasUsedEstimator<RequiredComponents>;
        readonly netOutGetter: NetOutGetter<RequiredComponents>;
        readonly netOutInNativeEstimator: NetOutInNativeEstimator<RequiredComponents>;
    }
>;

export type Route = _Route<ComponentName>;
export type AnyRoute = Partial<_Route<never>>;
export type PartialRoute<RequiredComponents extends ComponentName> = Pick<
    _Route<RequiredComponents>,
    RequiredComponents
>;

export type RequiredComponentOfRoute<Route> = Route extends _Route<infer RC> ? RC : never;
export type CombineRoute<U, V> = [U, V] extends [_Route<infer URC>, _Route<infer VRC>] ? _Route<URC | VRC> : never;
export type AddRequiredCompoment<Route, C extends ComponentName> = _Route<RequiredComponentOfRoute<Route> | C>;

/**
 * Helper function to check if all the component are presented satisfying all the requirement.
 * @remarks
 * Using object literal does not check the component's requirement. For example:
 * ```ts
 * const route = {
 *   syIOTokenAmountGetter: {} as SYIOTokenAmountGetter<'approvedSignerAddressGetter'>
 * }
 * ```
 * Here `syIOTokenAmountGetter` requires `'approvedSignerAddressGetter'` to be
 * presented in the route, but in reality it does not existed.
 *
 * Using this function can help detect the missing requirement:
 * @example
 * ```ts
 * const route = Route.assemble({
 *   syIOTokenAmountGetter: {} as SYIOTokenAmountGetter<'approvedSignerAddressGetter'>
 * });
 * ```
 * Now Typescript will yell at this case.
 */
export function assemble<RC extends ComponentName>(obj: PartialRoute<RC>): PartialRoute<RC> {
    return obj;
}

export type RouteDebugInfo<RC extends ComponentName> = {
    [K in RC]: PromiseSettledResult<ComponentReturnType<K>> & {
        description: string;
    };
};

export async function gatherDebugInfo<RC extends ComponentName>(route: PartialRoute<RC>): Promise<RouteDebugInfo<RC>>;
export async function gatherDebugInfo(route: AnyRoute): Promise<object>;
export async function gatherDebugInfo(route: AnyRoute): Promise<object> {
    const filteredKey = COMPONENTS.filter((comp) => comp in route);
    const [info, descriptions] = await Promise.all([
        Promise.allSettled(filteredKey.map((comp) => route[comp]?.call(route))),
        Promise.all(filteredKey.map((comp) => route[comp]?.description(route))),
    ]);
    return Object.fromEntries(
        iters.imap(iters.izip3(filteredKey, info, descriptions), ([key, i, d]) => [
            key,
            { ...i, description: JSON.stringify(d) },
        ])
    );
}

// ==== Components definition ====

/**
 * Description of a component
 * @remarks
 * The form is just recursive array of string. This form has some advantages:
 * - guaranteed deterministic for JSON.stringify
 * - faster than string concatenation
 * - still readable with text composition. For example: ['name', user.name, 'birth', user.birth]
 */
export type ComponentDescription = string | ComponentDescription[];

export type Component<RequiredComponents extends ComponentName, ReturnType> = {
    /**
     * Human readable name for the component.
     * @remarks
     * This field will be used mostly for debugging.
     *
     * It is {@link common.Deferrable} since sometimes its identification comes
     * from a Deferrable parameter.
     */
    readonly name: common.Deferrable<string>;
    /**
     * @remarks
     * This field does not have the type of {@link RequiredComponents}[] because
     * it will force the typing to be **Invariance** rather than **Covariance**.
     *
     * This field will be used mostly for debugging.
     *
     * @see [Wiki page on Covariance and contravariance](https://en.wikipedia.org/wiki/Covariance_and_contravariance_(computer_science))
     */
    readonly dependencies: readonly ComponentName[];
    /**
     * Optional data for debugging.
     * @remarks
     */
    readonly debugInfo?: object;

    /**
     * The {@link BaseRotuer} object that this route belong to.
     * Can be se to have more context.
     */
    readonly router: BaseRouter;

    description(route: PartialRoute<RequiredComponents>): Promise<ComponentDescription>;
    call(route: PartialRoute<RequiredComponents>): Promise<ReturnType>;
};

export type ComponentReturnType<CN extends ComponentName> = typefest.AsyncReturnType<Route[CN]['call']>;

export type SignerBalanceAllowanceChecker<RC extends ComponentName = never> = Component<
    RC,
    | {
          spenderAddress: common.Address;
          signerAddress: common.Address;
          tokenAmountsToCheck: common.RawTokenAmount[];

          // these 2 should have the same length as tokenAmountsToCheck
          allowances: common.BN[];
          balances: common.BN[];
      }
    | undefined // undefined when there is no signer
>;
export type ApprovedSignerAddressGetter<RC extends ComponentName = never> = Component<RC, common.Address | undefined>;
export type SYIOTokenAmountGetter<RC extends ComponentName = never> = Component<RC, common.RawTokenAmount>;
export type AggregatorResultGetter<RC extends ComponentName = never> = Component<
    RC,
    aggregatorHelper.AggregatorResult
> & {
    getInput(route: PartialRoute<RC>): Promise<common.RawTokenAmount>;
    getOutputTokenAddress(route: PartialRoute<RC>): Promise<common.Address>;
};
export type IntermediateSyAmountGetter<RC extends ComponentName = never> = Component<RC, common.BN>;
export type LimitOrderMatcher<RC extends ComponentName = never> = Component<RC, limitOrder.LimitOrderMatchedResult>;
export type GasUsedEstimator<RC extends ComponentName = never> = Component<RC, common.BN>;
export type ContractMethodBuilder<RC extends ComponentName = never> = Component<
    RC,
    routerTypes.AnyRouterContractMetaMethod
>;
export type NetOutGetter<RC extends ComponentName = never> = Component<RC, common.BN>;
export type NetOutInNativeEstimator<RC extends ComponentName = never> = Component<RC, common.BN>;

// ==== Component invoker functions ====
// Most of the time we'll need to do `route.component.call(route)`, which is not 100% pleasant.
// With the invoker function, we can do something like:
// ```ts
// import { Route } from './route';
// // .....
// const syIOTOkenAmount = await Route.getSYIOTokenAmount(route);
// ```
//
// Better example is when we want to get the result of a route nested inside an object
// ```ts
// await Route.getSYIOTokenAmount(my.nested.object.route);
// ```
export function createInvokerForComponent<const T extends ComponentName>(componentName: T) {
    return (route: PartialRoute<T>): Promise<ComponentReturnType<T>> =>
        route[componentName].call(route) as Promise<ComponentReturnType<T>>;
}

export const getSignerBalanceAndAllowanceData = createInvokerForComponent('signerBalanceAllowanceChecker');
export const getApprovedSignerAddress = createInvokerForComponent('approvedSignerAddressGetter');
export const getAggregatorResult = createInvokerForComponent('aggregatorResultGetter');
export const getSYIOTokenAmount = createInvokerForComponent('syIOTokenAmountGetter');
export const getIntermediateSyAmount = createInvokerForComponent('intermediateSyAmountGetter');
export const getMatchedLimitOrderResult = createInvokerForComponent('limitOrderMatcher');
export const buildContractMethod = createInvokerForComponent('contractMethodBuilder');
export const estimateGasUsed = createInvokerForComponent('gasUsedEstimator');
export const getNetOut = createInvokerForComponent('netOutGetter');
export const estimateNetOutInNative = createInvokerForComponent('netOutInNativeEstimator');

// ==== Other helpers ====
export const signerHasApproved = (route: PartialRoute<'approvedSignerAddressGetter'>) =>
    getApprovedSignerAddress(route).then((addr) => !!addr);

export function hasComponent<C extends ComponentName>(route: AnyRoute, component: C): route is PartialRoute<C> {
    return route[component] != null;
}

export function hasComponents<const C extends ComponentName>(
    route: AnyRoute,
    components: C[]
): route is PartialRoute<C> {
    return components.every((component) => hasComponent(route, component));
}

export function tryInvokeComponent<C extends ComponentName>(
    route: AnyRoute,
    component: C
): ReturnType<PartialRoute<C>[C]['call']> | undefined {
    if (!hasComponent(route, component)) return;
    return route[component].call(route) as ReturnType<PartialRoute<C>[C]['call']>;
}
