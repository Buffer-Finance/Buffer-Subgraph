import { BigInt, Address, Bytes } from "@graphprotocol/graph-ts";
import {
  Create,
  Expire,
  Exercise,
  UpdateReferral,
  Pause,
  BufferBinaryOptions,
} from "../generated/BufferBinaryOptions/BufferBinaryOptions";
import { BinaryPool } from "../generated/BinaryPool/BinaryPool";
import { User, VolumePerContract } from "../generated/schema";
import { _getDayId, _getHourId, _getWeekId } from "./helpers";
import {
  _loadOrCreateOptionContractEntity,
  _loadOrCreateOptionDataEntity,
  _loadOrCreateQueuedOptionEntity,
  _loadOrCreateVolumeStat,
  _loadOrCreateARBVolumeStat,
  _loadOrCreateTradingStatEntity,
  _loadOrCreateAssetTradingStatEntity,
  _loadOrCreateFeeStat,
  _loadOrCreateUserStat,
  _loadOrCreateDashboardStat,
  _loadOrCreateDailyRevenueAndFee,
  _loadOrCreateWeeklyRevenueAndFee,
  _loadOrCreateARBFeeStat,
  _loadOrCreateReferralData,
  _loadOrCreatePoolStat,
  _loadOrCreateUserRewards,
} from "./initialize";
import { BufferRouter } from "../generated/BufferRouter/BufferRouter";
import { getARBPrice } from "./arbPrice";
import { State, RouterAddress, ARBITRUM_SOLANA_ADDRESS } from "./config";
import {
  storePnl,
  storePnlPerContract,
  updateOpenInterest,
  logUser,
  updateOptionContractData,
} from "./core";
import { UserOptionData } from "../generated/schema";

export function _handleCreate(event: Create): void {
  let routerContract = BufferRouter.bind(Address.fromString(RouterAddress));
  if (routerContract.contractRegistry(event.address) == true) {
    let optionID = event.params.id;
    let contractAddress = event.address;
    let optionContractInstance = BufferBinaryOptions.bind(contractAddress);
    let optionData = optionContractInstance.options(optionID);
    let timestamp = event.block.timestamp;
    let isAbove = optionData.value6 ? true : false;
    let totalFee = event.params.totalFee;
    let totalLockedAmount = optionContractInstance.totalLockedAmount();
    let poolAddress = optionContractInstance.pool();
    let tokenReferrenceID = updateOptionContractData(
      true,
      isAbove,
      totalFee,
      contractAddress,
      totalLockedAmount,
      poolAddress
    );
    let userOptionData = _loadOrCreateOptionDataEntity(
      optionID,
      contractAddress
    );
    userOptionData.user = event.params.account;
    userOptionData.totalFee = totalFee;
    userOptionData.state = optionData.value0;
    userOptionData.strike = optionData.value1;
    userOptionData.amount = optionData.value2;
    userOptionData.expirationTime = optionData.value5;
    userOptionData.isAbove = isAbove;
    userOptionData.creationTime = optionData.value8;
    userOptionData.settlementFee = event.params.settlementFee;
    userOptionData.depositToken = tokenReferrenceID;
    userOptionData.ARBVolume = getARBPrice();
    userOptionData.save();
    

    //   if (optionContractInstance.tokenX() == Address.fromString(USDC_ADDRESS)) {
    //     // Stats
    //     updateOpenInterest(
    //       timestamp,
    //       true,
    //       userOptionData.isAbove,
    //       userOptionData.totalFee
    //     );
    //     _storeFees(timestamp, event.params.settlementFee);
    //     _logVolume(timestamp, totalFee);
    //     let dashboardStat = _loadOrCreateDashboardStat(tokenReferrenceID);
    //     dashboardStat.totalVolume = dashboardStat.totalVolume.plus(
    //       event.params.totalFee
    //     );
    //     dashboardStat.totalSettlementFees = dashboardStat.totalSettlementFees.plus(
    //       event.params.settlementFee
    //     );
    //     dashboardStat.totalTrades += 1;
    //     dashboardStat.save();

    //     // Dashboard
    //     _logVolumeAndSettlementFeePerContract(
    //       _getHourId(timestamp),
    //       "hourly",
    //       timestamp,
    //       contractAddress,
    //       tokenReferrenceID,
    //       event.params.totalFee,
    //       event.params.settlementFee
    //     );

    //     // Daily
    //     let dayID = _getDayId(timestamp);
    //     let feeAndRevenueStat = _loadOrCreateDailyRevenueAndFee(dayID, timestamp);
    //     feeAndRevenueStat.totalFee = feeAndRevenueStat.totalFee.plus(
    //       event.params.totalFee
    //     );
    //     feeAndRevenueStat.settlementFee = feeAndRevenueStat.settlementFee.plus(
    //       event.params.settlementFee
    //     );
    //     feeAndRevenueStat.save();

    //     let userRewardEntity = _loadOrCreateUserRewards(dayID, timestamp);
    //     // userRewardEntity.cumulativeReward = userRewardEntity.cumulativeReward.plus((totalFee.times(new BigInt(15000000)).div(new BigInt(100000000))).minus(settlementFee));
    //     userRewardEntity.save();

    //     // Weekly
    //     let weeklyFeeAndRevenueStat = _loadOrCreateWeeklyRevenueAndFee(
    //       _getWeekId(timestamp),
    //       timestamp
    //     );
    //     weeklyFeeAndRevenueStat.totalFee = weeklyFeeAndRevenueStat.totalFee.plus(
    //       event.params.totalFee
    //     );
    //     weeklyFeeAndRevenueStat.settlementFee = weeklyFeeAndRevenueStat.settlementFee.plus(
    //       event.params.settlementFee
    //     );
    //     weeklyFeeAndRevenueStat.save();
    //   } else if (tokenReferrenceID == "ARB") {
    //     _logARBVolume(timestamp, totalFee);
    //     _storeARBFees(timestamp, event.params.settlementFee);
    // }
  }
}

