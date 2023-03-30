import { BigInt, Address, Bytes } from "@graphprotocol/graph-ts";
import {
  Create,
  BufferBinaryOptions,
} from "../generated/BufferBinaryOptions/BufferBinaryOptions";
import { BinaryPool } from "../generated/BinaryPool/BinaryPool";
import { User, VolumePerContract } from "../generated/schema";
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
  _loadOrCreateDailyRevenueAndFee,
  _loadOrCreateWeeklyRevenueAndFee,
  _loadOrCreateUserRewards,
  _calculateCurrentUtilization,
  _loadOrCreateLeaderboardEntity,
  _loadOrCreateWeeklyLeaderboardEntity,
} from "./initialize";
import { BufferRouter } from "../generated/BufferRouter/BufferRouter";
import { DailyUserStat } from "../generated/schema";
import {
  State,
  RouterAddress,
  USDC_ADDRESS,
  ARB_TOKEN_ADDRESS,
} from "./config";

//To update the current leaderboard : Daily & Weekly
export function updateLeaderboards(
  totalFee: BigInt,
  timestamp: BigInt,
  user: Bytes,
  isExercised: boolean
): void {
  _updateDailyLeaderboard(totalFee, timestamp, user, isExercised);
  _updateWeeklyLeaderboard(totalFee, timestamp, user, isExercised);
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
  isExercised: boolean
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
    weeklyLeaderboardEntity.winRate =
      (weeklyLeaderboardEntity.tradesWon * 100000) /
      weeklyLeaderboardEntity.totalTrades;
  }
  weeklyLeaderboardEntity.save();
}
