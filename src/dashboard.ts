import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import { VolumePerContract } from "../generated/schema";
import { _getDayId, _getHourId, _getWeekId } from "./helpers";
import { _loadOrCreateDashboardStat } from "./initialize";

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
