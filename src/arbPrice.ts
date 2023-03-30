import { UNISWAP_POOL_CONTRACT } from "./config";
import { UniswapPool } from "../generated/UniswapPool/UniswapPool";
import { BigInt, Address, Bytes } from "@graphprotocol/graph-ts";

export function getARBPrice(amount: BigInt): string {
  let uniswapPool = UniswapPool.bind(Address.fromString(UNISWAP_POOL_CONTRACT));
  let slot0_data = uniswapPool.slot0();
  let arbPrice = calculatePrice(slot0_data.value0, amount);
  return arbPrice.toString();
}

function calculatePrice(sqrPricex96: BigInt, amount: BigInt): BigInt {
  let price = sqrPricex96;
  let factor = BigInt.fromI32(2).pow(192);
  let calcPrice = price
    .pow(2)
    .times(amount)
    .div(factor);

  return calcPrice;
}
