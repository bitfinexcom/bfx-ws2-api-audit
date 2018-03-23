'use strict'

const assert = require('assert')
const { Order } = require('bitfinex-api-node/lib/models')
const { M_FEE, T_FEE } = require('../../config')
const genOrderUtils = require('../../util/gen_order')
const delayPromise = require('../../util/delay_promise')
const {
  assertNotFilled, assertFullyFilled, assertWalletsUpdated,
  assertPartiallyFilled
} = require('../../assert/order')

const {
  assertOrderInserted, assertOrderRemoved
} = require('../../assert/orderbook')

const stepCancelAllOrders = require('../../steps/cancel_all_orders')
const stepRefreshSnapshots = require('../../steps/refresh_data_snapshots')

/**
 * Submit a STOP LIMIT sell above the market price, and buy below, and verify
 * they trigger when trades go through at those price levels, and the proper
 * LIMIT order is inserted into the OB
 *
 * @param {Object} args
 * @param {string} args.symbol
 * @param {number} args.amount
 * @param {number} args.initialMid - used as the LIMIT price if the OB is empty
 * @param {number?} args.dataDelay - ms to wait after submit before continuing
 * @return {Object} step
 */
module.exports = ({ symbol, amount, initialMid, dataDelay }) => {
  const {
    genBuy, genMarketBuy, genLimitBuy, genSell, genLimitSell, genMarketSell,
    submitOrder, genStopBuy, genStopSell, genStopLimitBuy, genStopLimitSell
  } = genOrderUtils(symbol, amount, dataDelay)

  return {
    id: 'stop_limit_market_trigger',
    label: 'submit and verify STOP LIMIT orders after triggering via a MARKET/LIMIT pair',
    actors: ['maker', 'taker'],
    before: [
      stepCancelAllOrders(),
      stepRefreshSnapshots()
    ],
    exec: ({ dataM, dataT, wsM, wsT, refreshSnapshots, amount }) => {
      const _mp = dataM.midPrice(symbol)
      const midPrice = _mp === 0 ? initialMid : _mp

      const buyLimitPrice = midPrice * 0.8
      const sellLimitPrice = midPrice * 1.2

      // Maker LIMIT orders
      const oSellM = genLimitSell({
        price: midPrice * 1.003,
        amount: amount * 2
      })

      const oBuyM = genLimitBuy({
        price: midPrice * 1.002,
        amount: amount * 2
      })

      // Taker STOP LIMIT orders
      const oStopBuyT = genStopLimitBuy({
        price: oSellM.price,
        priceAuxLimit: buyLimitPrice
      })

      const oStopSellT = genStopLimitSell({
        price: oBuyM.price,
        priceAuxLimit: sellLimitPrice
      })

      // MARKET orders to trigger stops
      const oMarketBuyT = genMarketBuy()
      const oMarketSellT = genMarketSell()

      // Submit maker orders
      return submitOrder(oSellM, wsM, dataM).then(() => {
        return submitOrder(oBuyM, wsM, dataM)
      }).then(() => {
        dataM.updateOrder(oSellM)

        assertNotFilled(oSellM)
        assertNotFilled(oBuyM)
        assertOrderInserted(oSellM, dataM)
        assertOrderInserted(oBuyM, dataM)

        refreshSnapshots()

        // Submit stop sell
        return submitOrder(oStopSellT, wsT, dataT)
      }).then(() => {
        dataM.updateOrder(oBuyM)

        assertNotFilled(oStopSellT)
        assertNotFilled(oBuyM)

        // Submit stop sell trigger
        return submitOrder(oMarketSellT, wsT, dataT)
      }).then(() => {
        dataM.updateOrder(oBuyM)
        dataT.updateOrder(oStopSellT)

        assertFullyFilled(oMarketSellT)
        assertNotFilled(oStopSellT)
        assertPartiallyFilled(oBuyM)
        assertWalletsUpdated(oBuyM, dataM, M_FEE)
        assertWalletsUpdated(oMarketSellT, dataT, T_FEE)
        assertOrderInserted({
          price: oStopSellT.priceAuxLimit,
          amountOrig: oStopSellT.amount
        }, dataT)

        refreshSnapshots()

        // Submit stop buy
        return submitOrder(oStopBuyT, wsT, dataT)
      }).then(() => {
        dataM.updateOrder(oSellM)

        assertNotFilled(oStopBuyT)
        assertNotFilled(oSellM)

        // Submit stop buy trigger
        return submitOrder(oMarketBuyT, wsT, dataT)
      }).then(() => {
        dataM.updateOrder(oSellM)
        dataT.updateOrder(oStopBuyT)

        assertFullyFilled(oMarketBuyT)
        assertNotFilled(oStopBuyT)
        assertPartiallyFilled(oSellM)
        assertWalletsUpdated(oSellM, dataM, M_FEE)
        assertWalletsUpdated(oMarketBuyT, dataT, T_FEE)
        assertOrderInserted({
          price: oStopBuyT.priceAuxLimit,
          amountOrig: oStopBuyT.amount
        }, dataT)
 
        refreshSnapshots()
      })
    }
  }
}
