import {
  Create,
  Expire,
  Exercise,
  Pause,
} from "../generated/BufferBinaryOptions/BufferBinaryOptions";
import { MintLBFR } from "../generated/FaucetLBFR/FaucetLBFR";
import {
  InitiateTrade,
  CancelTrade,
  OpenTrade,
} from "../generated/BufferRouter/BufferRouter";
import {
  _handleCreate,
  _handleExpire,
  _handleExercise,
  _handlePause,
} from "./optionContractHandlers";
import {
  _handleCancelTrade,
  _handleOpenTrade,
  _handleInitiateTrade,
} from "./routerContractHandlers";
import { _loadOrCreateClaimedLBFRPerUser } from "./initialize";

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

export function handlePause(event: Pause): void {
  _handlePause(event);
}

export function handleMintLBFR(event: MintLBFR): void {
  let claimedLBFRPerUser = _loadOrCreateClaimedLBFRPerUser(
    event.params.to,
    event.block.timestamp
  );
  claimedLBFRPerUser.lBFRClaimed = claimedLBFRPerUser.lBFRClaimed.plus(
    event.params.amount
  );
  claimedLBFRPerUser.timestamp = event.block.timestamp;
  claimedLBFRPerUser.save();
}
