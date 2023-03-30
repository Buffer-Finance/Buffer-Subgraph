import { UNISWAP_POOL_CONTRACT } from "./config";
import { UniswapPool } from "../generated/UniswapPool/UniswapPool";
import { BigInt, Address, Bytes } from "@graphprotocol/graph-ts";

export function getARBPrice(): BigInt {
  let uniswapPool = UniswapPool.bind(Address.fromString(UNISWAP_POOL_CONTRACT));
  let slot0_data = uniswapPool.slot0();
  return calculatePrice(slot0_data.value0);
}

function calculatePrice(sqrPricex96: BigInt): BigInt {
  let price = sqrPricex96;
  let calcPrice = price.pow(2).div(new BigInt(2 ** 192));
  return calcPrice;
}
