import { Address } from "@graphprotocol/graph-ts";
import {
  Create,
  Expire,
  Exercise,
  Pause,
  BufferBinaryOptions,
} from "../generated/BufferBinaryOptions/BufferBinaryOptions";
import {
  _loadOrCreateOptionContractEntity,
  _loadOrCreateOptionDataEntity,
} from "./initialize";
import { BufferRouter } from "../generated/BufferRouter/BufferRouter";
import { State, RouterAddress, ARBITRUM_SOLANA_ADDRESS } from "./config";
import { updateOptionContractData } from "./core";
import { updateOpeningStats } from "./aggregate";

export function _handleCreate(event: Create): void {
  let contractAddress = event.address;
  let routerContract = BufferRouter.bind(Address.fromString(RouterAddress));
  if (routerContract.contractRegistry(contractAddress) == true) {
    let optionID = event.params.id;
    let optionContractInstance = BufferBinaryOptions.bind(contractAddress);
    let optionData = optionContractInstance.options(optionID);
    let isAbove = optionData.value6 ? true : false;
    let totalFee = event.params.totalFee;
    let poolToken = updateOptionContractData(
      true,
      isAbove,
      totalFee,
      contractAddress
    );
    let tokenReferrenceID = "";
    if (poolToken == "USDC_POL") {
      tokenReferrenceID = "USDC";
    } else if (poolToken == "ARB") {
      tokenReferrenceID = "ARB";
    } else if (poolToken == "USDC") {
      tokenReferrenceID = "USDC";
    }
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
    userOptionData.poolToken = poolToken;
    userOptionData.save();

    updateOpeningStats(
      userOptionData.depositToken,
      event.block.timestamp,
      totalFee,
      event.params.account
    );
  }
}

export function _handleExpire(event: Expire): void {
  let contractAddress = event.address;
  let routerContract = BufferRouter.bind(Address.fromString(RouterAddress));
  if (
    routerContract.contractRegistry(contractAddress) == true ||
    contractAddress == Address.fromString(ARBITRUM_SOLANA_ADDRESS)
  ) {
    let userOptionData = _loadOrCreateOptionDataEntity(
      event.params.id,
      contractAddress
    );
    userOptionData.state = State.expired;
    userOptionData.expirationPrice = event.params.priceAtExpiration;
    userOptionData.save();
  }
}

export function _handleExercise(event: Exercise): void {
  let contractAddress = event.address;
  let routerContract = BufferRouter.bind(Address.fromString(RouterAddress));
  if (
    routerContract.contractRegistry(contractAddress) == true ||
    contractAddress == Address.fromString(ARBITRUM_SOLANA_ADDRESS)
  ) {
    let userOptionData = _loadOrCreateOptionDataEntity(
      event.params.id,
      contractAddress
    );
    userOptionData.state = State.exercised;
    userOptionData.payout = event.params.profit;
    userOptionData.expirationPrice = event.params.priceAtExpiration;
    userOptionData.save();
  }
}

export function _handlePause(event: Pause): void {
  let routerContract = BufferRouter.bind(Address.fromString(RouterAddress));
  if (routerContract.contractRegistry(event.address) == true) {
    let isPaused = event.params.isPaused;
    let optionContract = _loadOrCreateOptionContractEntity(event.address);
    optionContract.isPaused = isPaused;
    optionContract.save();
  }
}
