


const { expect } = require("chai");
const exp = require("constants");
const { BigNumber } = require("ethers");
const { ethers } = require("hardhat");
const {  AMM, toDecimal, User, Token, ZERO_ADDRESS, humanReadable, StateHandler } = require("../shared");

describe("Part 1 tests", function () {


  let pairFactory;
  let swapRouter;
  let erc20Factory;
  let users;
  let signers;
  let admin;
  let amm;
  let token0, token1;

  let initialState = null;

  this.beforeEach(async () => {

    signers = await ethers.getSigners();
    admin = signers[0];
    erc20Factory = await ethers.getContractFactory("Token", admin);


    //Create tokens and pool for tokens
    const tokenAContract = await erc20Factory.deploy("Dollar", "USD");
    const tokenBContract = await erc20Factory.deploy("Ether", "WETH");
    pairFactory = await (await ethers.getContractFactory("UniswapV2Factory")).deploy(admin.address);
    swapRouter = await (await ethers.getContractFactory("UniswapV2Router02")).deploy(pairFactory.address, tokenBContract.address);

    await pairFactory.createPair(tokenAContract.address, tokenBContract.address);
    const pairAddress = await pairFactory.getPair(tokenAContract.address, tokenBContract.address);
    console.log(pairAddress);
    const pair = await ethers.getContractAt("UniswapV2Pair", pairAddress, admin);
    const token0Address = (await pair.token0()).address

    let token0Price = 1;
    let token1Price = 10;
    
    if(token0Address === tokenAContract.address) {
      token0 = new Token({tokenContract: tokenAContract, exchangePrice: token0Price});
      token1 = new Token({tokenContract: tokenBContract, exchangePrice: token1Price});
    } else {
      token1 = new Token({tokenContract: tokenAContract, exchangePrice: token1Price});
      token0 = new Token({tokenContract: tokenBContract, exchangePrice: token0Price});
    }

    amm = new AMM(token0, token1, swapRouter, pair);
    
    token0.tokenContract.connect(admin).transfer(signers[1].address, toDecimal("20000"));
    token1.tokenContract.connect(admin).transfer(signers[1].address, toDecimal("200"));

    token0.tokenContract.connect(admin).transfer(signers[2].address, toDecimal("20000"));
    token1.tokenContract.connect(admin).transfer(signers[2].address, toDecimal("200"));

    
    users = [
      new User("A",signers[1],amm),
      new User("B",signers[2],amm)
    ];

    

    stateHandler = new StateHandler(users, amm, token0, token1);
  });

  it("4.3 Preserve Token Supply", async function () {

    const captureState =  async () => stateHandler.totalSupply();

    let userA = users[0]
    let userB = users[1];


    //Deposit some liquidity 
    let state = await captureState();
    await userA.addLiquidity(toDecimal("20"), toDecimal("20"));
    expect(await captureState()).to.deep.equal(state);


    //Swap tokens 
    state = await captureState();
    await userB.swap(toDecimal("20"), true);
    expect(await captureState()).to.deep.equal(state);

    //Redeem them again
    state = await captureState();
    await userA.removeLiquidity(100);
    expect(await captureState()).to.deep.equal(state);

    



  });
  it("4.4 Preserve reserve ratio", async function () {

    const captureState =  async () => stateHandler.reserveRatio();

    let userA = users[0]
    let userB = users[1];


    //initial liquidity 
    await userA.addLiquidity(toDecimal("200"), toDecimal("200"));
    let state = await captureState();
    


    //Deposit some liquidity 
    await userB.addLiquidity(toDecimal("100"), toDecimal("100"));
    expect(await captureState()).to.deep.equal(state);



    // //Redeem them again
    state = await captureState();
    await userA.removeLiquidity(100); //10%
    expect(await captureState()).to.deep.equal(state);

    



  });
  it("4.5 Preserve redeem ratio", async function () {

    const captureState =  async () => stateHandler.redeemRatio();

    let userA = users[0]
    let userB = users[1];


    //initial liquidity 
    await userA.addLiquidity(toDecimal("200"), toDecimal("200"));
    let state = await captureState();
    


    //Deposit some liquidity 
    await userB.addLiquidity(toDecimal("100"), toDecimal("100"));
    expect(await captureState()).to.deep.equal(state);



    // //Redeem them again
    state = await captureState();
    await userA.removeLiquidity(100); //10%
    expect(await captureState()).to.deep.equal(state);

    



  });
  it("4.6 Preserve reserve networth", async function () {

    const captureState =  async () => stateHandler.netWorth();

    const isStateEqual =  (...args) => stateHandler.netWorthCheck(...args);

    let userA = users[0]
    let userB = users[1];


    //Deposit some inital liquidity 
    let state = await captureState();
    await userA.addLiquidity(toDecimal("20"), toDecimal("20"));
    expect(isStateEqual(await captureState(), state)).is.true

    // //Swap tokens 
    state = await captureState();

    await userB.swap(toDecimal("20"), true);

    expect(isStateEqual(await captureState(), state, true)).is.true

    //Redeem them again
    state = await captureState();
    await userA.removeLiquidity(100);
    expect(isStateEqual(await captureState(), state)).is.true

    



  });



});