export const OrderType = {
    TOKEN_FOR_PT: 0,
    PT_FOR_TOKEN: 1,
    TOKEN_FOR_YT: 2,
    YT_FOR_TOKEN: 3,
} as const;

export type OrderType = (typeof OrderType)[keyof typeof OrderType];
