import * as common from '../../../common';
import { TokenInput } from '../types';
import { ethers } from 'ethers';
import * as Route from './Route';
import * as routerTypes from '../types';
import { BaseRouter } from '../BaseRouter';

export function txOverridesValueFromTokenInput(tokenInput: TokenInput): ethers.CallOverrides {
    if (!common.isNativeToken(tokenInput.tokenIn)) return {};
    return { value: tokenInput.netTokenIn };
}

export function addCacheForComponent<RC extends Route.Component<never, unknown>>(component: RC): RC {
    const cache = new Map<string, unknown>();
    return {
        ...component,
        call: async (route) => {
            const key = JSON.stringify(await component.description(route));
            if (cache.has(key)) return cache.get(key);
            const value = component.call(route);
            cache.set(key, value);
            return value;
        },
    };
}

export function emitEventsOnComponentCall<C extends Route.Component<never, unknown>>(oldComponent: C): C {
    const modifiedComponent = {
        ...oldComponent,
        call: async (route: Route.PartialRoute<never>) => {
            modifiedComponent.router.events.emit('routeComponentCallBegin', {
                route,
                component: modifiedComponent,
            });
            const result = oldComponent.call(route);
            modifiedComponent.router.events.emit('routerComponentCallFinalized', {
                route,
                component: modifiedComponent,
                result,
            });
            return result;
        },
    };
    return modifiedComponent;
}

export const applyRouteComponentTrait = <C extends Route.Component<never, unknown>>(component: C): C =>
    addCacheForComponent(emitEventsOnComponentCall(component));

export function createMinimalRouteComponent<const Dependency extends Route.ComponentName, ReturnType>(
    router: BaseRouter,
    name: common.Deferrable<string>,
    dependencies: readonly Dependency[],
    callFn: (route: Route.PartialRoute<Dependency>) => Promise<ReturnType>,
    params: {
        debugInfo?: object;
    } = {}
): Route.Component<Dependency, ReturnType> {
    const { debugInfo } = params;

    return applyRouteComponentTrait({
        router,
        name,
        dependencies,
        debugInfo,

        call: callFn,
        description: async (route: Route.PartialRoute<Dependency>) =>
            Promise.all([common.unwrapDeferrable(name), ...dependencies.map((dep) => route[dep].description(route))]),
    });
}

export function createComponentBundleForContractMethod<
    const RC extends Route.ComponentName,
    ReturnType extends routerTypes.AnyRouterContractMetaMethod,
>(
    router: BaseRouter,
    nameSuffix: string,
    dependencies: RC[],
    contractMethodBuilderCallFn: (route: Route.PartialRoute<RC>) => Promise<ReturnType>,
    netOutGetterCallFn: (metaMethod: ReturnType, route: Route.PartialRoute<RC>) => Promise<common.BN>
) {
    const contractMethodBuilder = createMinimalRouteComponent(
        router,
        `ContractMethodBuilder.${nameSuffix}`,
        dependencies,
        contractMethodBuilderCallFn
    );
    const netOutGetter = createMinimalRouteComponent(router, `NetOutGetter.${nameSuffix}`, dependencies, (route) =>
        contractMethodBuilder.call(route).then((metaMethod) => netOutGetterCallFn(metaMethod, route))
    );
    const gasUsedEstimator = createMinimalRouteComponent(
        router,
        `GasUsedEstimator.${nameSuffix}`,
        [...new Set([...dependencies, 'approvedSignerAddressGetter'] as const)],
        async (route) => {
            if (await Route.signerHasApproved(route))
                return contractMethodBuilder.call(route).then((metaMethod) => metaMethod.estimateGas());
            return ethers.constants.MaxUint256;
        }
    );

    return { contractMethodBuilder, netOutGetter, gasUsedEstimator };
}

export function createComponentFromConstant<T>(
    router: BaseRouter,
    name: string,
    value: common.Deferrable<T>,
    params: {
        debugInfo?: object;
    } = {}
): Route.Component<never, T> {
    const resolvedDescription = Promise.resolve([`ConstantComponent.${name}`]);
    return applyRouteComponentTrait({
        router,
        name,
        dependencies: [],
        call: () => common.unwrapDeferrable(value),
        description: () => resolvedDescription,
        debugInfo: params.debugInfo,
    });
}
