const { Contract, BigNumber } = require("ethers");
const { ethers } = require( "hardhat");


const { abi } = require("../../artifacts/contracts/Token.sol/Token.json");

const MAX_DEADLINE = 1755605995;






class Token  {
    constructor({tokenContract ,exchangePrice}) {
        this.tokenContract = tokenContract;
        this.exchangePrice = exchangePrice;
    }
    //deploy token on it downs
}


 class AMM {
    constructor(token0, token1, swapRouter, pair) {
        this.token0 = token0;
        this.token1 = token1;
        this.swapRouter = swapRouter;
        this.pair = pair;
    }

}

 class User {
    constructor(alias, signer, amm) {
        this.alias = alias;
        this.singer = signer;
        this.amm = amm;
    }

    //deposit some liquidity
    async addLiquidity(amountA, amountB) {
        await this.amm.token0.tokenContract.connect(this.singer).approve(this.amm.swapRouter.address, amountA);
        await this.amm.token1.tokenContract.connect(this.singer).approve(this.amm.swapRouter.address, amountB);

        return await this.amm.swapRouter.connect(this.singer).addLiquidity(
            this.amm.token0.tokenContract.address,
            this.amm.token1.tokenContract.address,
            amountA,
            amountB,
            amountA,
            amountB,
            this.singer.address,
            MAX_DEADLINE
        );
    }

    //swap for x amount 
    async swap(amountA, token0ToToken1) {
        if(token0ToToken1) {
            await this.amm.token0.tokenContract.connect(this.singer).approve(this.amm.swapRouter.address, amountA);
        } else 
            await this.amm.token1.tokenContract.connect(this.singer).approve(this.amm.swapRouter.address, amountA);
        
        return await this.amm.swapRouter.connect(this.singer).swapExactTokensForTokens(
            amountA,
            0,
            token0ToToken1 ? [this.amm.token0.tokenContract.address, this.amm.token1.tokenContract.address] : [this.amm.token1.tokenContract.address, this.amm.token0.tokenContract.address],
            this.singer.address,
            MAX_DEADLINE
        );
    }

    //redeem his liquidity
    async removeLiquidity(ratio) {
        let balance = await this.amm.pair.balanceOf(this.singer.address);
        balance = balance.mul(ratio).div(100);

        await this.amm.pair.connect(this.singer).approve(this.amm.swapRouter.address, balance);
        
        return await this.amm.swapRouter.connect(this.singer).removeLiquidity(
            this.amm.token0.tokenContract.address,
            this.amm.token1.tokenContract.address,
            balance,
            0,
            0,
            this.singer.address,
            MAX_DEADLINE
        );
    }

    async netWorthUtil(address) {
        const bal1 = await this.amm.token0.tokenContract.balanceOf(address);
        const bal2 = await this.amm.token1.tokenContract.balanceOf(address);
        const bal3 = await this.amm.pair.balanceOf(address);

        const totalSupply = await this.amm.pair.totalSupply();

        let token0Worth, token1Worth, lpWorth = BigNumber.from(0), totalWorth;

        token0Worth = bal1.mul(this.amm.token0.exchangePrice);
        token1Worth = bal2.mul(this.amm.token1.exchangePrice);
        totalWorth  = token1Worth.add(token0Worth);

        if(!totalSupply.eq(BigNumber.from(0))) {
            const {token0Share, token1Share} = await this.getReserveShares(address);
            lpWorth = token0Share.mul(this.amm.token0.exchangePrice).add(token1Share.mul(this.amm.token1.exchangePrice));
            totalWorth = totalWorth.add(lpWorth);
        }

        return {
            token0Worth,
            token1Worth,
            totalWorth,
            lpWorth,
        }

    }

    async getReserveShares(address) {
        const bal3 = await this.amm.pair.balanceOf(address);
        const {_reserve0, _reserve1} = await this.amm.pair.getReserves();
        const totalSupply = await this.amm.pair.totalSupply();
        if(totalSupply.eq(0)) {
            return {
                token0Share:BigNumber.from(0),
                token1Share: BigNumber.from(0)
            }
        }
        return {
            token0Share:bal3.mul(_reserve1).div(totalSupply),
            token1Share:bal3.mul(_reserve0).div(totalSupply)
        }
    }

    async state() {
        return  {
            token0: await this.amm.token0.tokenContract.balanceOf(this.singer.address),
            token1: await this.amm.token1.tokenContract.balanceOf(this.singer.address),
            lp: await this.amm.pair.balanceOf(this.singer.address),
            ...await this.getReserveShares(this.singer.address)
        }
    }

    //net worth
    async netWorth() {
        return await this.netWorthUtil(this.singer.address)
    }

    async print() {
        const state = humanReadable(await this.state());
        const netWorth = humanReadable(await this.netWorth());
        console.log({
            ...state,
            ...netWorth
        });
    }
}

 class Transaction {
    constructor(action, user, initialState, newState) {
        this.action = action; //dep, swap, rdm
        this.user = user;
        this.initialState = initialState;
        this.newState = newState;
    }

    async finish(args) {
        if(action == "rdm") {
            await this.user.redeem(...args);
            this.newState = captureState();
        }
    }
}


 class StateHandler {
    constructor(users, amm, token0, token1) {
        this.users = users;
        this.amm = amm;
        this.token0 = token0;
        this.token1 = token1;
    }

    async totalSupply() {
        return {
          token0Supply: await this.token0.tokenContract.totalSupply(),
          token1Supply: await this.token1.tokenContract.totalSupply()
        }
    }

    async reserveRatio()  {
        const {_reserve0, _reserve1 } = await this.amm.pair.getReserves();
        if(_reserve1.eq(0) || _reserve0.eq(0)) return  {
            ratio:BigNumber.from(0)
        }
        return {
          reserveRatio: _reserve0.div(_reserve1),
        }
    }

    async redeemRatio()  {
        const {_reserve0, _reserve1 } = await this.amm.pair.getReserves();
        const totalSupply = await this.amm.pair.totalSupply();
        if(totalSupply.eq(0)) return  {
            ratio:totalSupply
        }
        return {
          redeemRatio: Math.min(_reserve0.div(totalSupply), _reserve1.div(totalSupply)),
        }
    }

    async netWorth() {
      
        let globalNetworth = BigNumber.from(0);
        let userWorth = [];
        for(let user of this.users) {
          let x = await user.netWorth();
          userWorth.push(x.totalWorth);
          globalNetworth = globalNetworth.add(x.totalWorth);
        }
  
        return {
          userWorth,globalNetworth
        }
    }

    async all() {
        return {
            ... await this.netWorth(),
            ... await this.redeemRatio(),
            ... await this.reserveRatio(),
            ... await this.totalSupply(),
        }
    }


    netWorthCheck(state0, state1, onlyGlobal) {
        if(state0.globalNetworth.eq(state1.globalNetworth)) {
          if(onlyGlobal) return true;
          for (let index = 0; index < state0.userWorth.length; index++) {
            if(!state0.userWorth[index].eq(state1.userWorth[index])) {
              return false; 
            }
          }
          return true;
        }
        return false;
      }



}


 function toDecimal(n) {
    return ethers.utils.parseUnits(n);
}

 function fromDecimal(n) {
    return ethers.utils.formatUnits(n);
}

function humanReadable(spy) {
    Object.keys(spy).forEach(function(key){ spy[key] = fromDecimal(spy[key].toString()) });
    return spy;      
}
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

async function takeSnapshot() {
    const provider = hre.network.provider;
  
    let snapshotId = await provider.request({
      method: "evm_snapshot",
    });
  
    return {
      restore: async () => {
        const reverted = await provider.request({
          method: "evm_revert",
          params: [snapshotId],
        });
        // re-take the snapshot so that `restore` can be called again
        snapshotId = await provider.request({
          method: "evm_snapshot",
        });
      },
    };
  }

module.exports = {
    Token,
    AMM,
    User,
    StateHandler,
    Transaction,
    toDecimal,
    fromDecimal,
    ZERO_ADDRESS,
    humanReadable,
    takeSnapshot
} 