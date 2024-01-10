import * as Route from '../Route';
import * as routeHelper from '../helper';
import * as errors from '../../../../errors';
import { ethers } from 'ethers';

export function createGasUsedEstimatorFromContractMethod(): Route.GasUsedEstimator<
    'approvedSignerAddressGetter' | 'contractMethodBuilder'
> {
    return routeHelper.createMinimalRouteComponent(
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
