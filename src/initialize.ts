import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  OptionContract,
  LBFRStatsPerUser,
  LBFRClaimDataPerUser,
} from "../generated/schema";
import { BufferBinaryOptions } from "../generated/BufferBinaryOptions/BufferBinaryOptions";
import {
  ARB_POOL_CONTRACT,
  ARB_TOKEN_ADDRESS,
  USDC_ADDRESS,
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
    let optionContractToken = optionContractInstance.tokenX();
    if (optionContractToken == Address.fromString(USDC_ADDRESS)) {
      optionContract.token = "USDC";
    } else if (optionContractToken == Address.fromString(ARB_TOKEN_ADDRESS)) {
      optionContract.token = "ARB";
    }
    optionContract.save();
  }
  return optionContract as OptionContract;
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

export function _loadOrCreateLBFRClaimDataPerUser(
  userAddress: Bytes,
  timestamp: BigInt
): LBFRClaimDataPerUser {
  let lbfrStat = LBFRClaimDataPerUser.load(userAddress);
  if (lbfrStat == null) {
    lbfrStat = new LBFRClaimDataPerUser(userAddress);
    lbfrStat.lastClaimedTimestamp = timestamp;
    lbfrStat.claimed = ZERO;
    lbfrStat.claimable = ZERO;
    lbfrStat.userAddress = userAddress;
    lbfrStat.save();
  }
  return lbfrStat as LBFRClaimDataPerUser;
}
