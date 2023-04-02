import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import { _getDayId, _getHourId, _getWeekId } from "./helpers";
import {
  _loadOrCreateDailyRevenueAndFee,
  _loadOrCreateWeeklyRevenueAndFee,
  _loadOrCreateLeaderboardEntity,
  _loadOrCreateWeeklyLeaderboardEntity,
} from "./initialize";

//To update the current leaderboard : Daily & Weekly
export function updateLeaderboards(
  totalFee: BigInt,
  timestamp: BigInt,
  user: Bytes,
  isExercised: boolean,
  arbVolume: BigInt,
  isARB: boolean,
  usdcVolume: BigInt,
  isUSDC: boolean
): void {
  _updateDailyLeaderboard(totalFee, timestamp, user, isExercised);
  _updateWeeklyLeaderboard(
    totalFee,
    timestamp,
    user,
    isExercised,
    arbVolume,
    isUSDC,
    usdcVolume,
    isARB
  );
}

//To calculate Reward Pool for leaderboards
export function updateDailyAndWeeklyRevenue(
  totalFee: BigInt,
  timestamp: BigInt,
  settlementFee: BigInt
): void {
  // Daily
  let dayID = _getDayId(timestamp);
  let dailyRevenueAndFee = _loadOrCreateDailyRevenueAndFee(dayID, timestamp);
  dailyRevenueAndFee.totalFee = dailyRevenueAndFee.totalFee.plus(totalFee);
  dailyRevenueAndFee.settlementFee = dailyRevenueAndFee.settlementFee.plus(
    settlementFee
  );
  dailyRevenueAndFee.save();

  // Weekly
  let weeklyFeeAndRevenue = _loadOrCreateWeeklyRevenueAndFee(
    _getWeekId(timestamp),
    timestamp
  );
  weeklyFeeAndRevenue.totalFee = weeklyFeeAndRevenue.totalFee.plus(totalFee);
  weeklyFeeAndRevenue.settlementFee = weeklyFeeAndRevenue.settlementFee.plus(
    settlementFee
  );
  weeklyFeeAndRevenue.save();
}

function _updateDailyLeaderboard(
  totalFee: BigInt,
  timestamp: BigInt,
  user: Bytes,
  isExercised: boolean
): void {
  let dailyLeaderboardEntity = _loadOrCreateLeaderboardEntity(
    _getDayId(timestamp),
    user
  );
  dailyLeaderboardEntity.volume = dailyLeaderboardEntity.volume.plus(totalFee);
  dailyLeaderboardEntity.totalTrades += 1;
  dailyLeaderboardEntity.netPnL = isExercised
    ? dailyLeaderboardEntity.netPnL.plus(totalFee)
    : dailyLeaderboardEntity.netPnL.minus(totalFee);
  dailyLeaderboardEntity.save();
}

function _updateWeeklyLeaderboard(
  totalFee: BigInt,
  timestamp: BigInt,
  user: Bytes,
  isExercised: boolean,
  arbVolume: BigInt,
  isUSDC: boolean,
  usdcVolume: BigInt,
  isARB: boolean
): void {
  let weeklyLeaderboardEntity = _loadOrCreateWeeklyLeaderboardEntity(
    _getWeekId(timestamp),
    user
  );
  weeklyLeaderboardEntity.volume = weeklyLeaderboardEntity.volume.plus(
    totalFee
  );
  weeklyLeaderboardEntity.totalTrades += 1;
  weeklyLeaderboardEntity.netPnL = isExercised
    ? weeklyLeaderboardEntity.netPnL.plus(totalFee)
    : weeklyLeaderboardEntity.netPnL.minus(totalFee);
  if (isExercised) {
    weeklyLeaderboardEntity.tradesWon += 1;
  }
  weeklyLeaderboardEntity.winRate =
    (weeklyLeaderboardEntity.tradesWon * 100000) /
    weeklyLeaderboardEntity.totalTrades;
  weeklyLeaderboardEntity.arbVolume = weeklyLeaderboardEntity.arbVolume.plus(
    arbVolume
  );
  weeklyLeaderboardEntity.arbNetPnL = isExercised
    ? weeklyLeaderboardEntity.arbNetPnL.plus(arbVolume)
    : weeklyLeaderboardEntity.arbNetPnL.minus(arbVolume);
  let arbTotalTrades = isARB ? 1 : 0;
  weeklyLeaderboardEntity.arbTotalTrades += arbTotalTrades;
  weeklyLeaderboardEntity.arbTradesWon += isExercised ? arbTotalTrades : 0;
  if (weeklyLeaderboardEntity.arbTotalTrades > 0) {
    weeklyLeaderboardEntity.arbWinRate =
      (weeklyLeaderboardEntity.arbTradesWon * 100000) /
      weeklyLeaderboardEntity.arbTotalTrades;
  }

  weeklyLeaderboardEntity.usdcVolume = weeklyLeaderboardEntity.usdcVolume.plus(
    usdcVolume
  );
  weeklyLeaderboardEntity.usdcNetPnL = isExercised
    ? weeklyLeaderboardEntity.usdcNetPnL.plus(usdcVolume)
    : weeklyLeaderboardEntity.usdcNetPnL.minus(usdcVolume);
  let usdcTotalTrades = isUSDC ? 1 : 0;
  weeklyLeaderboardEntity.usdcTotalTrades += usdcTotalTrades;
  weeklyLeaderboardEntity.usdcTradesWon += isExercised ? usdcTotalTrades : 0;
  if (weeklyLeaderboardEntity.usdcTotalTrades > 0) {
    weeklyLeaderboardEntity.usdcWinRate =
      (weeklyLeaderboardEntity.usdcTradesWon * 100000) /
      weeklyLeaderboardEntity.usdcTotalTrades;
  }

  weeklyLeaderboardEntity.save();
}
