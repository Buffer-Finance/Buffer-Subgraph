import {
  Create,
  Expire,
  Exercise,
  UpdateReferral,
  Pause,
} from "../generated/BufferBinaryOptions/BufferBinaryOptions";
import {
  Provide,
  Withdraw,
  Profit,
  Loss,
} from "../generated/BinaryPool/BinaryPool";
import {
  InitiateTrade,
  CancelTrade,
  OpenTrade,
} from "../generated/BufferRouter/BufferRouter";
import { Transfer } from "../generated/USDC/USDC";
import {
  _handleCreate,
  _handleExpire,
  _handleExercise,
  _handleUpdateReferral,
  _handlePause,
} from "./optionContractHandlers";
import {
  _handleCancelTrade,
  _handleOpenTrade,
  _handleInitiateTrade,
} from "./routerContractHandlers";
import { _handleChangeInPool } from "./poolContractHandlers";
import { SetFeeProtocol } from "../generated/UniswapPool/UniswapPool";

export function handleInitiateTrade(event: InitiateTrade): void {
  _handleInitiateTrade(event);
}

export function handleOpenTrade(event: OpenTrade): void {
  _handleOpenTrade(event);
}

export function handleCancelTrade(event: CancelTrade): void {
  _handleCancelTrade(event);
}

export function handleCreate(event: Create): void {
  _handleCreate(event);
}

export function handleExercise(event: Exercise): void {
  _handleExercise(event);
}

export function handleExpire(event: Expire): void {
  _handleExpire(event);
}

export function handleUpdateReferral(event: UpdateReferral): void {
  _handleUpdateReferral(event);
}

export function handlePause(event: Pause): void {
  _handlePause(event);
}

export function handleProvide(event: Provide): void {
  let a = "a";
}

export function handleWithdraw(event: Withdraw): void {
  _handleChangeInPool(event.block.timestamp, event.address);
}

export function handleProfit(event: Profit): void {
  _handleChangeInPool(event.block.timestamp, event.address);
}

export function handleLoss(event: Loss): void {
  _handleChangeInPool(event.block.timestamp, event.address);
}

export function handleSetFeeProtocol(event: SetFeeProtocol): void {
  let a = "a";
}

export function handleTransfer(event: Transfer): void {
  let a = "a";
}
