import * as pendleSDK from '../../../src';

export type ERC20BalanceSlot = [slot: number, reverse: boolean];
export type ERC20BalanceSlotMap = Partial<Record<pendleSDK.Address, ERC20BalanceSlot>>;
