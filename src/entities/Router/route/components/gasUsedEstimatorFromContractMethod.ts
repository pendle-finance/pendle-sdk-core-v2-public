import * as Route from '../Route';
import * as routeHelper from '../helper';
import * as errors from '../../../../errors';
import { ethers } from 'ethers';
import { BaseRouter } from '../../BaseRouter';

export function createGasUsedEstimatorFromContractMethod(
    router: BaseRouter
): Route.GasUsedEstimator<'approvedSignerAddressGetter' | 'contractMethodBuilder'> {
    return routeHelper.createMinimalRouteComponent(
        router,
        'gasUsedEstimator.fromContractMethod',
        ['contractMethodBuilder', 'approvedSignerAddressGetter'],
        async (route) => {
            const signerHasApproved = await Route.signerHasApproved(route);
            if (!signerHasApproved) {
                return ethers.constants.MaxUint256;
            }
            const method = await Route.buildContractMethod(route);
            try {
                return await method.estimateGas();
            } catch (e) {
                if (e instanceof errors.GasEstimationError) {
                    return ethers.constants.MaxUint256;
                }
                throw e;
            }
        }
    );
}
