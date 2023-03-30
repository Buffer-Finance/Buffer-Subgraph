import { BigInt, Address, Bytes } from "@graphprotocol/graph-ts";
import {
  Create,
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
  _loadOrCreateUserRewards,
  _loadOrCreateARBFeeStat,
  _calculateCurrentUtilization,
} from "./initialize";
import { BufferRouter } from "../generated/BufferRouter/BufferRouter";
import { DailyUserStat } from "../generated/schema";
import {
  State,
  RouterAddress,
  USDC_ADDRESS,
  ARB_TOKEN_ADDRESS,
} from "./config";

export function updateOptionContractData(
  increaseInOpenInterest: boolean,
  isAbove: boolean,
  totalFee: BigInt,
  contractAddress: Address,
  totalLockedAmount: BigInt,
  poolAddress: Address
): string {
  let optionContractData = _loadOrCreateOptionContractEntity(contractAddress);
  let tokenReferrenceID = optionContractData.token;
  optionContractData.tradeCount += 1;
  optionContractData.volume = optionContractData.volume.plus(totalFee);
  if (isAbove) {
    optionContractData.openUp = increaseInOpenInterest
      ? optionContractData.openUp.plus(totalFee)
      : optionContractData.openUp.minus(totalFee);
  } else {
    optionContractData.openDown = increaseInOpenInterest
      ? optionContractData.openDown.plus(totalFee)
      : optionContractData.openDown.minus(totalFee);
  }
  optionContractData.openInterest = increaseInOpenInterest
    ? optionContractData.openInterest.plus(totalFee)
    : optionContractData.openInterest.minus(totalFee);

  optionContractData.currentUtilization = _calculateCurrentUtilization(
    totalLockedAmount,
    poolAddress
  );
  optionContractData.save();
  return tokenReferrenceID;
}

export function logUser(timestamp: BigInt, account: Address): void {
  let user = User.load(account);
  let id = _getDayId(timestamp);
  let dailyUserStatid = `${id}-${account.toString()}`;
  let userStat = _loadOrCreateUserStat(id, "daily", timestamp);
  if (user == null) {
    let totalUserStat = _loadOrCreateUserStat("total", "total", timestamp);
    totalUserStat.uniqueCountCumulative =
      totalUserStat.uniqueCountCumulative + 1;
    totalUserStat.save();

    userStat.uniqueCount = userStat.uniqueCount + 1;
    userStat.save();

    user = new User(account);
    user.address = account;
    user.save();

    let dailyUserStat = new DailyUserStat(dailyUserStatid);
    dailyUserStat.save();
  } else {
    let entity = DailyUserStat.load(dailyUserStatid);
    if (entity == null) {
      userStat.existingCount += 1;
      userStat.save();
      entity = new DailyUserStat(dailyUserStatid);
      entity.save();
    }
  }
}

function _logVolumeAndSettlementFeePerContract(
  id: string,
  period: string,
  timestamp: BigInt,
  contractAddress: Bytes,
  depositToken: string,
  totalFee: BigInt,
  settlementFee: BigInt
): void {
  let referrenceID = `${id}${contractAddress}${depositToken}`;
  let entity = VolumePerContract.load(referrenceID);
  if (entity === null) {
    entity = new VolumePerContract(referrenceID);
    entity.period = period;
    entity.timestamp = timestamp;
    entity.amount = totalFee;
    entity.optionContract = contractAddress;
    entity.depositToken = depositToken;
    entity.settlementFee = settlementFee;
    entity.save();
  } else {
    entity.amount = entity.amount.plus(totalFee);
    entity.settlementFee = entity.settlementFee.plus(settlementFee);
    entity.save();
  }
}

function _logVolume(timestamp: BigInt, amount: BigInt): void {
  let totalEntity = _loadOrCreateVolumeStat("total", "total", timestamp);
  totalEntity.amount = totalEntity.amount.plus(amount);
  totalEntity.save();

  let id = _getDayId(timestamp);
  let dailyEntity = _loadOrCreateVolumeStat(id, "daily", timestamp);
  dailyEntity.amount = dailyEntity.amount.plus(amount);
  dailyEntity.save();

  let hourID = _getHourId(timestamp);
  let hourlyEntity = _loadOrCreateVolumeStat(hourID, "hourly", timestamp);
  hourlyEntity.amount = hourlyEntity.amount.plus(amount);
  hourlyEntity.save();
}

