// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "./OptionConfigBinaryV2.sol";
import "../Interfaces/InterfacesBinary.sol";

/**
 * @author Heisenberg
 * @title Buffer Options
 */
contract BufferBinaryEuropeanATMOptions is
    IBufferBinaryOptions,
    Ownable,
    ReentrancyGuard,
    ERC721,
    AccessControl,
    ERC721URIStorage
{
    uint256 public nextTokenId = 0;
    uint256 public totalLockedAmount;
    bool public isPaused;
    uint256 public assetCategoryBaseDiscountForAbove;
    uint256 public assetCategoryBaseDiscountForBelow;
    uint256 public stepSize = 250; // Factor of e2

    ILiquidityPool public pool;
    OptionConfigBinaryV2 public config;
    IReferralStorage public referral;
    AssetCategory public assetCategory;
    ERC20 public override tokenX;

    mapping(uint256 => Option) public options;
    mapping(address => uint256[]) public userOptionIds;
    mapping(uint256 => uint256) public NFTTierToStep;

    bytes32 public constant ROUTER_ROLE = keccak256("ROUTER_ROLE");
    bytes32 public constant BOT_ROLE = keccak256("BOT_ROLE");

    /************************************************
     *  INITIALIZATION FUNCTIONS
     ***********************************************/

    constructor(
        ERC20 _tokenX,
        ILiquidityPool _pool,
        OptionConfigBinaryV2 _config,
        IReferralStorage _referral,
        AssetCategory _category
    ) ERC721("Buffer", "BFR") {
        tokenX = _tokenX;
        pool = _pool;
        config = _config;
        referral = _referral;
        assetCategory = _category; // Percent with a factor of e2
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function initialize(
        uint256 _assetCategoryBaseDiscountForAbove,
        uint256 _assetCategoryBaseDiscountForBelow
    ) external onlyOwner {
        require(10e2 <= _assetCategoryBaseDiscountForAbove, "O27");
        require(_assetCategoryBaseDiscountForAbove <= 25e2, "O28");
        require(10e2 <= _assetCategoryBaseDiscountForBelow, "O27");
        require(_assetCategoryBaseDiscountForBelow <= 25e2, "O28");
        assetCategoryBaseDiscountForAbove = _assetCategoryBaseDiscountForAbove;
        assetCategoryBaseDiscountForBelow = _assetCategoryBaseDiscountForBelow;
        NFTTierToStep[0] = 0;
        NFTTierToStep[1] = 1;
        NFTTierToStep[2] = 2;
        NFTTierToStep[3] = 3;
    }

    function approvePoolToTransferTokenX() public {
        tokenX.approve(address(pool), ~uint256(0));
    }

    function approveSFDContractToTransferTokenX() public {
        tokenX.approve(config.settlementFeeDisbursalContract(), ~uint256(0));
    }

    function toggleCreation() public onlyOwner {
        isPaused = !isPaused;
        emit Pause(isPaused);
    }

    /************************************************
     *  ROUTER ONLY FUNCTIONS
     ***********************************************/

    function createFromRouter(
        address user,
        uint256 totalFee,
        uint256 period,
        bool isAbove,
        uint256 strike,
        uint256 amount,
        string memory referralCode
    ) external override onlyRole(ROUTER_ROLE) returns (uint256 optionID) {
        Option memory option = Option(
            State.Active,
            strike,
            amount,
            amount,
            amount / 2,
            block.timestamp + period,
            isAbove,
            totalFee,
            block.timestamp
        );
        totalLockedAmount += amount;
        optionID = _generateTokenId();
        userOptionIds[user].push(optionID);
        options[optionID] = option;

        _mint(user, optionID);
        address referrer = referral.codeOwners(referralCode);

        uint256 referrerFee = _processReferralRebate(
            referrer,
            user,
            totalFee,
            amount,
            referralCode,
            isAbove
        );
        uint256 settlementFee = totalFee - option.premium - referrerFee;
        ISettlementFeeDisbursal(config.settlementFeeDisbursalContract())
            .distributeSettlementFee(settlementFee);
        pool.lock(optionID, option.lockedAmount, option.premium);
        emit Create(optionID, user, settlementFee, totalFee);
    }

    /**
     * @notice Unlocks the locked funds if the option was
     * OTM at the time of expiry otherwise exercises it
     * @param optionID ID of the option
     * @param priceAtExpiration Price at expiration timestamp
     */
    function unlock(uint256 optionID, uint256 priceAtExpiration)
        external
        onlyRole(ROUTER_ROLE)
    {
        require(_exists(optionID), "O10");
        Option storage option = options[optionID];
        require(option.expiration <= block.timestamp, "O4");
        require(option.state == State.Active, "O5");

        if (
            (option.isAbove && priceAtExpiration > option.strike) ||
            (!option.isAbove && priceAtExpiration < option.strike)
        ) {
            _exercise(optionID, priceAtExpiration);
        } else {
            option.state = State.Expired;
            pool.unlock(optionID);
            _burn(optionID);
            emit Expire(optionID, option.premium, priceAtExpiration);
        }
        totalLockedAmount -= option.lockedAmount;
    }

    /************************************************
     *  READ ONLY FUNCTIONS
     ***********************************************/

    function userOptionCount(address user) public view returns (uint256) {
        return userOptionIds[user].length;
    }

    function decimals() public view returns (uint256) {
        return tokenX.decimals();
    }

    function fees(
        uint256 amount,
        address user,
        bool isAbove,
        string memory referralCode
    )
        public
        view
        returns (
            uint256 total,
            uint256 settlementFee,
            uint256 premium
        )
    {
        uint256 settlementFeePercentage = _getSettlementFeePercentage(
            referral.codeOwners(referralCode),
            user,
            _getAssetCategoryBaseDiscount(isAbove)
        );
        (total, settlementFee, premium) = _fees(
            amount,
            settlementFeePercentage
        );
    }

    function isStrikeValid(
        uint256 slippage,
        uint256 strike,
        uint256 expectedStrike
    ) external pure override returns (bool) {
        if (
            (strike <= (expectedStrike * (1e4 + slippage)) / 1e4) &&
            (strike >= (expectedStrike * (1e4 - slippage)) / 1e4)
        ) {
            return true;
        } else return false;
    }

    function isInCreationWindow(uint256 period) public view returns (bool) {
        uint256 currentTime = block.timestamp;
        uint256 currentDay = ((currentTime / 86400) + 4) % 7;
        uint256 expirationDay = (((currentTime + period) / 86400) + 4) % 7;

        if (currentDay == expirationDay) {
            uint256 currentHour = (currentTime / 3600) % 24;
            uint256 currentMinute = (currentTime % 3600) / 60;
            uint256 expirationHour = ((currentTime + period) / 3600) % 24;
            uint256 expirationMinute = ((currentTime + period) % 3600) / 60;
            (
                uint256 startHour,
                uint256 startMinute,
                uint256 endHour,
                uint256 endMinute
            ) = config.marketTimes(currentDay);

            if (
                (currentHour > startHour ||
                    (currentHour == startHour &&
                        currentMinute >= startMinute)) &&
                (currentHour < endHour ||
                    (currentHour == endHour && currentMinute < endMinute)) &&
                (expirationHour < endHour ||
                    (expirationHour == endHour && expirationMinute < endMinute))
            ) {
                return true;
            }
        }
        return false;
    }

    function runInitialChecks(
        uint256 slippage,
        uint256 period,
        uint256 totalFee
    ) external view override {
        require(!isPaused, "Market is closed");
        require(slippage <= 5e2, "Wrong slippage"); // 5% is the max slippage a user can use
        require((period) >= 5 minutes, "O21");
        require((period) <= config.maxPeriod(), "O24");
        require(totalFee >= config.minFee() * 10**decimals(), "Fee too low");
    }

    function getMaxAmount() public view returns (uint256 maxAmount) {
        // --------- Calculate the max option size due to asset wise pool utilization limit
        uint256 totalPoolBalance = pool.totalTokenXBalance();
        uint256 availableBalance = totalPoolBalance - totalLockedAmount;
        require(
            availableBalance >
                (((1e4 - config.assetUtilizationLimit()) * totalPoolBalance) /
                    1e4),
            "Asset utilization too high"
        );
        uint256 maxAssetWiseUtilizationAmount = availableBalance -
            (((1e4 - config.assetUtilizationLimit()) * totalPoolBalance) / 1e4);

        // --------- Calculate the max option size due to overall pool utilization limit
        availableBalance = pool.availableBalance();
        require(
            availableBalance >
                (((1e4 - config.overallPoolUtilizationLimit()) *
                    totalPoolBalance) / 1e4),
            "Pool utilization too high"
        );
        uint256 maxUtilizationAmount = availableBalance -
            (((1e4 - config.overallPoolUtilizationLimit()) * totalPoolBalance) /
                1e4);

        // Take the min of the above 2 values
        maxAmount = min(maxUtilizationAmount, maxAssetWiseUtilizationAmount);
    }

    function _getAssetCategoryBaseDiscount(bool isAbove)
        internal
        view
        returns (uint256 assetCategoryBaseDiscount)
    {
        assetCategoryBaseDiscount = isAbove
            ? assetCategoryBaseDiscountForAbove
            : assetCategoryBaseDiscountForBelow;
    }

    function checkParams(
        uint256 totalFee,
        bool allowPartialFill,
        string memory referralCode,
        address user,
        uint256 period,
        bool isAbove
    ) external view override returns (uint256 amount, uint256 revisedFee) {
        require(
            assetCategory != AssetCategory.Forex || isInCreationWindow(period),
            "Creation isn't allowed in this time window"
        );

        uint256 maxAmount = getMaxAmount();

        // --------- Calculate the max fee due to the max txn limit
        uint256 maxPerTxnFee = ((pool.availableBalance() *
            config.optionFeePerTxnLimitPercent()) / 100e2);
        uint256 newFee = min(totalFee, maxPerTxnFee);

        // --------- Calculate the amount here from the new fees
        uint256 settlementFeePercentage = _getSettlementFeePercentage(
            referral.codeOwners(referralCode),
            user,
            _getAssetCategoryBaseDiscount(isAbove)
        );
        (uint256 unitFee, , ) = _fees(10**decimals(), settlementFeePercentage);
        amount = (newFee * 10**decimals()) / unitFee;

        // --------- Recalculate the amount and the fees if values are greater than the max and partial fill is allowed
        if (amount > maxAmount || newFee < totalFee) {
            require(allowPartialFill, "Partial fill disabled");
            amount = min(amount, maxAmount);
            (revisedFee, , ) = _fees(amount, settlementFeePercentage);
        } else {
            revisedFee = totalFee;
        }
    }

    /************************************************
     * ERC721 FUNCTIONS
     ***********************************************/

    function _generateTokenId() internal returns (uint256) {
        return nextTokenId++;
    }

    function _baseURI() internal pure override returns (string memory) {
        return "https://gateway.pinata.cloud/ipfs/";
    }

    function _burn(uint256 optionId_)
        internal
        override(ERC721, ERC721URIStorage)
    {
        super._burn(optionId_);
    }

    function _setTokenURI(uint256 tokenId, string memory _tokenURI)
        internal
        override
    {
        return super._setTokenURI(tokenId, _tokenURI);
    }

    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function burn(uint256 tokenId_) external {
        require(msg.sender == ownerOf(tokenId_), "O9");
        _burn(tokenId_);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    /************************************************
     *  INTERNAL OPTION UTILITY FUNCTIONS
     ***********************************************/

    function _fees(uint256 amount, uint256 settlementFeePercentage)
        internal
        pure
        returns (
            uint256 total,
            uint256 settlementFee,
            uint256 premium
        )
    {
        // Probability for ATM options will always be 0.5 due to which we can skip using BSM
        premium = amount / 2;
        settlementFee = (amount * settlementFeePercentage) / 1e4;
        total = settlementFee + premium;
    }

    /**
     * @notice Exercises an option if it was
     * ITM at the time of expiry
     * @param optionID ID of your option
     * @param priceAtExpiration Price at expiration timestamp
     * @return profit Profit sent to the user
     */
    function _exercise(uint256 optionID, uint256 priceAtExpiration)
        internal
        returns (uint256 profit)
    {
        Option storage option = options[optionID];

        profit = option.lockedAmount;
        pool.send(optionID, ownerOf(optionID), profit);

        // Burn the option
        _burn(optionID);
        option.state = State.Exercised;
        emit Exercise(optionID, profit, priceAtExpiration);
    }

    function _processReferralRebate(
        address referrer,
        address user,
        uint256 totalFee,
        uint256 amount,
        string memory referralCode,
        bool isAbove
    ) internal returns (uint256 referrerFee) {
        if (referrer != user && referrer != owner() && referrer != address(0)) {
            referrerFee =
                (totalFee *
                    referral.ReferrerTierToDiscount(
                        referral.ReferrerToTier(referrer)
                    )) /
                1e4;
            tokenX.transfer(referrer, referrerFee);
            referral.setReferrerReferralData(referrer, totalFee, referrerFee);

            (bool isReferralValid, ) = _isReferralValid(referrer, user);
            if (isReferralValid) {
                (uint256 formerUnitFee, , ) = _fees(
                    10**decimals(),
                    _getAssetCategoryBaseDiscount(isAbove)
                );
                referral.setUserReferralData(
                    user,
                    totalFee,
                    ((formerUnitFee * amount) - totalFee),
                    referralCode
                );
            }
        }
    }

    function _isReferralValid(address referrer, address user)
        internal
        view
        returns (bool isReferralValid, uint256 maxStep)
    {
        if (config.traderNFTContract() != address(0)) {
            maxStep = NFTTierToStep[
                ITraderNFT(config.traderNFTContract()).userToTier(user)
            ];
        }
        if (referrer != user && referrer != owner() && referrer != address(0)) {
            uint256 step = referral.ReferrerTierToStep(
                referral.ReferrerToTier(referrer)
            );
            if (step > maxStep) {
                maxStep = step;
                isReferralValid = true;
            }
        }
    }

    function _getSettlementFeePercentage(
        address referrer,
        address user,
        uint256 assetCategoryBaseDiscount
    ) internal view returns (uint256 settlementFeePercentage) {
        settlementFeePercentage = assetCategoryBaseDiscount;
        (bool isReferralValid, uint256 maxStep) = _isReferralValid(
            referrer,
            user
        );
        settlementFeePercentage =
            settlementFeePercentage -
            (stepSize * maxStep);
    }
}
