import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  UserOptionData,
  OptionContract,
  ReferralData,
  DashboardStat,
  TradingStat,
  AssetTradingStat,
  UserStat,
  FeeStat,
  VolumeStat,
  Leaderboard,
  WeeklyLeaderboard,
  QueuedOptionData,
  DailyRevenueAndFee,
  WeeklyRevenueAndFee,
  PoolStat,
  ARBPoolStat,
  UserRewards,
} from "../generated/schema";
import { _getDayId } from "./helpers";
import { BufferBinaryOptions } from "../generated/BufferBinaryOptions/BufferBinaryOptions";
import { BinaryPool } from "../generated/BinaryPool/BinaryPool";
import { USDC_ADDRESS, ARB_TOKEN_ADDRESS } from "./config";

export const ZERO = BigInt.fromI32(0);

export function _calculateCurrentUtilization(
  totalLockedAmount: BigInt,
  poolAddress: Address
): BigInt {
  let poolContractInstance = BinaryPool.bind(poolAddress);
  let currentUtilization = totalLockedAmount
    .times(BigInt.fromI64(1000000000000000000))
    .div(poolContractInstance.totalTokenXBalance());
  return currentUtilization;
}

//TODO: Scan Config for settlement fee update
export function calculatePayout(settlementFeePercent: BigInt): BigInt {
  let payout = BigInt.fromI64(1000000000000000000).minus(
    settlementFeePercent.times(BigInt.fromI64(200000000000000))
  );
  return payout;
}

export function _loadOrCreateOptionContractEntity(
  contractAddress: Address
): OptionContract {
  let optionContract = OptionContract.load(contractAddress);
  if (optionContract == null) {
    let optionContractInstance = BufferBinaryOptions.bind(
      Address.fromBytes(contractAddress)
    );
    optionContract = new OptionContract(contractAddress);
    optionContract.address = contractAddress;
    optionContract.isPaused = optionContractInstance.isPaused();
    optionContract.volume = ZERO;
    optionContract.tradeCount = 0;
    optionContract.openDown = ZERO;
    optionContract.openUp = ZERO;
    optionContract.openInterest = ZERO;
    optionContract.currentUtilization = ZERO;
    optionContract.payoutForDown = ZERO;
    optionContract.payoutForUp = ZERO;
    optionContract.asset = optionContractInstance.assetPair();
    let optionContractToken = optionContractInstance.tokenX();
    if (optionContractToken == Address.fromString(USDC_ADDRESS)) {
      optionContract.token = "USDC";
    } else if (optionContractToken == Address.fromString(ARB_TOKEN_ADDRESS)) {
      optionContract.token = "ARB";
    }
    optionContract.payoutForDown = calculatePayout(
      BigInt.fromI32(
        optionContractInstance.baseSettlementFeePercentageForBelow()
      )
    );
    optionContract.payoutForUp = calculatePayout(
      BigInt.fromI32(
        optionContractInstance.baseSettlementFeePercentageForAbove()
      )
    );
    optionContract.save();
  }
  return optionContract as OptionContract;
}

export function _loadOrCreateTradingStatEntity(
  id: string,
  period: string,
  timestamp: BigInt
): TradingStat {
  let entity = TradingStat.load(id);
  if (entity == null) {
    entity = new TradingStat(id);
    entity.period = period;
    entity.profit = ZERO;
    entity.loss = ZERO;
    entity.profitCumulative = ZERO;
    entity.lossCumulative = ZERO;
    entity.profitUSDC = ZERO;
    entity.lossUSDC = ZERO;
    entity.profitCumulativeUSDC = ZERO;
    entity.lossCumulativeUSDC = ZERO;
    entity.profitARB = ZERO;
    entity.lossARB = ZERO;
    entity.profitCumulativeARB = ZERO;
    entity.lossCumulativeARB = ZERO;
    entity.longOpenInterest = ZERO;
    entity.longOpenInterestUSDC = ZERO;
    entity.longOpenInterestARB = ZERO;
    entity.shortOpenInterest = ZERO;
    entity.shortOpenInterestARB = ZERO;
    entity.shortOpenInterestUSDC = ZERO;
  }
  entity.timestamp = timestamp;
  return entity as TradingStat;
}

