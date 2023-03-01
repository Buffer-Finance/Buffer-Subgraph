import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
    UserOptionData,
    OptionContract,
    QueuedOptionData,
    User,
    NFT
} from "../generated/schema";
let ZERO = BigInt.fromI32(0);
let ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function _loadOrCreateQueuedOptionEntity(
    queueID: BigInt,
    contractAddress: Bytes
): QueuedOptionData {
    let referenceID = `${queueID}${contractAddress}`;
    let entity = QueuedOptionData.load(referenceID);
    if (entity == null) {
        entity = new QueuedOptionData(referenceID);
        entity.queueID = queueID;
        entity.optionContract = contractAddress;
        entity.queueTimestamp = ZERO;
        entity.cancelTimestamp = ZERO;
        entity.save();
    }
    return entity as QueuedOptionData;
}

export function _loadOrCreateOptionDataEntity(
    optionID: BigInt,
    contractAddress: Bytes
): UserOptionData {
    let referrenceID = `${optionID}${contractAddress}`;
    let entity = UserOptionData.load(referrenceID);
    if (entity == null) {
        entity = new UserOptionData(referrenceID);
        entity.optionID = optionID;
        entity.optionContract = contractAddress;
        entity.amount = ZERO;
        entity.totalFee = ZERO;
    }
    return entity as UserOptionData;
}

export function _loadOrCreateOptionContractEntity(
    contractAddress: Bytes
): OptionContract {
    let optionContract = OptionContract.load(contractAddress);
    if (optionContract == null) {
        optionContract = new OptionContract(contractAddress);
        optionContract.address = contractAddress;
        optionContract.volume = ZERO;
        optionContract.tradeCount = 0;
        optionContract.openDown = 0;
        optionContract.openUp = 0;
        optionContract.openInterest = ZERO;
        optionContract.currentUtilization = ZERO;
        optionContract.payoutForDown = ZERO;
        optionContract.payoutForUp = ZERO;
        optionContract.save();
    }
    return optionContract as OptionContract;
}

export function _loadOrCreateUserEntity(address: Bytes): User {
    let entity = User.load(address);
    if (entity == null) {
        entity = new User(address);
        entity.address = address;
        entity.save();
    }
    return entity as User;
}

export function _loadOrCreateNFT(tokenId: BigInt): NFT {
    let referenceID = `${tokenId}`;
    let entity = NFT.load(referenceID);
    if (entity == null) {
        entity = new NFT(referenceID);
        entity.batchId = ZERO;
        entity.tokenId = tokenId;
        entity.tier = "";
        entity.owner = Bytes.fromHexString(ZERO_ADDRESS);
        entity.nftImage = "";
        entity.ipfs = "";
        entity.hasRevealed = false;

        entity.save();
    }
    return entity as NFT;
}