function _logARBVolume(timestamp: BigInt, amount: BigInt): void {
  let totalEntity = _loadOrCreateARBVolumeStat("total", "total", timestamp);
  totalEntity.amount = totalEntity.amount.plus(amount);
  totalEntity.save();

  let id = _getDayId(timestamp);
  let dailyEntity = _loadOrCreateARBVolumeStat(id, "daily", timestamp);
  dailyEntity.amount = dailyEntity.amount.plus(amount);
  dailyEntity.save();

  let hourID = _getHourId(timestamp);
  let hourlyEntity = _loadOrCreateARBVolumeStat(hourID, "hourly", timestamp);
  hourlyEntity.amount = hourlyEntity.amount.plus(amount);
  hourlyEntity.save();
}

function _storeFees(timestamp: BigInt, fees: BigInt): void {
  let id = _getDayId(timestamp);
  let entity = _loadOrCreateFeeStat(id, "daily", timestamp);
  entity.fee = entity.fee.plus(fees);
  entity.save();

  let totalEntity = _loadOrCreateFeeStat("total", "total", timestamp);
  totalEntity.fee = totalEntity.fee.plus(fees);
  totalEntity.save();
}

function _storeARBFees(timestamp: BigInt, fees: BigInt): void {
  let id = _getDayId(timestamp);
  let entity = _loadOrCreateARBFeeStat(id, "daily", timestamp);
  entity.fee = entity.fee.plus(fees);
  entity.save();

  let totalEntity = _loadOrCreateARBFeeStat("total", "total", timestamp);
  totalEntity.fee = totalEntity.fee.plus(fees);
  totalEntity.save();
}

export function storePnl(
  timestamp: BigInt,
  pnl: BigInt,
  isProfit: boolean
): void {
  let totalEntity = _loadOrCreateTradingStatEntity("total", "total", timestamp);
  let dayID = _getDayId(timestamp);
  let dailyEntity = _loadOrCreateTradingStatEntity(dayID, "daily", timestamp);

  if (isProfit) {
    totalEntity.profitCumulative = totalEntity.profitCumulative.plus(pnl);
    dailyEntity.profit = dailyEntity.profit.plus(pnl);
  } else {
    totalEntity.lossCumulative = totalEntity.lossCumulative.plus(pnl);
    dailyEntity.loss = dailyEntity.loss.plus(pnl);
  }
  totalEntity.save();
  let totalEntityV2 = _loadOrCreateTradingStatEntity(
    "total",
    "total",
    timestamp
  );
  dailyEntity.profitCumulative = totalEntityV2.profitCumulative;
  dailyEntity.lossCumulative = totalEntityV2.lossCumulative;
  dailyEntity.save();
}

export function storePnlPerContract(
  timestamp: BigInt,
  pnl: BigInt,
  isProfit: boolean,
  contractAddress: Bytes
): void {
  let totalID = `total-${contractAddress}`;
  let totalEntity = _loadOrCreateAssetTradingStatEntity(
    totalID,
    "total",
    timestamp,
    contractAddress,
    "total"
  );
  let dayID = _getDayId(timestamp);
  let id = `${dayID}-${contractAddress}`;
  let dailyEntity = _loadOrCreateAssetTradingStatEntity(
    id,
    "daily",
    timestamp,
    contractAddress,
    dayID
  );

  if (isProfit) {
    totalEntity.profitCumulative = totalEntity.profitCumulative.plus(pnl);
    dailyEntity.profit = dailyEntity.profit.plus(pnl);
  } else {
    totalEntity.lossCumulative = totalEntity.lossCumulative.plus(pnl);
    dailyEntity.loss = dailyEntity.loss.plus(pnl);
  }
  totalEntity.save();
  let totalEntityV2 = _loadOrCreateAssetTradingStatEntity(
    totalID,
    "total",
    timestamp,
    contractAddress,
    "total"
  );
  dailyEntity.profitCumulative = totalEntityV2.profitCumulative;
  dailyEntity.lossCumulative = totalEntityV2.lossCumulative;
  dailyEntity.save();
}

export function updateOpenInterest(
  timestamp: BigInt,
  increaseInOpenInterest: boolean,
  isAbove: boolean,
  amount: BigInt
): void {
  let totalId = "total";
  let totalEntity = _loadOrCreateTradingStatEntity(totalId, "total", timestamp);
  if (isAbove) {
    totalEntity.longOpenInterest = increaseInOpenInterest
      ? totalEntity.longOpenInterest.plus(amount)
      : totalEntity.longOpenInterest.minus(amount);
  } else {
    totalEntity.shortOpenInterest = increaseInOpenInterest
      ? totalEntity.shortOpenInterest.plus(amount)
      : totalEntity.shortOpenInterest.minus(amount);
  }
  totalEntity.save();
  let dayID = _getDayId(timestamp);
  let dailyEntity = _loadOrCreateTradingStatEntity(dayID, "daily", timestamp);
  dailyEntity.longOpenInterest = totalEntity.longOpenInterest;
  dailyEntity.shortOpenInterest = totalEntity.shortOpenInterest;
  dailyEntity.save();
}
