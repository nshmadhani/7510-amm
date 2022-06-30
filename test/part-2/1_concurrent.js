


const { expect } = require("chai");
const { ethers } = hre;
const {  AMM, toDecimal, User, Token, ZERO_ADDRESS, humanReadable, StateHandler, takeSnapshot } = require("../shared");

describe("Part 2 - concurrent transacion", function () {


  let pairFactory;
  let swapRouter;
  let erc20Factory;
  let users;
  let signers;
  let admin;
  let amm;
  let token0, token1;

  let initialState = null;


  async function fund(address) {
    await token0.tokenContract.connect(admin).transfer(address, toDecimal("20000"));
    await token1.tokenContract.connect(admin).transfer(address, toDecimal("200"));
  }

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
    
    await fund(signers[1].address);
    await fund(signers[2].address);
     
    users = [

      new User("A",signers[1],amm),
      new User("B",signers[2],amm),
      new User("Admin", signers[0], amm)
    ];

    

    stateHandler = new StateHandler(users, amm, token0, token1);
  });

  it("4.9 Dep->Dep should pass", async function () {

    const captureState = async () => humanReadable(stateHandler.all());

    let userA = users[0]
    let userB = users[1];

    let snapshot = await takeSnapshot();

    await userA.addLiquidity(toDecimal("20"), toDecimal("20"));
    await userB.addLiquidity(toDecimal("200"), toDecimal("200"));
    let endState1 = await captureState();

    //Restore state
    await snapshot.restore();
    

    await userB.addLiquidity(toDecimal("200"), toDecimal("200"));
    await userA.addLiquidity(toDecimal("20"), toDecimal("20"));

    let endState2 = await captureState();
    expect(endState1).to.deep.eq(endState2);



  });

  it("4.9 Dep->Rdm", async function () {

    const captureState = async () => stateHandler.all();

    let userA = users[0]
    let userB = users[1];

    //Initial State
    await userA.addLiquidity(toDecimal("20"), toDecimal("20"));
    let snapshot = await takeSnapshot();

    await userB.addLiquidity(toDecimal("200"), toDecimal("200"));
    await userA.removeLiquidity(100);
    let endState1 = await captureState();


    //Restore the state
    await snapshot.restore();
    
    await userA.removeLiquidity(100);
    await userB.addLiquidity(toDecimal("200"), toDecimal("200"));

    let endState2 = await captureState();
    expect(endState1).to.deep.eq(endState2);




  });

  // it("4.9 Dep->Swap fails", async function () {

  //   const captureState = async () => {
  //     const {_reserve0, _reserve1 } = await amm.pair.getReserves();
  //     const totalSupply = await amm.pair.totalSupply();
  //     return {
  //       ratio: Math.min(_reserve0.div(totalSupply), _reserve1.div(totalSupply)),
  //     }
  //   }

  //   let userA = users[0]
  //   let userB = users[1];


  //   //initial liquidity 
  //   await userA.addLiquidity(toDecimal("200"), toDecimal("200"));
  //   let state = await captureState();
    


  //   //Deposit some liquidity 
  //   await userB.addLiquidity(toDecimal("100"), toDecimal("100"));
  //   expect(await captureState()).to.deep.equal(state);



  //   // //Redeem them again
  //   state = await captureState();
  //   await userA.removeLiquidity(100); //10%
  //   expect(await captureState()).to.deep.equal(state);

    



  // });

  it("4.9 Rdm->Rdm", async function () {

    const captureState = async () => stateHandler.all();

    let userA = users[0]
    let userB = users[1];

    //Initial State
    await userA.addLiquidity(toDecimal("20"), toDecimal("20"));
    await userB.addLiquidity(toDecimal("20"), toDecimal("20"));

    let snapshot = await takeSnapshot();

    await userB.removeLiquidity(100);
    await userA.removeLiquidity(100);
    let endState1 = await captureState();


    //Restore the state
    await snapshot.restore();
    
    await userA.removeLiquidity(100);
    await userB.removeLiquidity(100);


    let endState2 = await captureState();
    expect(endState1).to.deep.eq(endState2);


    



  });

  it("4.9 Rdm->Dep", async function () {

    const captureState = async () => stateHandler.all();

    let userA = users[0]
    let userB = users[1];

    //Initial State
    await userA.addLiquidity(toDecimal("20"), toDecimal("20"));
    let snapshot = await takeSnapshot();

    await userA.removeLiquidity(100);
    await userB.addLiquidity(toDecimal("200"), toDecimal("200"));
    let endState1 = await captureState();


    //Restore the state
    await snapshot.restore();


    await userB.addLiquidity(toDecimal("200"), toDecimal("200"));    
    await userA.removeLiquidity(100);

    let endState2 = await captureState();
    expect(endState1).to.deep.eq(endState2);




  });

  // it("4.9 Rdm->Swap", async function () {

  //   const captureState = async () => {
      
  //     let globalNetworth = BigNumber.from(0);
  //     let userWorth = [];
  //     for(let user of users) {
  //       let x = await user.netWorth();
  //       userWorth.push(x.totalWorth);
  //       globalNetworth = globalNetworth.add(x.totalWorth);
  //     }

  //     return {
  //       userWorth,globalNetworth
  //     }
  //   }

  //   const isStateEqual = (state0, state1, onlyGlobal) => {
  //     if(state0.globalNetworth.eq(state1.globalNetworth)) {
  //       if(onlyGlobal) return true;
  //       for (let index = 0; index < state0.userWorth.length; index++) {
  //         if(!state0.userWorth[index].eq(state1.userWorth[index])) {
  //           return false; 
  //         }
  //       }
  //       return true;
  //     }
  //     return false;
  //   }

  //   let userA = users[0]
  //   let userB = users[1];


  //   //Deposit some inital liquidity 
  //   let state = await captureState();
  //   await userA.addLiquidity(toDecimal("20"), toDecimal("20"));
  //   expect(isStateEqual(await captureState(), state)).is.true

  //   // //Swap tokens 
  //   state = await captureState();

  //   await userB.swap(toDecimal("20"), true);

  //   expect(isStateEqual(await captureState(), state, true)).is.true

  //   //Redeem them again
  //   state = await captureState();
  //   await userA.removeLiquidity(100);
  //   expect(isStateEqual(await captureState(), state)).is.true

    



  // });



});