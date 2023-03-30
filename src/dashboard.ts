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
  _loadOrCreateAssetTradingStatEntity,
  _loadOrCreateFeeStat,
  _loadOrCreateUserStat,
  _loadOrCreateDashboardStat,
  _loadOrCreateWeeklyRevenueAndFee,
  _loadOrCreateUserRewards,
  _calculateCurrentUtilization,
} from "./initialize";
import { BufferRouter } from "../generated/BufferRouter/BufferRouter";
import { DailyUserStat } from "../generated/schema";
import {
  State,
  RouterAddress,
  USDC_ADDRESS,
  ARB_TOKEN_ADDRESS,
} from "./config";

// For the overview section
export function updateDashboardOverviewStats(
  totalFee: BigInt,
  settlementFee: BigInt,
  token: string
): void {
  let dashboardStat = _loadOrCreateDashboardStat(token);
  dashboardStat.totalVolume = dashboardStat.totalVolume.plus(totalFee);
  dashboardStat.totalSettlementFees = dashboardStat.totalSettlementFees.plus(
    settlementFee
  );
  dashboardStat.totalTrades += 1;
  dashboardStat.save();
}

// For the markets table
export function logVolumeAndSettlementFeePerContract(
  id: string,
  period: string,
  timestamp: BigInt,
  contractAddress: Bytes,
  depositToken: string,
  totalFee: BigInt,
  settlementFee: BigInt
): void {
  let referrenceID = `${id}${contractAddress}${depositToken}`;
  let entity = VolumePerContract.load(referrenceID);
  if (entity === null) {
    entity = new VolumePerContract(referrenceID);
    entity.period = period;
    entity.timestamp = timestamp;
    entity.amount = totalFee;
    entity.optionContract = contractAddress;
    entity.depositToken = depositToken;
    entity.settlementFee = settlementFee;
    entity.save();
  } else {
    entity.amount = entity.amount.plus(totalFee);
    entity.settlementFee = entity.settlementFee.plus(settlementFee);
    entity.save();
  }
}
