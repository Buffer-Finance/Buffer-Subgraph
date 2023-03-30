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
  contractAddress: Address
): string {
  let optionContractData = _loadOrCreateOptionContractEntity(contractAddress);
  let tokenReferrenceID = optionContractData.token;
  let optionContractInstance = BufferBinaryOptions.bind(contractAddress);
  let totalLockedAmount = optionContractInstance.totalLockedAmount();
  let poolAddress = optionContractInstance.pool();
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

