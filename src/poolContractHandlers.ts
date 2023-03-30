import { BigInt, Address } from "@graphprotocol/graph-ts";
import { _getDayId, _getHourId, _getWeekId } from "./helpers";
import { _loadOrCreatePoolStat } from "./initialize";
import { USDC } from "../generated/USDC/USDC";
import { USDC_ADDRESS } from "./config";
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
