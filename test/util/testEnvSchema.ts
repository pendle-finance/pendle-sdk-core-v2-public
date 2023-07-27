import * as z from 'zod';
import { CHAIN_ID_MAPPING } from '../../src';

export const TEST_ENV_SCHEMA = z.object({
    INFURA_PROJECT_ID: z.string(),
    ACTIVE_CHAIN_ID: z.coerce.number().transform((value, ctx) => {
        for (const x of Object.values(CHAIN_ID_MAPPING)) {
            if (x == value) return x;
        }
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Not a supported chain id',
        });
        return z.NEVER;
    }),
    BLOCK_CONFIRMATION: z.coerce.number().default(1),
    PRIVATE_KEY: z.string(),

    INCLUDE_WRITE: z.coerce.boolean().default(true),
    USE_LOCAL: z.coerce.boolean().default(true),

    // Both of the following options are included to have more freedom of combination.
    // By default test with multicall and without multicall will be ran.
    // Here we are giving the option to disable one of two.

    // Include this to NOT run tests with multicall.
    DISABLE_TEST_WITH_MULTICALL: z.coerce.boolean().default(false),
    // Include this to NOT run tests without multicall.
    DISABLE_TEST_WITHOUT_MULTICALL: z.coerce.boolean().default(false),

    AGGREGATOR_HELPER: z.enum(['KYBERSWAP', 'ONEINCH', 'VOID']),
    AGGREGATOR_ENDPOINT: z.string().optional(),
});

export type TestEnv = z.infer<typeof TEST_ENV_SCHEMA>;
