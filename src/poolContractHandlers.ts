import { BigInt, Address, Bytes } from "@graphprotocol/graph-ts";
import { _getDayId, _getHourId, _getWeekId } from "./helpers";
import { _loadOrCreatePoolStat, _loadOrCreateARBPoolStat } from "./initialize";
import { USDC } from "../generated/USDC/USDC";
import {
  USDC_ADDRESS,
  ARB_POOL_CONTRACT,
  USDC_POOL_CONTRACT,
  ARB_TOKEN_ADDRESS,
} from "./config";
import { BinaryPool } from "../generated/BinaryPool/BinaryPool";

export function _handleChangeInPool(
  timestamp: BigInt,
  contractAddress: Address
): void {
  if (contractAddress == Address.fromString(USDC_POOL_CONTRACT)) {
    let poolContractInstance = BinaryPool.bind(contractAddress);
    let rate = poolContractInstance
      .totalTokenXBalance()
      .times(BigInt.fromI64(100000000))
      .div(poolContractInstance.totalSupply());

    let poolStat = _loadOrCreatePoolStat(_getDayId(timestamp), "daily");
    let usdcContractInstance = USDC.bind(Address.fromString(USDC_ADDRESS));
    poolStat.amount = usdcContractInstance.balanceOf(contractAddress);
    poolStat.timestamp = timestamp;
    poolStat.rate = rate;
    poolStat.save();

    let totalPoolStat = _loadOrCreatePoolStat("total", "total");
    totalPoolStat.amount = poolStat.amount;
    totalPoolStat.timestamp = timestamp;
    totalPoolStat.save();
  } else if (contractAddress == Address.fromString(ARB_POOL_CONTRACT)) {
    let poolContractInstance = BinaryPool.bind(contractAddress);
    let rate = poolContractInstance
      .totalTokenXBalance()
      .times(BigInt.fromI64(100000000))
      .div(poolContractInstance.totalSupply());

    let poolStat = _loadOrCreateARBPoolStat(_getDayId(timestamp), "daily");
    let arbContractInstance = USDC.bind(Address.fromString(ARB_TOKEN_ADDRESS));
    poolStat.amount = arbContractInstance.balanceOf(contractAddress);
    poolStat.timestamp = timestamp;
    poolStat.rate = rate;
    poolStat.save();

    let totalPoolStat = _loadOrCreateARBPoolStat("total", "total");
    totalPoolStat.amount = poolStat.amount;
    totalPoolStat.timestamp = timestamp;
    totalPoolStat.save();
  }
}
