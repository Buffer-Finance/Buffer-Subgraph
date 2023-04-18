import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  UserOptionData,
  OptionContract,
  UserStat,
  LBFRStatsPerUser,
  QueuedOptionData,
  ClaimedLBFRPerUser,
} from "../generated/schema";
import { _getDayId, _getWeekId } from "./helpers";
import { BufferBinaryOptions } from "../generated/BufferBinaryOptions/BufferBinaryOptions";
import {
  ARB_POOL_CONTRACT,
  USDC_POL_POOL_CONTRACT,
  USDC_POOL_CONTRACT,
} from "./config";

export const ZERO = BigInt.fromI32(0);

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
    let optionContractPool = optionContractInstance.pool();
    if (optionContractPool == Address.fromString(USDC_POL_POOL_CONTRACT)) {
      optionContract.token = "USDC";
      optionContract.pool = "USDC_POL";
    } else if (optionContractPool == Address.fromString(ARB_POOL_CONTRACT)) {
      optionContract.token = "ARB";
      optionContract.pool = "ARB";
    } else if (optionContractPool == Address.fromString(USDC_POOL_CONTRACT)) {
      optionContract.token = "USDC";
      optionContract.pool = "USDC";
    }
    optionContract.save();
  }
  return optionContract as OptionContract;
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

export function _loadOrCreateLBFRStat(
  period: string,
  timestamp: BigInt,
  userAddress: Bytes,
  periodID: string
): LBFRStatsPerUser {
  let id = `${periodID}${userAddress}`;
  let lbfrStat = LBFRStatsPerUser.load(id);
  if (lbfrStat == null) {
    lbfrStat = new LBFRStatsPerUser(id);
    lbfrStat.timestamp = timestamp;
    lbfrStat.volume = ZERO;
    lbfrStat.lBFRAlloted = ZERO;
    lbfrStat.periodID = periodID;
    lbfrStat.period = period;
    lbfrStat.userAddress = userAddress;
    lbfrStat.volumeUSDC = ZERO;
    lbfrStat.volumeARB = ZERO;
    lbfrStat.save();
  }
  return lbfrStat as LBFRStatsPerUser;
}

export function _loadOrCreateClaimedLBFRPerUser(
  userAddress: Bytes,
  timestamp: BigInt
): ClaimedLBFRPerUser {
  let lbfrStat = ClaimedLBFRPerUser.load(userAddress);
  if (lbfrStat == null) {
    lbfrStat = new ClaimedLBFRPerUser(userAddress);
    lbfrStat.timestamp = timestamp;
    lbfrStat.lBFRClaimed = ZERO;
    lbfrStat.userAddress = userAddress;
    lbfrStat.save();
  }
  return lbfrStat as ClaimedLBFRPerUser;
}
