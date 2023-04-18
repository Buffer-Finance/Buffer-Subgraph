import { Create } from "../generated/BufferBinaryOptions/BufferBinaryOptions";
import { Claim } from "../generated/FaucetLBFR/FaucetLBFR";
import { _loadOrCreateClaimedLBFRPerUser } from "./initialize";
import { Address, BigInt } from "@graphprotocol/graph-ts";
import { _loadOrCreateOptionContractEntity } from "./initialize";
import { BufferRouter } from "../generated/BufferRouter/BufferRouter";
import { RouterAddress, LBFR_START_TIMESTAMP } from "./config";
import { updateLBFRStats } from "./aggregate";

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
  let claimedLBFRPerUser = _loadOrCreateClaimedLBFRPerUser(
    event.params.account,
    event.block.timestamp
  );
  claimedLBFRPerUser.lBFRClaimed = claimedLBFRPerUser.lBFRClaimed.plus(
    event.params.amount
  );
  claimedLBFRPerUser.timestamp = event.block.timestamp;
  claimedLBFRPerUser.save();
}
