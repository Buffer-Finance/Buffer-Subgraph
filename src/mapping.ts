import {
    Create,
    Expire,
    Exercise
} from "../generated/BufferBinaryOptions/BufferBinaryOptions";
import {
    InitiateTrade,
    CancelTrade,
    BufferRouter,
    OpenTrade
} from "../generated/BufferRouter/BufferRouter";
import { State, RouterAddress } from "./config";
import { Address, BigInt } from "@graphprotocol/graph-ts";
import { _handleCreate, _updateNFTMetadata } from "./core";
import {
    _loadOrCreateNFT,
    _loadOrCreateOptionContractEntity,
    _loadOrCreateOptionDataEntity,
    _loadOrCreateQueuedOptionEntity,
    _loadOrCreateUserEntity
} from "./initialize";
import { NFTBatch, UserOptionData } from "../generated/schema";

import {
    TokensLazyMinted,
    TokenURIRevealed,
    TokensClaimed,
    Transfer,
    DropERC721
} from "../generated/DropERC721/DropERC721";

export function handleInitiateTrade(event: InitiateTrade): void {
    let routerContract = BufferRouter.bind(event.address);
    let queueID = event.params.queueId;
    let queuedTradeData = routerContract.queuedTrades(queueID);
    let contractAddress = queuedTradeData.value6;
    _loadOrCreateOptionContractEntity(contractAddress);
    let queuedOptionData = _loadOrCreateQueuedOptionEntity(
        queueID,
        contractAddress
    );
    _loadOrCreateUserEntity(event.params.account);
    queuedOptionData.user = event.params.account;
    queuedOptionData.state = State.queued;
    queuedOptionData.strike = queuedTradeData.value7;
    queuedOptionData.totalFee = queuedTradeData.value3;
    queuedOptionData.slippage = queuedTradeData.value8;
    queuedOptionData.isAbove = queuedTradeData.value5 ? true : false;
    queuedOptionData.queueTimestamp = event.block.timestamp;
    queuedOptionData.save();
}

export function handleOpenTrade(event: OpenTrade): void {
    let routerContract = BufferRouter.bind(event.address);
    let queueID = event.params.queueId;
    let contractAddress = routerContract.queuedTrades(queueID).value6;
    let userQueuedData = _loadOrCreateQueuedOptionEntity(
        queueID,
        contractAddress
    );
    userQueuedData.state = State.opened;
    userQueuedData.save();
    let userOptionData = _loadOrCreateOptionDataEntity(
        event.params.optionId,
        contractAddress
    );
    userOptionData.queueID = queueID;
    userOptionData.save();
}

export function handleCreate(event: Create): void {
    _handleCreate(event);
}

export function handleCancelTrade(event: CancelTrade): void {
    let queueID = event.params.queueId;
    let routerContract = BufferRouter.bind(event.address);
    let contractAddress = routerContract.queuedTrades(queueID).value6;
    let userQueuedData = _loadOrCreateQueuedOptionEntity(
        queueID,
        contractAddress
    );
    userQueuedData.state = State.cancelled;
    userQueuedData.reason = event.params.reason;
    userQueuedData.cancelTimestamp = event.block.timestamp;
    userQueuedData.save();
}

export function handleExercise(event: Exercise): void {
    let routerContract = BufferRouter.bind(Address.fromString(RouterAddress));
    if (routerContract.contractRegistry(event.address)) {
        let userOptionData = _loadOrCreateOptionDataEntity(
            event.params.id,
            event.address
        );
        userOptionData.state = State.exercised;
        userOptionData.payout = event.params.profit;
        userOptionData.expirationPrice = event.params.priceAtExpiration;
        userOptionData.save();
    }
}

export function handleExpire(event: Expire): void {
    let routerContract = BufferRouter.bind(Address.fromString(RouterAddress));
    if (routerContract.contractRegistry(event.address) == true) {
        let referrenceID = `${event.params.id}${event.address}`;
        let userOptionData = UserOptionData.load(referrenceID);
        if (userOptionData != null) {
            userOptionData.state = State.expired;
            userOptionData.expirationPrice = event.params.priceAtExpiration;
            userOptionData.save();
        } else {
            throw console.error(
                "User option data not found for id {} and contract {}",
                [event.params.id.toString(), event.address.toHexString()]
            );
        }
    }
}

export function handleLazyMint(event: TokensLazyMinted): void {
    let nftContract = DropERC721.bind(event.address);
    let endTokenId = event.params.endTokenId;
    let startTokenId = event.params.startTokenId;
    let batchId = endTokenId.plus(BigInt.fromI32(1));

    let batch = new NFTBatch(batchId.toString());
    let allTokenIds = new Array<BigInt>();
    for (
        let tokenId = startTokenId;
        tokenId <= endTokenId;
        tokenId = tokenId.plus(BigInt.fromI32(1))
    ) {
        let tokenUri = nftContract.tokenURI(tokenId);
        let nft = _loadOrCreateNFT(tokenId);
        _updateNFTMetadata(nft, tokenUri.toString());
        nft.batchId = batchId;
        nft.save();
        allTokenIds.push(tokenId);
    }
    batch.tokenIds = allTokenIds;
    batch.save();
}
export function handleReveal(event: TokenURIRevealed): void {
    let nftContract = DropERC721.bind(event.address);
    let batchId = nftContract.getBatchIdAtIndex(event.params.index);
    let revealedURI = event.params.revealedURI;

    let batch = NFTBatch.load(batchId.toString());
    if (batch != null) {
        let allTokenIds = batch.tokenIds;
        for (let i = 0; i < allTokenIds.length; i++) {
            let nft = _loadOrCreateNFT(allTokenIds[i]);
            _updateNFTMetadata(nft, `${revealedURI}${allTokenIds[i]}`);
            nft.hasRevealed = true;
            nft.save();
        }
    }
}

export function handleNftTransfer(event: Transfer): void {
    let nft = _loadOrCreateNFT(event.params.tokenId);
    nft.owner = event.params.to;
    nft.save();
}

export function handleTokenClaim(event: TokensClaimed): void {
    for (
        let tokenId = event.params.startTokenId;
        tokenId < event.params.startTokenId.plus(event.params.quantityClaimed);
        tokenId = tokenId.plus(BigInt.fromI32(1))
    ) {
        let nft = _loadOrCreateNFT(tokenId);
        nft.claimTimestamp = event.block.timestamp;
        nft.phaseId = event.params.claimConditionIndex;
        nft.save();
    }
}
