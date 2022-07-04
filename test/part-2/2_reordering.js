


const { expect } = require("chai");
const { ethers } = hre;
const {  AMM, toDecimal, User, Token,  humanReadable, StateHandler, takeSnapshot } = require("../shared");

describe("Part 2 - reordering, addivity, reversibility", function () {


  let pairFactory;
  let swapRouter;
  let erc20Factory;
  let users;
  let signers;
  let admin;
  let amm;
  let token0, token1;



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

  it("4.10 Dep->rdm->Dep->rdm == Dep->Dep->rdm->rdm", async function () {

    const captureState = async () => stateHandler.all();

    let userA = users[0]
    let userB = users[1];

    let snapshot = await takeSnapshot();

    await userA.addLiquidity(toDecimal("20"), toDecimal("20"));
    await userA.removeLiquidity(100);
    await userB.addLiquidity(toDecimal("200"), toDecimal("200"));
    await userB.removeLiquidity(100);

    let endState1 = await captureState();

    //Restore state
    await snapshot.restore();
    


    await userA.addLiquidity(toDecimal("20"), toDecimal("20"));
    await userB.addLiquidity(toDecimal("200"), toDecimal("200"));
    await userB.removeLiquidity(100);
    await userA.removeLiquidity(100);


    let endState2 = await captureState();
    expect(endState1).to.deep.eq(endState2);



  });

  it("4.11 Dep1->Dep2 == Dep1+Dep2", async function () {

    const captureState = async () => stateHandler.all();

    let userA = users[0]
    let userB = users[1];

    let snapshot = await takeSnapshot();

    await userA.addLiquidity(toDecimal("20"), toDecimal("20"));
    await userA.addLiquidity(toDecimal("100"), toDecimal("100"));

    let endState1 = await captureState();

    //Restore state
    await snapshot.restore();
    


    await userA.addLiquidity(toDecimal("120"), toDecimal("120"));


    let endState2 = await captureState();
    expect(endState1).to.deep.eq(endState2);



  });

  it("4.11 Rdm1->Rdm2 == Rdm1+Rdm2", async function () {

    const captureState = async () => stateHandler.all();

    let userA = users[0]
    let userB = users[1];

    await userA.addLiquidity(toDecimal("200"), toDecimal("200"));
    let snapshot = await takeSnapshot();

    await userA.removeLiquidity(25);//25%
    await userA.removeLiquidity(50);//50%

    let endState1 = await captureState();

    //Restore state
    await snapshot.restore();
    
    await userA.removeLiquidity(75);//25%

    let endState2 = await captureState();
    expect(endState1).to.deep.eq(endState2);



  });

  it("4.14 Dep<->Rdm", async function () {

    const captureState = async () => stateHandler.all();

    let userA = users[0]


    let state1 = await captureState();

    //Deposit then redeem it back

    await userA.addLiquidity(toDecimal("75"), toDecimal("75"));
    await userA.removeLiquidity(100);
    expect(state1).to.deep.eq(await captureState());


    //Redeem then deposit again
    
    //Setup condition
    await userA.addLiquidity(toDecimal("100"), toDecimal("100"));
    let state2 = await captureState();

    await userA.removeLiquidity(50);
    await userA.addLiquidity(toDecimal("50"), toDecimal("50"));

    expect(state2).to.deep.eq(await captureState());



  });





});