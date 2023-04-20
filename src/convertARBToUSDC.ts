import { UNISWAP_POOL_CONTRACT } from "./config";
import { UniswapPool } from "../generated/UniswapPool/UniswapPool";
import { BigInt, Address } from "@graphprotocol/graph-ts";

export function convertARBToUSDC(amount: BigInt): BigInt {
//   let uniswapPool = UniswapPool.bind(Address.fromString(UNISWAP_POOL_CONTRACT));
//   let slot0_data = uniswapPool.slot0();
//   let arbToUSDC = slot0_data.value0
//     .pow(2)
//     .times(amount)
//     .div(BigInt.fromI32(2).pow(192));
  let arbToUSDC = amount;
  return arbToUSDC;
}