import { BigInt } from "@graphprotocol/graph-ts";
import { Address } from "@graphprotocol/graph-ts";

export function _getDayId(timestamp: BigInt): string {
    let dayTimestamp = (timestamp.toI32() - 16 * 3600) / 86400;
    return dayTimestamp.toString();
}

export function _getWeekId(timestamp: BigInt): string {
    let dayTimestamp = timestamp.toI32() / (86400 * 7) ;
    return dayTimestamp.toString();
}

export function _getHourId(timestamp: BigInt): string {
    let hourTimestamp = (timestamp.toI32() - 16 * 3600) / 3600;
    return hourTimestamp.toString();
}

export function _checkIfUserInArray(
    account: Address,
    users: Array<Address>
): boolean {
    for (let i = 0; i < users.length; i++) {
        if (users[i] == account) {
            return true;
        }
    }
    return false;
}
