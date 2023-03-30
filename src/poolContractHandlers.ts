import { BigInt, Address, Bytes } from "@graphprotocol/graph-ts";
import {
  Create,
  Expire,
  Exercise,
  UpdateReferral,
  Pause,
  BufferBinaryOptions,
} from "../generated/BufferBinaryOptions/BufferBinaryOptions";
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
  _loadOrCreateUserRewards,
  _loadOrCreatePoolStat,
} from "./initialize";
import { USDC } from "../generated/USDC/USDC";
import { DailyUserStat } from "../generated/schema";
import {
  State,
  RouterAddress,
  BFR,
  USDC_ADDRESS,
  ARBITRUM_SOLANA_ADDRESS,
} from "./config";
import { logUser } from "./core";
import { UserOptionData } from "../generated/schema";
import {
  InitiateTrade,
  CancelTrade,
  BufferRouter,
  OpenTrade,
} from "../generated/BufferRouter/BufferRouter";
import {
  BinaryPool,
  Provide,
  Withdraw,
  Profit,
  Loss,
} from "../generated/BinaryPool/BinaryPool";

export function _handleProvide(event: Provide): void {
  let poolContractInstance = BinaryPool.bind(event.address);
  let rate = poolContractInstance
    .totalTokenXBalance()
    .times(BigInt.fromI64(100000000))
    .div(poolContractInstance.totalSupply());

  let poolStat = _loadOrCreatePoolStat(
    _getDayId(event.block.timestamp),
    "daily"
  );
  let usdcContractInstance = USDC.bind(Address.fromString(USDC_ADDRESS));
  poolStat.amount = usdcContractInstance.balanceOf(event.address);
  poolStat.timestamp = event.block.timestamp;
  poolStat.rate = rate;
  poolStat.save();

  let totalPoolStat = _loadOrCreatePoolStat("total", "total");
  totalPoolStat.amount = poolStat.amount;
  totalPoolStat.timestamp = event.block.timestamp;
  totalPoolStat.save();
}

export function _handleWithdraw(event: Withdraw): void {
  let poolContractInstance = BinaryPool.bind(event.address);
  let rate = poolContractInstance
    .totalTokenXBalance()
    .times(BigInt.fromI64(100000000))
    .div(poolContractInstance.totalSupply());

  let poolStat = _loadOrCreatePoolStat(
    _getDayId(event.block.timestamp),
    "daily"
  );
  let usdcContractInstance = USDC.bind(Address.fromString(USDC_ADDRESS));
  poolStat.amount = usdcContractInstance.balanceOf(event.address);
  poolStat.timestamp = event.block.timestamp;
  poolStat.rate = rate;
  poolStat.save();

  let totalPoolStat = _loadOrCreatePoolStat("total", "total");
  totalPoolStat.amount = usdcContractInstance.balanceOf(event.address);

  totalPoolStat.timestamp = event.block.timestamp;
  totalPoolStat.save();
}

export function _handleProfit(event: Profit): void {
  let poolContractInstance = BinaryPool.bind(event.address);
  let rate = poolContractInstance
    .totalTokenXBalance()
    .times(BigInt.fromI64(100000000))
    .div(poolContractInstance.totalSupply());
  let poolStat = _loadOrCreatePoolStat(
    _getDayId(event.block.timestamp),
    "daily"
  );
  let usdcContractInstance = USDC.bind(Address.fromString(USDC_ADDRESS));
  poolStat.amount = usdcContractInstance.balanceOf(event.address);

  poolStat.timestamp = event.block.timestamp;
  poolStat.rate = rate;
  poolStat.save();

  let totalPoolStat = _loadOrCreatePoolStat("total", "total");
  totalPoolStat.amount = usdcContractInstance.balanceOf(event.address);

  totalPoolStat.timestamp = event.block.timestamp;
  totalPoolStat.save();
}

export function _handleLoss(event: Loss): void {
  let poolContractInstance = BinaryPool.bind(event.address);
  let rate = poolContractInstance
    .totalTokenXBalance()
    .times(BigInt.fromI64(100000000))
    .div(poolContractInstance.totalSupply());
  let poolStat = _loadOrCreatePoolStat(
    _getDayId(event.block.timestamp),
    "daily"
  );
  let usdcContractInstance = USDC.bind(Address.fromString(USDC_ADDRESS));
  poolStat.amount = usdcContractInstance.balanceOf(event.address);
  poolStat.timestamp = event.block.timestamp;
  poolStat.rate = rate;
  poolStat.save();

  let totalPoolStat = _loadOrCreatePoolStat("total", "total");
  totalPoolStat.amount = usdcContractInstance.balanceOf(event.address);
  totalPoolStat.timestamp = event.block.timestamp;
  totalPoolStat.save();
}
