import { Address } from "@graphprotocol/graph-ts";

export enum State {
  active = 1,
  exercised = 2,
  expired = 3,
  queued = 4,
  cancelled = 5,
  undefined = 6
}

export const RouterAddress = Address.fromString("0x31B1850Df80CA0AAbD6bd2F37B5bbE86BF304784")