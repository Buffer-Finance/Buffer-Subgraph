import {
  Create,
  Expire,
  Exercise,
  UpdateReferral,
  BufferBinaryOptions,
} from "../generated/BufferBinaryOptions/BufferBinaryOptions";
import {
  BinaryPool,
  Provide,
  Withdraw,
} from "../generated/BinaryPool/BinaryPool";
import {
  InitiateTrade,
  CancelTrade,
  BufferRouter,
  OpenTrade,
} from "../generated/BufferRouter/BufferRouter";
import { State, RouterAddress, BFR, USDC } from "./config";
import { Address, BigInt, log } from "@graphprotocol/graph-ts";
import {
  _handleCreate,
  storePnl,
  updateOpenInterest,
  logUser,
  calculateCurrentUtilization,
} from "./core";
import {
  _loadOrCreateLeaderboardEntity,
  _loadOrCreateOptionContractEntity,
  _loadOrCreateOptionDataEntity,
  _loadOrCreateQueuedOptionEntity,
  _loadOrCreateReferralData,
  _loadOrCreatePoolStat,
} from "./initialize";
import { _getDayId } from "./helpers";
import { UserOptionData } from "../generated/schema";
import { Leaderboard } from "../generated/schema";

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
  _handleCreate(event);
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
  let routerContract = BufferRouter.bind(Address.fromString(RouterAddress));
  if (routerContract.contractRegistry(event.address) == true) {
    let timestamp = event.block.timestamp;
    let userOptionData = _loadOrCreateOptionDataEntity(
      event.params.id,
      event.address
    );
    userOptionData.state = State.exercised;
    userOptionData.payout = event.params.profit;
    userOptionData.expirationPrice = event.params.priceAtExpiration;
    userOptionData.save();
    let optionContractInstance = BufferBinaryOptions.bind(event.address);
    let optionContractData = _loadOrCreateOptionContractEntity(event.address);
    optionContractData.currentUtilization = calculateCurrentUtilization(
      optionContractInstance
    );
    optionContractData.save();
    if (optionContractInstance.tokenX() == Address.fromString(USDC)) {
      let amount = userOptionData.amount.div(BigInt.fromI32(1000000));
      let totalFee = userOptionData.amount.div(BigInt.fromI32(1000000));
      updateOpenInterest(
        timestamp,
        false,
        userOptionData.isAbove,
        amount,
        event.address
      );
      let profit = event.params.profit
        .minus(totalFee)
        .div(BigInt.fromI32(1000000));
      storePnl(timestamp, profit, true);

      // Leaderboard
      let leaderboardEntity = _loadOrCreateLeaderboardEntity(
        _getDayId(timestamp),
        userOptionData.user
      );
      leaderboardEntity.volume = leaderboardEntity.volume.plus(
        userOptionData.totalFee
      );
      leaderboardEntity.totalTrades = leaderboardEntity.totalTrades + 1;
      leaderboardEntity.netPnL = leaderboardEntity.netPnL.plus(
        event.params.profit.minus(userOptionData.totalFee)
      );
      leaderboardEntity.save();
    }
  }
}

export function handleExpire(event: Expire): void {
  let routerContract = BufferRouter.bind(Address.fromString(RouterAddress));
  if (routerContract.contractRegistry(event.address) == true) {
    let timestamp = event.block.timestamp;
    let referrenceID = `${event.params.id}${event.address}`;
    let userOptionData = UserOptionData.load(referrenceID);
    if (userOptionData != null) {
      userOptionData.state = State.expired;
      userOptionData.expirationPrice = event.params.priceAtExpiration;
      userOptionData.save();

      let optionContractInstance = BufferBinaryOptions.bind(event.address);
      let optionContractData = _loadOrCreateOptionContractEntity(event.address);
      optionContractData.currentUtilization = calculateCurrentUtilization(
        optionContractInstance
      );
      optionContractData.save();
      if (optionContractInstance.tokenX() == Address.fromString(USDC)) {
        let amount = userOptionData.amount.div(BigInt.fromI32(1000000));
        let totalFee = userOptionData.amount.div(BigInt.fromI32(1000000));
        updateOpenInterest(
          timestamp,
          false,
          userOptionData.isAbove,
          amount,
          event.address
        );
        storePnl(
          timestamp,
          event.params.premium.div(BigInt.fromI32(1000000)),
          false
        );

        // Leaderboard
        let leaderboardEntity = _loadOrCreateLeaderboardEntity(
          _getDayId(timestamp),
          userOptionData.user
        );
        leaderboardEntity.volume = leaderboardEntity.volume.plus(
          userOptionData.totalFee
        );
        leaderboardEntity.totalTrades = leaderboardEntity.totalTrades + 1;
        leaderboardEntity.netPnL = leaderboardEntity.netPnL.minus(
          userOptionData.totalFee
        );
        leaderboardEntity.save();
      }
    } else {
      throw console.error(
        "User option data not found for id {} and contract {}",
        [event.params.id.toString(), event.address.toHexString()]
      );
    }
  }
}

export function handleUpdateReferral(event: UpdateReferral): void {
  let routerContract = BufferRouter.bind(Address.fromString(RouterAddress));
  let optionContractInstance = BufferBinaryOptions.bind(event.address);
  if (routerContract.contractRegistry(event.address) == true) {
    if (optionContractInstance.tokenX() == Address.fromString(USDC)) {
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
      referrerReferralData.totalTradesReferred += 1;
      referrerReferralData.totalVolumeOfReferredTrades = referrerReferralData.totalVolumeOfReferredTrades.plus(
        event.params.totalFee
      );
      referrerReferralData.totalRebateEarned = referrerReferralData.totalRebateEarned.plus(
        event.params.referrerFee
      );
      referrerReferralData.save();
    }
  }
}

export function handleProvide(event: Provide): void {
  let poolContractInstance = BinaryPool.bind(event.address);
  let rate = poolContractInstance
    .totalTokenXBalance()
    .div(poolContractInstance.totalSupply());

  let poolStat = _loadOrCreatePoolStat(
    _getDayId(event.block.timestamp),
    "daily"
  );
  poolStat.amount = poolStat.amount
    .plus(event.params.amount)
    .div(BigInt.fromI64(1000000));
  poolStat.timestamp = event.block.timestamp;
  poolStat.rate = rate;
  poolStat.save();

  let totalPoolStat = _loadOrCreatePoolStat("total", "total");
  totalPoolStat.amount = totalPoolStat.amount
    .plus(event.params.amount)
    .div(BigInt.fromI64(1000000));
  totalPoolStat.timestamp = event.block.timestamp;
  totalPoolStat.save();
}

export function handleWithdraw(event: Withdraw): void {
  let poolContractInstance = BinaryPool.bind(event.address);
  let rate = poolContractInstance
    .totalTokenXBalance()
    .div(poolContractInstance.totalSupply());

  let poolStat = _loadOrCreatePoolStat(
    _getDayId(event.block.timestamp),
    "daily"
  );
  poolStat.amount = poolStat.amount
    .minus(event.params.amount)
    .div(BigInt.fromI64(1000000));
  poolStat.timestamp = event.block.timestamp;
  poolStat.rate = rate;
  poolStat.save();

  let totalPoolStat = _loadOrCreatePoolStat("total", "total");
  totalPoolStat.amount = totalPoolStat.amount
    .minus(event.params.amount)
    .div(BigInt.fromI64(1000000));
  poolStat.timestamp = event.block.timestamp;
  totalPoolStat.save();
}