export function _loadOrCreateAssetTradingStatEntity(
  id: string,
  period: string,
  timestamp: BigInt,
  contractAddress: Bytes,
  periodID: string
): AssetTradingStat {
  let entity = AssetTradingStat.load(id);
  if (entity == null) {
    entity = new AssetTradingStat(id);
    entity.period = period;
    entity.profit = ZERO;
    entity.profitARB = ZERO;
    entity.profitUSDC = ZERO;
    entity.loss = ZERO;
    entity.lossUSDC = ZERO;
    entity.lossARB = ZERO;
    entity.contractAddress = contractAddress;
    entity.profitCumulative = ZERO;
    entity.profitCumulativeARB = ZERO;
    entity.profitCumulativeUSDC = ZERO;
    entity.lossCumulative = ZERO;
    entity.lossCumulativeARB = ZERO;
    entity.lossCumulativeUSDC = ZERO;
    entity.periodID = periodID;
  }
  entity.timestamp = timestamp;
  return entity as AssetTradingStat;
}

export function _loadOrCreateQueuedOptionEntity(
  queueID: BigInt,
  contractAddress: Bytes
): QueuedOptionData {
  let referenceID = `${queueID}${contractAddress}`;
  let entity = QueuedOptionData.load(referenceID);
  if (entity == null) {
    entity = new QueuedOptionData(referenceID);
    entity.queueID = queueID;
    entity.optionContract = contractAddress;
    entity.queuedTimestamp = ZERO;
    entity.lag = ZERO;
    entity.processTime = ZERO;
    entity.save();
  }
  return entity as QueuedOptionData;
}

export function _loadOrCreateOptionDataEntity(
  optionID: BigInt,
  contractAddress: Bytes
): UserOptionData {
  let referrenceID = `${optionID}${contractAddress}`;
  let entity = UserOptionData.load(referrenceID);
  if (entity == null) {
    entity = new UserOptionData(referrenceID);
    entity.optionID = optionID;
    entity.optionContract = contractAddress;
    entity.amount = ZERO;
    entity.totalFee = ZERO;
    entity.queuedTimestamp = ZERO;
    entity.lag = ZERO;
  }
  return entity as UserOptionData;
}

export function _loadOrCreateLeaderboardEntity(
  dayId: string,
  account: Bytes
): Leaderboard {
  let referenceID = `${dayId}${account}`;
  let entity = Leaderboard.load(referenceID);
  if (entity == null) {
    entity = new Leaderboard(referenceID);
    entity.user = account;
    entity.timestamp = dayId;
    entity.totalTrades = 0;
    entity.volume = ZERO;
    entity.netPnL = ZERO;
    entity.save();
  }
  return entity as Leaderboard;
}

export function _loadOrCreateWeeklyLeaderboardEntity(
  weekId: string,
  account: Bytes
): WeeklyLeaderboard {
  let referenceID = `${weekId}${account}`;
  let entity = WeeklyLeaderboard.load(referenceID);
  if (entity == null) {
    entity = new WeeklyLeaderboard(referenceID);
    entity.user = account;
    entity.timestamp = weekId;
    entity.totalTrades = 0;
    entity.volume = ZERO;
    entity.netPnL = ZERO;
    entity.tradesWon = 0;
    entity.winRate = 0;
    entity.arbVolume = ZERO;
    entity.arbNetPnL = ZERO;
    entity.arbTotalTrades = 0;
    entity.arbTradesWon = 0;
    entity.arbWinRate = 0;
    entity.usdcVolume = ZERO;
    entity.usdcNetPnL = ZERO;
    entity.usdcTotalTrades = 0;
    entity.usdcTradesWon = 0;
    entity.usdcWinRate = 0;
    entity.save();
  }
  return entity as WeeklyLeaderboard;
}

export function _loadOrCreateUserStat(
  id: string,
  period: string,
  timestamp: BigInt
): UserStat {
  let userStat = UserStat.load(id);
  if (userStat == null) {
    userStat = new UserStat(id);
    userStat.period = period;
    userStat.timestamp = timestamp;
    userStat.uniqueCount = 0;
    userStat.uniqueCountCumulative = 0;
    userStat.users = [];
    userStat.existingCount = 0;
  }
  return userStat as UserStat;
}

export function _loadOrCreateVolumeStat(
  id: string,
  period: string,
  timestamp: BigInt
): VolumeStat {
  let entity = VolumeStat.load(id);
  if (entity === null) {
    entity = new VolumeStat(id);
    entity.period = period;
    entity.timestamp = timestamp;
    entity.amount = ZERO;
    entity.VolumeUSDC = ZERO;
    entity.VolumeARB = ZERO;
    entity.save();
  }
  return entity as VolumeStat;
}

