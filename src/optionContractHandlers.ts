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
  _loadOrCreateARBVolumeStat,
  _loadOrCreateTradingStatEntity,
  _loadOrCreateAssetTradingStatEntity,
  _loadOrCreateFeeStat,
  _loadOrCreateUserStat,
  _loadOrCreateDashboardStat,
  _loadOrCreateDailyRevenueAndFee,
  _loadOrCreateWeeklyRevenueAndFee,
  _loadOrCreateARBFeeStat,
  _loadOrCreateReferralData,
  _loadOrCreatePoolStat,
  _loadOrCreateUserRewards,
} from "./initialize";
import { BufferRouter } from "../generated/BufferRouter/BufferRouter";
import { convertARBToUSDC } from "./convertToUSDC";
import { State, RouterAddress, ARBITRUM_SOLANA_ADDRESS } from "./config";
import { updateOptionContractData } from "./core";
import { updateOpeningStats, updateClosingStats } from "./aggregate";

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

    if (userOptionData.depositToken == "ARB") {
      userOptionData.ARBVolume = convertARBToUSDC(totalFee);
      userOptionData.save();
    }
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
    let userOptionData = _loadOrCreateOptionDataEntity(
      event.params.id,
      contractAddress
    );
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
    }
  }
}

export function _handlePause(event: Pause): void {
  let isPaused = event.params.isPaused;
  let optionContract = _loadOrCreateOptionContractEntity(event.address);
  optionContract.isPaused = isPaused;
  optionContract.save();
}

export function _handleUpdateReferral(event: UpdateReferral): void {
  // let routerContract = BufferRouter.bind(Address.fromString(RouterAddress));
  let optionContractEntity = _loadOrCreateOptionContractEntity(event.address);
  // if (routerContract.contractRegistry(event.address) == true) {
  //   if (optionContractEntity.token == "USDC") {
  //     let user = event.params.user;
  //     let referrer = event.params.referrer;

  //     let userReferralData = _loadOrCreateReferralData(user);
  //     userReferralData.totalDiscountAvailed = userReferralData.totalDiscountAvailed.plus(
  //       event.params.rebate
  //     );
  //     userReferralData.totalTradingVolume = userReferralData.totalTradingVolume.plus(
  //       event.params.totalFee
  //     );
  //     userReferralData.save();

  //     let referrerReferralData = _loadOrCreateReferralData(referrer);
  //     referrerReferralData.totalTradesReferred += 1;
  //     referrerReferralData.totalVolumeOfReferredTrades = referrerReferralData.totalVolumeOfReferredTrades.plus(
  //       event.params.totalFee
  //     );
  //     referrerReferralData.totalRebateEarned = referrerReferralData.totalRebateEarned.plus(
  //       event.params.referrerFee
  //     );
  //     referrerReferralData.save();

  //     let dayID = _getDayId(event.block.timestamp);
  //     let userRewardEntity = _loadOrCreateUserRewards(
  //       dayID,
  //       event.block.timestamp
  //     );
  //     userRewardEntity.referralDiscount = userRewardEntity.referralDiscount.plus(
  //       event.params.rebate
  //     );
  //     userRewardEntity.referralReward = userRewardEntity.referralReward.plus(
  //       event.params.referrerFee
  //     );
  //     userRewardEntity.nftDiscount = userRewardEntity.cumulativeReward.minus(
  //       event.params.rebate
  //     );
  //     userRewardEntity.save();
  //   }
  // }
}
