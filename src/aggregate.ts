import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import { _getHourId } from "./helpers";
import { ZERO } from "./initialize";
import {
  updateOpenInterest,
  storeFees,
  logVolume,
  storePnl,
  storePnlPerContract,
  saveSettlementFeeDiscount,
} from "./stats";
import { updateDailyAndWeeklyRevenue, updateLeaderboards } from "./leaderboard";
import {
  logVolumeAndSettlementFeePerContract,
  updateDashboardOverviewStats,
} from "./dashboard";
import { convertARBToUSDC } from "./convertToUSDC";

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
    updateDashboardOverviewStats(totalFee, settlementFee, "total");

    // Update daily and weekly volume and fees
    updateDailyAndWeeklyRevenue(totalFee, timestamp, settlementFee);

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
    logVolumeAndSettlementFeePerContract(
      _getHourId(timestamp),
      "hourly",
      timestamp,
      contractAddress,
      "total",
      totalFee,
      settlementFee
    );

    // Update daily & total fees
    storeFees(timestamp, settlementFee, ZERO, settlementFee);

    // Update daily & total volume
    logVolume(timestamp, totalFee, ZERO, totalFee);

    // Update daily & total open interest
    updateOpenInterest(timestamp, true, isAbove, totalFee);

    // Updates referral & NFT discounts tracking
    saveSettlementFeeDiscount(timestamp, totalFee, settlementFee);
  } else if (token == "ARB") {
    let totalFeeUSDC = convertARBToUSDC(totalFee);
    let settlementFeeUSDC = convertARBToUSDC(settlementFee);

    // Dashboard Page - overview
    updateDashboardOverviewStats(totalFee, settlementFee, token);
    updateDashboardOverviewStats(totalFeeUSDC, settlementFeeUSDC, "total");

    // Update daily and weekly volume and fees
    updateDailyAndWeeklyRevenue(totalFeeUSDC, timestamp, settlementFeeUSDC);

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
    // Dashboard Page - markets table
    logVolumeAndSettlementFeePerContract(
      _getHourId(timestamp),
      "hourly",
      timestamp,
      contractAddress,
      "total",
      totalFeeUSDC,
      settlementFeeUSDC
    );

    // Update daily & total fees
    storeFees(timestamp, settlementFeeUSDC, settlementFeeUSDC, ZERO);

    // Update daily & total volume
    logVolume(timestamp, totalFeeUSDC, totalFeeUSDC, ZERO);

    // Update daily & total open interest
    updateOpenInterest(timestamp, true, isAbove, totalFeeUSDC);

    // Updates referral & NFT discounts tracking
    saveSettlementFeeDiscount(timestamp, totalFeeUSDC, settlementFeeUSDC);
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
  isExercised: boolean,
  netPnL: BigInt
): void {
  if (token == "USDC") {
    // Update daily & total open interest
    updateOpenInterest(timestamp, false, isAbove, totalFee);
    // Update daily & total PnL for stats page
    storePnl(
      timestamp,
      totalFee.minus(settlementFee),
      isExercised,
      totalFee.minus(settlementFee),
      ZERO
    );
    // Update daily & total PnL per contracts for stats page
    storePnlPerContract(
      timestamp,
      totalFee.minus(settlementFee),
      isExercised,
      contractAddress
    );
    // Update Leaderboards
    updateLeaderboards(
      totalFee,
      timestamp,
      user,
      isExercised,
      ZERO,
      false,
      totalFee,
      true,
      netPnL,
      ZERO,
      netPnL
    );
  } else if (token == "ARB") {
    let totalFeeUSDC = convertARBToUSDC(totalFee);
    let settlementFeeUSDC = convertARBToUSDC(settlementFee);
    let netPnLUSDC = convertARBToUSDC(netPnL);

    // Update daily & total open interest
    updateOpenInterest(timestamp, false, isAbove, totalFeeUSDC);
    // Update daily & total PnL for stats page
    storePnl(
      timestamp,
      totalFeeUSDC.minus(settlementFeeUSDC),
      isExercised,
      ZERO,
      totalFeeUSDC.minus(settlementFeeUSDC)
    );
    // Update daily & total PnL per contracts for stats page
    storePnlPerContract(
      timestamp,
      totalFeeUSDC.minus(settlementFeeUSDC),
      isExercised,
      contractAddress
    );
    // Update Leaderboards
    updateLeaderboards(
      totalFeeUSDC,
      timestamp,
      user,
      isExercised,
      totalFee,
      true,
      ZERO,
      false,
      netPnLUSDC,
      netPnL,
      ZERO
    );
  }
}
