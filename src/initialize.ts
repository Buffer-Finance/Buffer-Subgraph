import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  UserOptionData,
  User,
  OptionContract,
  ReferralData,
  DashboardStat,
  TradingStat,
  UserStat,
  FeeStat,
  VolumeStat,
  Leaderboard,
  QueuedOptionData,
  VolumePerContract,
} from "../generated/schema";
import { _getDayId, _getHourId } from "./helpers";
let ZERO = BigInt.fromI32(0);

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
    entity.longOpenInterest = ZERO;
    entity.shortOpenInterest = ZERO;
  }
  entity.timestamp = timestamp;
  return entity as TradingStat;
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
    entity.save();
  }
  return entity as VolumeStat;
}

export function _loadOrCreateOptionContractEntity(
  contractAddress: Bytes
): OptionContract {
  let optionContract = OptionContract.load(contractAddress);
  if (optionContract == null) {
    optionContract = new OptionContract(contractAddress);
    optionContract.address = contractAddress;
    optionContract.volume = ZERO;
    optionContract.tradeCount = 0;
    optionContract.openDown = 0;
    optionContract.openUp = 0;
    optionContract.openInterest = ZERO;
    optionContract.currentUtilization = ZERO;
    optionContract.payoutForDown = 0;
    optionContract.payoutForUp = 0;
    optionContract.save();
  }
  return optionContract as OptionContract;
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
    userReferralData.totalRebateEarned = ZERO;
    userReferralData.totalTradesReferred = 0;
    userReferralData.totalTradingVolume = ZERO;
    userReferralData.totalVolumeOfReferredTrades = ZERO;
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