export function _handleExpire(event: Expire): void {
  let routerContract = BufferRouter.bind(Address.fromString(RouterAddress));
  if (
    routerContract.contractRegistry(event.address) == true ||
    event.address == Address.fromString(ARBITRUM_SOLANA_ADDRESS)
  ) {
    let referrenceID = `${event.params.id}${event.address}`;
    let userOptionData = UserOptionData.load(referrenceID);
    if (userOptionData != null) {
      userOptionData.state = State.expired;
      userOptionData.expirationPrice = event.params.priceAtExpiration;
      userOptionData.save();
      let timestamp = userOptionData.creationTime;
      let optionContractInstance = BufferBinaryOptions.bind(event.address);
      let totalLockedAmount = optionContractInstance.totalLockedAmount();
      let poolAddress = optionContractInstance.pool();
      updateOptionContractData(
        false,
        userOptionData.isAbove,
        userOptionData.totalFee,
        event.address,
        totalLockedAmount,
        poolAddress
      );

      //     if (optionContractInstance.tokenX() == Address.fromString(USDC_ADDRESS)) {
      //       updateOpenInterest(
      //         timestamp,
      //         false,
      //         userOptionData.isAbove,
      //         userOptionData.totalFee
      //       );
      //       storePnl(
      //         timestamp,
      //         userOptionData.totalFee.minus(userOptionData.settlementFee),
      //         false
      //       );
      //       storePnlPerContract(
      //         timestamp,
      //         userOptionData.totalFee.minus(userOptionData.settlementFee),
      //         false,
      //         event.address
      //       );

      //       // Leaderboard
      //       let leaderboardEntity = _loadOrCreateLeaderboardEntity(
      //         _getDayId(timestamp),
      //         userOptionData.user
      //       );
      //       leaderboardEntity.volume = leaderboardEntity.volume.plus(
      //         userOptionData.totalFee
      //       );
      //       leaderboardEntity.totalTrades = leaderboardEntity.totalTrades + 1;
      //       leaderboardEntity.netPnL = leaderboardEntity.netPnL.minus(
      //         userOptionData.totalFee
      //       );
      //       leaderboardEntity.save();

      //       // Weekly Leaderboard
      //       let WeeklyLeaderboardEntity = _loadOrCreateWeeklyLeaderboardEntity(
      //         _getWeekId(timestamp),
      //         userOptionData.user
      //       );
      //       WeeklyLeaderboardEntity.volume = WeeklyLeaderboardEntity.volume.plus(
      //         userOptionData.totalFee
      //       );
      //       WeeklyLeaderboardEntity.totalTrades =
      //         WeeklyLeaderboardEntity.totalTrades + 1;
      //       WeeklyLeaderboardEntity.netPnL = WeeklyLeaderboardEntity.netPnL.minus(
      //         userOptionData.totalFee
      //       );
      //       WeeklyLeaderboardEntity.winRate =
      //         (WeeklyLeaderboardEntity.tradesWon * 100000) /
      //         WeeklyLeaderboardEntity.totalTrades;
      //       WeeklyLeaderboardEntity.save();
      //     }
      //   } else {
      //     throw console.error(
      //       "User option data not found for id {} and contract {}",
      //       [event.params.id.toString(), event.address.toHexString()]
      //     );
      //   }
    }
  }
}

