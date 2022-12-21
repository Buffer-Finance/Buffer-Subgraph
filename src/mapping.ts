import {
  Create,
  Expire,
  Exercise,
  UpdateReferral,
} from "../generated/BufferBinaryOptions/BufferBinaryOptions";
import {
  InitiateTrade,
  CancelTrade,
  BufferRouter,
  OpenTrade,
} from "../generated/BufferRouter/BufferRouter";
import { State } from "./config";
import { BigInt } from "@graphprotocol/graph-ts";
import { _handleCreate, storePnl, updateOpenInterest, logUser } from "./core";
import {
  _loadOrCreateLeaderboardEntity,
  _loadOrCreateOptionContractEntity,
  _loadOrCreateOptionDataEntity,
  _loadOrCreateQueuedOptionEntity,
  _loadOrCreateVolumeStat,
  _loadOrCreateTradingStatEntity,
  _loadOrCreateFeeStat,
  _loadOrCreateUserStat,
  _loadOrCreateReferralData,
} from "./initialize";
import { _getDayId, _getHourId } from "./helpers";

export function handleInitiateTrade(event: InitiateTrade): void {
  let routerContract = BufferRouter.bind(event.address);
  let queueID = event.params.queueId;
  let queuedTradeData = routerContract.queuedTrades(queueID);
  let contractAddress = queuedTradeData.value6;
  _loadOrCreateOptionContractEntity(contractAddress);
  logUser(event.block.timestamp, event.params.account);
  let queuedOptionData = _loadOrCreateQueuedOptionEntity(
    queueID,
    contractAddress
  );
  queuedOptionData.user = event.params.account;
  queuedOptionData.state = State.queued;
  queuedOptionData.strike = queuedTradeData.value7;
  queuedOptionData.totalFee = queuedTradeData.value3;
  queuedOptionData.slippage = queuedTradeData.value8;
  queuedOptionData.isAbove = queuedTradeData.value5 ? true : false;
  queuedOptionData.save();
}

export function handleOpenTrade(event: OpenTrade): void {
  let routerContract = BufferRouter.bind(event.address);
  let queueID = event.params.queueId;
  let contractAddress = routerContract.queuedTrades(queueID).value6;
  let userQueuedData = _loadOrCreateQueuedOptionEntity(
    queueID,
    contractAddress
  );
  userQueuedData.state = State.opened;
  userQueuedData.save();
  let userOptionData = _loadOrCreateOptionDataEntity(
    event.params.optionId,
    contractAddress
  );
  userOptionData.queueID = queueID;
  userOptionData.save();
}

export function handleCreate(event: Create): void {
  _handleCreate(event, "USDC");
}

export function handleCreateForBFR(event: Create): void {
  _handleCreate(event, "BFR");
}

export function handleCancelTrade(event: CancelTrade): void {
  let queueID = event.params.queueId;
  let routerContract = BufferRouter.bind(event.address);
  let contractAddress = routerContract.queuedTrades(queueID).value6;
  let userQueuedData = _loadOrCreateQueuedOptionEntity(
    queueID,
    contractAddress
  );
  userQueuedData.state = State.cancelled;
  userQueuedData.reason = event.params.reason;
  userQueuedData.save();
}

export function handleExercise(event: Exercise): void {
  let timestamp = event.block.timestamp;
  let userOptionData = _loadOrCreateOptionDataEntity(
    event.params.id,
    event.address
  );
  userOptionData.state = State.exercised;
  userOptionData.payout = event.params.profit;
  userOptionData.expirationPrice = event.params.priceAtExpiration;
  userOptionData.save();

  if (userOptionData.depositToken == "USDC") {
    let pnl = event.params.profit.div(BigInt.fromI64(1000000));
    let amount = userOptionData.amount.div(BigInt.fromI64(1000000));
    updateOpenInterest(
      timestamp,
      false,
      userOptionData.isAbove,
      amount,
      event.address
    );
    storePnl(timestamp, pnl, true);
    // if (userOptionData.user != null) {
    //   let leaderboardEntity = _loadOrCreateLeaderboardEntity(_getDayId(event.block.timestamp), userOptionData.user)
    //   leaderboardEntity.netPnL = leaderboardEntity.netPnL.plus(event.params.profit.minus(userOptionData.totalFee))
    //   leaderboardEntity.save()
    // }
  }
}

export function handleExpire(event: Expire): void {
  let timestamp = event.block.timestamp;
  let userOptionData = _loadOrCreateOptionDataEntity(
    event.params.id,
    event.address
  );
  userOptionData.state = State.expired;
  userOptionData.expirationPrice = event.params.priceAtExpiration;
  userOptionData.save();

  if (userOptionData.depositToken == "USDC") {
    let pnl = event.params.premium.div(BigInt.fromI64(1000000));
    let amount = userOptionData.amount.div(BigInt.fromI64(1000000));
    updateOpenInterest(
      timestamp,
      false,
      userOptionData.isAbove,
      amount,
      event.address
    );
    storePnl(timestamp, pnl, true);
    // if (userOptionData.user != null) {
    //   let leaderboardEntity = _loadOrCreateLeaderboardEntity(_getDayId(event.block.timestamp), userOptionData.user)
    //   leaderboardEntity.netPnL = leaderboardEntity.netPnL.minus(userOptionData.totalFee)
    //   leaderboardEntity.save()
    // }
  }
}

export function handleUpdateReferral(event: UpdateReferral): void {
  let user = event.params.user;
  let referrer = event.params.referrer;

  let userReferralData = _loadOrCreateReferralData(user);
  let discount = event.params.rebate.div(BigInt.fromI64(1000000));
  userReferralData.totalDiscountAvailed = userReferralData.totalDiscountAvailed.plus(
    discount
  );
  userReferralData.totalTradingVolume = userReferralData.totalTradingVolume.plus(
    event.params.totalFee
  );
  userReferralData.save();

  let referrerReferralData = _loadOrCreateReferralData(referrer);
  referrerReferralData.totalTradesReferred =
    referrerReferralData.totalTradesReferred + 1;
  referrerReferralData.totalVolumeOfReferredTrades = referrerReferralData.totalVolumeOfReferredTrades.plus(
    event.params.totalFee
  );
  referrerReferralData.totalRebateEarned = referrerReferralData.totalRebateEarned.plus(
    event.params.referrerFee
  );
  referrerReferralData.save();
}
