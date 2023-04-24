import { Create } from "../generated/BufferBinaryOptions/BufferBinaryOptions";
import { Claim } from "../generated/FaucetLBFR/FaucetLBFR";
import {
  _loadOrCreateLBFRClaimDataPerUser,
  _loadOrCreateOptionContractEntity,
  _loadOrCreateLBFRStat,
} from "./initialize";
import { Address, BigInt } from "@graphprotocol/graph-ts";
import { BufferRouter } from "../generated/BufferRouter/BufferRouter";
import { RouterAddress, LBFR_START_TIMESTAMP } from "./config";
import { updateLBFRStats } from "./aggregate";
import { _getWeekId } from "./helpers";

export function handleCreate(event: Create): void {
  let contractAddress = event.address;
  let routerContract = BufferRouter.bind(Address.fromString(RouterAddress));
  if (routerContract.contractRegistry(contractAddress) == true) {
    if (BigInt.fromI32(LBFR_START_TIMESTAMP) < event.block.timestamp) {
      let optionContract = _loadOrCreateOptionContractEntity(contractAddress);
      let token = optionContract.token;
      updateLBFRStats(
        token,
        event.block.timestamp,
        event.params.totalFee,
        event.params.account
      );
    }
  }
}

export function handleClaim(event: Claim): void {
  let claimDataPerUser = _loadOrCreateLBFRClaimDataPerUser(
    event.params.account,
    event.block.timestamp
  );
  claimDataPerUser.claimed = claimDataPerUser.claimed.plus(
    event.params.claimedTokens
  );
  let LBFRStatTotal = _loadOrCreateLBFRStat(
    "total",
    event.block.timestamp,
    event.params.account,
    "total"
  );
  claimDataPerUser.claimable = LBFRStatTotal.lBFRAlloted.minus(
    claimDataPerUser.claimed
  );
  let LBFRStatWeekly = _loadOrCreateLBFRStat(
    "weekly",
    event.block.timestamp,
    event.params.account,
    event.params.weekID
  );
  LBFRStatWeekly.claimed = LBFRStatWeekly.claimed.plus(
    event.params.claimedTokens
  );
  LBFRStatWeekly.claimable = LBFRStatWeekly.claimable.minus(
    event.params.claimedTokens
  );
  LBFRStatTotal.claimed = LBFRStatTotal.claimed.plus(
    event.params.claimedTokens
  );
  LBFRStatTotal.claimable = LBFRStatTotal.claimable.minus(
    event.params.claimedTokens
  );
  claimDataPerUser.lastClaimedTimestamp = event.block.timestamp;
  claimDataPerUser.save();
  LBFRStatWeekly.save();
  LBFRStatTotal.save();
}