export function _handleExercise(event: Exercise): void {
  let routerContract = BufferRouter.bind(Address.fromString(RouterAddress));
  if (
    routerContract.contractRegistry(event.address) == true ||
    event.address == Address.fromString(ARBITRUM_SOLANA_ADDRESS)
  ) {
    let userOptionData = _loadOrCreateOptionDataEntity(
      event.params.id,
      event.address
    );
    userOptionData.state = State.exercised;
    userOptionData.payout = event.params.profit;
    userOptionData.expirationPrice = event.params.priceAtExpiration;
    userOptionData.save();

    let optionContractInstance = BufferBinaryOptions.bind(event.address);
    let totalLockedAmount = optionContractInstance.totalLockedAmount();
    let poolAddress = optionContractInstance.pool();
    let timestamp = userOptionData.creationTime;
    updateOptionContractData(
      false,
      userOptionData.isAbove,
      userOptionData.totalFee,
      event.address,
      totalLockedAmount,
      poolAddress
    );

    // if (optionContractInstance.tokenX() == Address.fromString(USDC_ADDRESS)) {
    //   updateOpenInterest(
    //     timestamp,
    //     false,
    //     userOptionData.isAbove,
    //     userOptionData.totalFee
    //   );
    //   let profit = userOptionData.totalFee.minus(userOptionData.settlementFee);
    //   storePnl(timestamp, profit, true);
    //   storePnlPerContract(timestamp, profit, true, event.address);

    //   // Leaderboard
    //   let leaderboardEntity = _loadOrCreateLeaderboardEntity(
    //     _getDayId(timestamp),
    //     userOptionData.user
    //   );
    //   leaderboardEntity.volume = leaderboardEntity.volume.plus(
    //     userOptionData.totalFee
    //   );
    //   leaderboardEntity.totalTrades = leaderboardEntity.totalTrades + 1;
    //   leaderboardEntity.netPnL = leaderboardEntity.netPnL.plus(
    //     event.params.profit.minus(userOptionData.totalFee)
    //   );
    //   leaderboardEntity.save();

    //   // Weekly Leaderboard
    //   let WeeklyLeaderboardEntity = _loadOrCreateWeeklyLeaderboardEntity(
    //     _getWeekId(timestamp),
    //     userOptionData.user
    //   );
    //   WeeklyLeaderboardEntity.volume = WeeklyLeaderboardEntity.volume.plus(
    //     userOptionData.totalFee
    //   );
    //   WeeklyLeaderboardEntity.totalTrades =
    //     WeeklyLeaderboardEntity.totalTrades + 1;
    //   WeeklyLeaderboardEntity.netPnL = WeeklyLeaderboardEntity.netPnL.plus(
    //     event.params.profit.minus(userOptionData.totalFee)
    //   );
    //   WeeklyLeaderboardEntity.tradesWon = WeeklyLeaderboardEntity.tradesWon + 1;
    //   WeeklyLeaderboardEntity.winRate =
    //     (WeeklyLeaderboardEntity.tradesWon * 100000) /
    //     WeeklyLeaderboardEntity.totalTrades;
    //   WeeklyLeaderboardEntity.save();
    // }
  }
}

export function _handlePause(event: Pause): void {
  let isPaused = event.params.isPaused;
  let optionContract = _loadOrCreateOptionContractEntity(event.address);
  optionContract.isPaused = isPaused;
  optionContract.save();
}

export function _handleUpdateReferral(event: UpdateReferral): void {
  // let routerContract = BufferRouter.bind(Address.fromString(RouterAddress));
  let optionContractEntity = _loadOrCreateOptionContractEntity(event.address);
  // if (routerContract.contractRegistry(event.address) == true) {
  //   if (optionContractEntity.token == "USDC") {
  //     let user = event.params.user;
  //     let referrer = event.params.referrer;

  //     let userReferralData = _loadOrCreateReferralData(user);
  //     userReferralData.totalDiscountAvailed = userReferralData.totalDiscountAvailed.plus(
  //       event.params.rebate
  //     );
  //     userReferralData.totalTradingVolume = userReferralData.totalTradingVolume.plus(
  //       event.params.totalFee
  //     );
  //     userReferralData.save();

  //     let referrerReferralData = _loadOrCreateReferralData(referrer);
  //     referrerReferralData.totalTradesReferred += 1;
  //     referrerReferralData.totalVolumeOfReferredTrades = referrerReferralData.totalVolumeOfReferredTrades.plus(
  //       event.params.totalFee
  //     );
  //     referrerReferralData.totalRebateEarned = referrerReferralData.totalRebateEarned.plus(
  //       event.params.referrerFee
  //     );
  //     referrerReferralData.save();

  //     let dayID = _getDayId(event.block.timestamp);
  //     let userRewardEntity = _loadOrCreateUserRewards(
  //       dayID,
  //       event.block.timestamp
  //     );
  //     userRewardEntity.referralDiscount = userRewardEntity.referralDiscount.plus(
  //       event.params.rebate
  //     );
  //     userRewardEntity.referralReward = userRewardEntity.referralReward.plus(
  //       event.params.referrerFee
  //     );
  //     userRewardEntity.nftDiscount = userRewardEntity.cumulativeReward.minus(
  //       event.params.rebate
  //     );
  //     userRewardEntity.save();
  //   }
  // }
}
