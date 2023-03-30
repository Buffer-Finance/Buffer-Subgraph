import { Address } from "@graphprotocol/graph-ts";
import {
  Create,
  Expire,
  Exercise,
  UpdateReferral,
  Pause,
  BufferBinaryOptions,
} from "../generated/BufferBinaryOptions/BufferBinaryOptions";
import { _getDayId, _getHourId, _getWeekId } from "./helpers";
import {
  _loadOrCreateOptionContractEntity,
  _loadOrCreateOptionDataEntity,
  _loadOrCreateQueuedOptionEntity,
  _loadOrCreateVolumeStat,
  _loadOrCreateTradingStatEntity,
  _loadOrCreateAssetTradingStatEntity,
  _loadOrCreateFeeStat,
  _loadOrCreateUserStat,
  _loadOrCreateDashboardStat,
  _loadOrCreateReferralData,
  _loadOrCreatePoolStat,
  _loadOrCreateUserRewards,
} from "./initialize";
import { BufferRouter } from "../generated/BufferRouter/BufferRouter";
import { convertARBToUSDC } from "./convertToUSDC";
import { State, RouterAddress, ARBITRUM_SOLANA_ADDRESS } from "./config";
import { updateOptionContractData } from "./core";
import { updateOpeningStats, updateClosingStats } from "./aggregate";
import { referralAndNFTDiscountStats } from "./stats";
import { UserOptionData } from "../generated/schema";

export function _handleCreate(event: Create): void {
  let contractAddress = event.address;
  let routerContract = BufferRouter.bind(Address.fromString(RouterAddress));
  if (routerContract.contractRegistry(contractAddress) == true) {
    let optionID = event.params.id;
    let optionContractInstance = BufferBinaryOptions.bind(contractAddress);
    let optionData = optionContractInstance.options(optionID);
    let isAbove = optionData.value6 ? true : false;
    let totalFee = event.params.totalFee;
    let tokenReferrenceID = updateOptionContractData(
      true,
      isAbove,
      totalFee,
      contractAddress
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
    userOptionData.save();

    updateOpeningStats(
      userOptionData.depositToken,
      event.block.timestamp,
      totalFee,
      userOptionData.settlementFee,
      isAbove,
      contractAddress
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
    let referrenceID = `${event.params.id}${contractAddress}`;
    let userOptionData = UserOptionData.load(referrenceID);
    if (userOptionData != null) {
      userOptionData.state = State.expired;
      userOptionData.expirationPrice = event.params.priceAtExpiration;
      userOptionData.save();
      updateOptionContractData(
        false,
        userOptionData.isAbove,
        userOptionData.totalFee,
        contractAddress
      );

      updateClosingStats(
        userOptionData.depositToken,
        userOptionData.creationTime,
        userOptionData.totalFee,
        userOptionData.settlementFee,
        userOptionData.isAbove,
        userOptionData.user,
        contractAddress,
        false
      );
    } else {
      throw console.error(
        "User option data not found for id {} and contract {}",
        [event.params.id.toString(), event.address.toHexString()]
      );
    }
  }
}

export function _handleExercise(event: Exercise): void {
  let contractAddress = event.address;
  let routerContract = BufferRouter.bind(Address.fromString(RouterAddress));
  if (
    routerContract.contractRegistry(contractAddress) == true ||
    contractAddress == Address.fromString(ARBITRUM_SOLANA_ADDRESS)
  ) {
    let referrenceID = `${event.params.id}${contractAddress}`;
    let userOptionData = UserOptionData.load(referrenceID);
    if (userOptionData != null) {
      userOptionData.state = State.exercised;
      userOptionData.payout = event.params.profit;
      userOptionData.expirationPrice = event.params.priceAtExpiration;
      userOptionData.save();

      updateOptionContractData(
        false,
        userOptionData.isAbove,
        userOptionData.totalFee,
        contractAddress
      );

      updateClosingStats(
        userOptionData.depositToken,
        userOptionData.creationTime,
        userOptionData.totalFee,
        userOptionData.settlementFee,
        userOptionData.isAbove,
        userOptionData.user,
        contractAddress,
        true
      );
    } else {
      throw console.error(
        "User option data not found for id {} and contract {}",
        [event.params.id.toString(), event.address.toHexString()]
      );
    }
  }
}

export function _handleUpdateReferral(event: UpdateReferral): void {
  let routerContract = BufferRouter.bind(Address.fromString(RouterAddress));
  let optionContractEntity = _loadOrCreateOptionContractEntity(event.address);
  if (routerContract.contractRegistry(event.address) == true) {
    if (optionContractEntity.token == "USDC") {
      let userReferralData = _loadOrCreateReferralData(event.params.user);
      userReferralData.totalDiscountAvailed = userReferralData.totalDiscountAvailed.plus(
        event.params.rebate
      );
      userReferralData.totalTradingVolume = userReferralData.totalTradingVolume.plus(
        event.params.totalFee
      );
      userReferralData.save();

      let referrerReferralData = _loadOrCreateReferralData(
        event.params.referrer
      );
      referrerReferralData.totalTradesReferred += 1;
      referrerReferralData.totalVolumeOfReferredTrades = referrerReferralData.totalVolumeOfReferredTrades.plus(
        event.params.totalFee
      );
      referrerReferralData.totalRebateEarned = referrerReferralData.totalRebateEarned.plus(
        event.params.referrerFee
      );
      referrerReferralData.save();

      referralAndNFTDiscountStats(
        event.block.timestamp,
        event.params.rebate,
        event.params.referrerFee
      );
    }
  }
}

export function _handlePause(event: Pause): void {
  let isPaused = event.params.isPaused;
  let optionContract = _loadOrCreateOptionContractEntity(event.address);
  optionContract.isPaused = isPaused;
  optionContract.save();
}
