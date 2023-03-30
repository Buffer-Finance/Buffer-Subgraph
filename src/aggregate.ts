import { BigInt, Address, Bytes } from "@graphprotocol/graph-ts";
import {
  Create,
  Expire,
  Exercise,
  UpdateReferral,
  Pause,
  BufferBinaryOptions,
} from "../generated/BufferBinaryOptions/BufferBinaryOptions";
import { BinaryPool, Profit } from "../generated/BinaryPool/BinaryPool";
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
  _loadOrCreateARBFeeStat,
  _loadOrCreateReferralData,
  _loadOrCreatePoolStat,
  _loadOrCreateUserRewards,
} from "./initialize";
import { BufferRouter } from "../generated/BufferRouter/BufferRouter";
import { State, RouterAddress, ARBITRUM_SOLANA_ADDRESS } from "./config";
import { logUser } from "./core";
import {
  updateOpenInterest,
  _storeFees,
  _logVolume,
  storePnl,
  storePnlPerContract,
  saveSettlementFeeDiscount,
} from "./stats";
import { UserOptionData } from "../generated/schema";
import { updateDailyAndWeeklyRevenue, updateLeaderboards } from "./leaderboard";
import {
  logVolumeAndSettlementFeePerContract,
  updateDashboardOverviewStats,
} from "./dashboard";

export function updateOpeningStats(
  token: string,
  timestamp: BigInt,
  totalFee: BigInt,
  settlementFee: BigInt,
  isAbove: boolean,
  contractAddress: Bytes
): void {
  if (token == "USDC") {
    // Dashboard Page - overview
    updateDashboardOverviewStats(totalFee, settlementFee, token);

    // Dashboard Page - markets table
    logVolumeAndSettlementFeePerContract(
      _getHourId(timestamp),
      "hourly",
      timestamp,
      contractAddress,
      token,
      totalFee,
      settlementFee
    );

    // Update daily & total fees
    _storeFees(timestamp, settlementFee);

    // Update daily & total volume
    _logVolume(timestamp, totalFee);

    // Update daily & total open interest
    updateOpenInterest(timestamp, true, isAbove, totalFee);

    // Update daily and weekly volume and fees
    updateDailyAndWeeklyRevenue(totalFee, timestamp, settlementFee);

    // Updates referral & NFT discounts tracking
    saveSettlementFeeDiscount(timestamp, totalFee, settlementFee);
  }
}

export function updateClosingStats(
  token: string,
  timestamp: BigInt,
  totalFee: BigInt,
  settlementFee: BigInt,
  isAbove: boolean,
  user: Bytes,
  contractAddress: Bytes,
  isExercised: boolean
): void {
  if (token == "USDC") {
    // Update daily & total open interest
    updateOpenInterest(timestamp, false, isAbove, totalFee);

    // Update daily & total PnL for stats page
    storePnl(timestamp, totalFee.minus(settlementFee), isExercised);

    // Update daily & total PnL per contracts for stats page
    storePnlPerContract(
      timestamp,
      totalFee.minus(settlementFee),
      isExercised,
      contractAddress
    );

    // Update Leaderboards
    updateLeaderboards(totalFee, timestamp, user, isExercised);
  }
}
