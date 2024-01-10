import * as common from '../../../common';
import { TokenInput } from '../types';
import { ethers } from 'ethers';
import * as Route from './Route';
import * as routerTypes from '../types';

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

export function createMinimalRouteComponent<const RC extends Route.ComponentName, ReturnType>(
    name: string,
    dependencies: readonly RC[],
    callFn: (route: Route.PartialRoute<RC>) => Promise<ReturnType>
): Route.Component<RC, ReturnType> {
    return addCacheForComponent({
        call: callFn,
        description: async (route: Route.PartialRoute<RC>) => [
            name,
            ...(await Promise.all(dependencies.map((dep) => route[dep].description(route)))),
        ],
    });
}

export function createComponentBundleForContractMethod<
    const RC extends Route.ComponentName,
    ReturnType extends routerTypes.AnyRouterContractMetaMethod,
>(
    nameSuffix: string,
    dependencies: RC[],
    contractMethodBuilderCallFn: (route: Route.PartialRoute<RC>) => Promise<ReturnType>,
    netOutGetterCallFn: (metaMethod: ReturnType, route: Route.PartialRoute<RC>) => Promise<common.BN>
) {
    const contractMethodBuilder = createMinimalRouteComponent(
        `ContractMethodBuilder.${nameSuffix}`,
        dependencies,
        contractMethodBuilderCallFn
    );
    const netOutGetter = createMinimalRouteComponent(`NetOutGetter.${nameSuffix}`, dependencies, (route) =>
        contractMethodBuilder.call(route).then((metaMethod) => netOutGetterCallFn(metaMethod, route))
    );
    const gasUsedEstimator = createMinimalRouteComponent(
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

export function createComponentFromConstant<T>(name: string, value: common.Deferrable<T>): Route.Component<never, T> {
    const resolvedValue = Promise.resolve(common.unwrapDeferrable(value));
    const resolvedDescription = Promise.resolve([`ConstantComponent.${name}`]);
    return {
        call: () => resolvedValue,
        description: () => resolvedDescription,
    };
}
