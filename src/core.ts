import { Address, Bytes } from "@graphprotocol/graph-ts";
import {
    Create,
    BufferBinaryOptions
} from "../generated/BufferBinaryOptions/BufferBinaryOptions";
import {
    _loadOrCreateOptionContractEntity,
    _loadOrCreateOptionDataEntity,
    _loadOrCreateQueuedOptionEntity,
    _loadOrCreateUserEntity
} from "./initialize";
import { BufferRouter } from "../generated/BufferRouter/BufferRouter";
import { log, ipfs, json, JSONValue } from "@graphprotocol/graph-ts";
import { NFT } from "../generated/schema";

import { RouterAddress, BFR, USDC, ARB_TOKEN_ADDRESS } from "./config";

export function _handleCreate(event: Create): void {
    let routerContract = BufferRouter.bind(Address.fromString(RouterAddress));
    if (routerContract.contractRegistry(event.address) == true) {
        let optionID = event.params.id;
        let contractAddress = event.address;
        let optionContractInstance = BufferBinaryOptions.bind(contractAddress);
        let optionData = optionContractInstance.options(optionID);
        let tokenReferrenceID = "";
        if (optionContractInstance.tokenX() == Address.fromString(USDC)) {
            tokenReferrenceID = "USDC";
        } else if (optionContractInstance.tokenX() == Address.fromString(ARB_TOKEN_ADDRESS)) {
            tokenReferrenceID = "ARB";
        }
        let userOptionData = _loadOrCreateOptionDataEntity(
            optionID,
            contractAddress
        );
        _loadOrCreateUserEntity(event.params.account);
        userOptionData.user = event.params.account;
        userOptionData.totalFee = event.params.totalFee;
        userOptionData.state = optionData.value0;
        userOptionData.strike = optionData.value1;
        userOptionData.amount = optionData.value2;
        userOptionData.expirationTime = optionData.value5;
        userOptionData.isAbove = optionData.value6 ? true : false;
        userOptionData.creationTime = optionData.value8;
        userOptionData.settlementFee = event.params.settlementFee;
        userOptionData.depositToken = tokenReferrenceID;
        userOptionData.save();
    }
}

export function _getMetaData(ipfs_json: Bytes): string[] {
    let nftImage = "";
    let nftTier = "";
    const value = json.fromBytes(ipfs_json).toObject();
    if (value) {
        const image = value.get("image");
        if (image) {
            nftImage = image.toString();
        }
        let attributes: JSONValue[];
        let _attributes = value.get("attributes");
        if (_attributes) {
            attributes = _attributes.toArray();

            for (let i = 0; i < attributes.length; i++) {
                let item = attributes[i].toObject();
                let trait: string;
                let traitName = item.get("trait_type");
                if (traitName) {
                    trait = traitName.toString();
                    let value: string;
                    let traitValue = item.get("value");
                    if (traitValue) {
                        value = traitValue.toString();
                        if (trait == "tier") {
                            nftTier = value;
                        }
                    }
                }
            }
        }
    }
    return [nftImage, nftTier];
}

export function _updateNFTMetadata(nft: NFT, tokenUri: string): void {
    let ipfs_json = ipfs.cat(tokenUri.replace("ipfs://", ""));
    if (ipfs_json) {
        let metadata = _getMetaData(ipfs_json);
        nft.nftImage = metadata[0];
        nft.tier = metadata[1];
        nft.ipfs = tokenUri;
        nft.save();
    } else {
        _updateNFTMetadata(nft, tokenUri);
    }
}