export function _loadOrCreateFeeStat(
  id: string,
  period: string,
  timestamp: BigInt
): FeeStat {
  let entity = FeeStat.load(id);
  if (entity === null) {
    entity = new FeeStat(id);
    entity.period = period;
    entity.timestamp = timestamp;
    entity.fee = ZERO;
    entity.feeARB = ZERO;
    entity.feeUSDC = ZERO;
    entity.save();
  }
  return entity as FeeStat;
}

export function _loadOrCreateReferralData(user: Bytes): ReferralData {
  let userReferralData = ReferralData.load(user);
  if (userReferralData == null) {
    userReferralData = new ReferralData(user);
    userReferralData.user = user;
    userReferralData.totalDiscountAvailed = ZERO;
    userReferralData.totalDiscountAvailedARB = ZERO;
    userReferralData.totalDiscountAvailedUSDC = ZERO;
    userReferralData.totalRebateEarned = ZERO;
    userReferralData.totalRebateEarnedUSDC = ZERO;
    userReferralData.totalRebateEarnedARB = ZERO;
    userReferralData.totalTradesReferred = 0;
    userReferralData.totalTradesReferredUSDC = 0;
    userReferralData.totalTradesReferredARB = 0;
    userReferralData.totalTradingVolume = ZERO;
    userReferralData.totalTradingVolumeARB = ZERO;
    userReferralData.totalTradingVolumeUSDC = ZERO;
    userReferralData.totalVolumeOfReferredTrades = ZERO;
    userReferralData.totalVolumeOfReferredTradesUSDC = ZERO;
    userReferralData.totalVolumeOfReferredTradesARB = ZERO;

    userReferralData.save();
  }
  return userReferralData as ReferralData;
}

export function _loadOrCreateDashboardStat(id: string): DashboardStat {
  let dashboardStat = DashboardStat.load(id);
  if (dashboardStat == null) {
    dashboardStat = new DashboardStat(id);
    dashboardStat.totalSettlementFees = ZERO;
    dashboardStat.totalVolume = ZERO;
    dashboardStat.totalTrades = 0;
    dashboardStat.save();
  }
  return dashboardStat as DashboardStat;
}

export function _loadOrCreatePoolStat(id: string, period: string): PoolStat {
  let poolStat = PoolStat.load(id);
  if (poolStat == null) {
    poolStat = new PoolStat(id);
    poolStat.amount = ZERO;
    poolStat.period = period;
    poolStat.rate = ZERO;
  }
  return poolStat as PoolStat;
}

export function _loadOrCreateARBPoolStat(
  id: string,
  period: string
): ARBPoolStat {
  let poolStat = ARBPoolStat.load(id);
  if (poolStat == null) {
    poolStat = new ARBPoolStat(id);
    poolStat.amount = ZERO;
    poolStat.period = period;
    poolStat.rate = ZERO;
  }
  return poolStat as ARBPoolStat;
}

export function _loadOrCreateDailyRevenueAndFee(
  id: string,
  timestamp: BigInt
): DailyRevenueAndFee {
  let entity = DailyRevenueAndFee.load(id);
  if (entity === null) {
    entity = new DailyRevenueAndFee(id);
    entity.totalFee = ZERO;
    entity.settlementFee = ZERO;
    entity.timestamp = timestamp;
    entity.save();
  }
  return entity as DailyRevenueAndFee;
}

export function _loadOrCreateWeeklyRevenueAndFee(
  id: string,
  timestamp: BigInt
): WeeklyRevenueAndFee {
  let entity = WeeklyRevenueAndFee.load(id);
  if (entity === null) {
    entity = new WeeklyRevenueAndFee(id);
    entity.totalFee = ZERO;
    entity.settlementFee = ZERO;
    entity.timestamp = timestamp;
    entity.save();
  }
  return entity as WeeklyRevenueAndFee;
}

export function _loadOrCreateUserRewards(
  id: string,
  timestamp: BigInt
): UserRewards {
  let entity = UserRewards.load(id);
  if (entity === null) {
    entity = new UserRewards(id);
    entity.cumulativeReward = ZERO;
    entity.referralReward = ZERO;
    entity.nftDiscount = ZERO;
    entity.referralDiscount = ZERO;
    entity.period = "daily";
    entity.timestamp = timestamp;
    entity.save();
  }
  return entity as UserRewards;
}
