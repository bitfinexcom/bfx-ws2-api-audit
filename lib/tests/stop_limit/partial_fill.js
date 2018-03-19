'use strict'

const assert = require('assert')
const { Order } = require('bitfinex-api-node/lib/models')
const { M_FEE, T_FEE } = require('../../config')
const genOrderUtils = require('../../util/gen_order')
const delayPromise = require('../../util/delay_promise')
const {
  assertNotFilled, assertFullyFilled, assertWalletsUpdated,
  assertPartiallyFilled, assertCanceled
} = require('../../assert/order')

const {
  assertOrderInserted, assertOrderRemoved
} = require('../../assert/orderbook')

const stepCancelAllOrders = require('../../steps/cancel_all_orders')
const stepRefreshSnapshots = require('../../steps/refresh_data_snapshots')

/**
 * Submit a STOP LIMIT sell above the market price, and buy below, and verify
 * they trigger when trades go through at those price levels. Then, check that
 * the associated limit orders have partially filled due to partial matches
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
    submitOrders, genStopBuy, genStopSell, genStopLimitBuy, genStopLimitSell,
    submitOrder, cancelOrder
  } = genOrderUtils(symbol, amount, dataDelay)

  return {
    id: 'stop_limit_partial_fill',
    label: 'submit and verify STOP LIMIT partial fill after triggering via a MARKET/LIMIT pair',
    actors: ['maker', 'taker'],
    before: [
      stepCancelAllOrders(),
      stepRefreshSnapshots()
    ],
    exec: ({ dataM, dataT, wsM, wsT, refreshSnapshots, amount }) => {
      const _mp = dataM.midPrice()
      const midPrice = _mp === 0 ? initialMid : _mp

      // Maker stop-trigger LIMIT orders
      const oSellTriggerM = genLimitSell({ price: midPrice * 1.03 })
      const oBuyTriggerM = genLimitBuy({ price: midPrice * 1.02 })

      // Maker LIMIT orders to partial-fill STOP LIMIT once triggered
      const oSellM = genLimitSell({ price: midPrice * 1.04 })
      const oBuyM = genLimitBuy({ price: midPrice * 1.01 })

      // Taker STOP LIMIT orders
      const oStopBuyT = genStopLimitBuy({
        amount: amount * 2,
        price: oSellTriggerM.price,
        priceAuxLimit: oSellM.price
      })

      const oStopSellT = genStopLimitSell({
        amount: amount * 2,
        price: oBuyTriggerM.price,
        priceAuxLimit: oBuyM.price
      })

      // MARKET orders to trigger stops
      const oMarketBuyT = genMarketBuy()
      const oMarketSellT = genMarketSell()

      // Submit maker orders
      return submitOrders([
        oSellTriggerM,
        oBuyTriggerM,
        oBuyM,
        oSellM
      ], wsM, dataM).then(() => {
        assertNotFilled(oSellTriggerM)
        assertNotFilled(oBuyTriggerM)
        assertNotFilled(oSellM)
        assertNotFilled(oBuyM)
        assertOrderInserted(oSellTriggerM, dataM)
        assertOrderInserted(oBuyTriggerM, dataM)
        assertOrderInserted(oSellM, dataM)
        assertOrderInserted(oBuyM, dataM)

        refreshSnapshots()

        // Submit stop sell
        return submitOrder(oStopSellT, wsT, dataT)
      }).then(() => {
        dataM.updateOrder(oBuyTriggerM)

        assertNotFilled(oStopSellT)
        assertNotFilled(oBuyTriggerM)

        // Submit stop sell trigger
        return submitOrder(oMarketSellT, wsT, dataT)
      }).then(() => {
        dataT.updateOrder(oStopSellT)
        dataM.updateOrder(oBuyTriggerM)
        dataM.updateOrder(oBuyM)

        assertFullyFilled(oMarketSellT)
        assertFullyFilled(oBuyTriggerM)
        assertPartiallyFilled(oStopSellT)
        assertFullyFilled(oBuyM)
        assertWalletsUpdated(oBuyM, dataM, M_FEE)
        assertWalletsUpdated(oBuyTriggerM, dataM, M_FEE)
        assertWalletsUpdated(oMarketSellT, dataT, T_FEE)
        assertWalletsUpdated(oStopSellT, dataT, T_FEE)

        return cancelOrder(oStopSellT, wsT, dataT)
      }).then(() => {
        assertCanceled(oStopSellT)
        refreshSnapshots()

        // Submit stop buy
        return submitOrder(oStopBuyT, wsT, dataT)
      }).then(() => {
        dataM.updateOrder(oSellTriggerM)

        assertNotFilled(oStopBuyT)
        assertNotFilled(oSellTriggerM)

        // Submit stop buy trigger
        return submitOrder(oMarketBuyT, wsT, dataT)
      }).then(() => {
        dataT.updateOrder(oStopBuyT)
        dataM.updateOrder(oSellTriggerM)
        dataM.updateOrder(oSellM)

        assertFullyFilled(oMarketBuyT)
        assertFullyFilled(oSellTriggerM)
        assertPartiallyFilled(oStopBuyT)
        assertFullyFilled(oSellM)
        assertWalletsUpdated(oSellM, dataM, M_FEE)
        assertWalletsUpdated(oSellTriggerM, dataM, M_FEE)
        assertWalletsUpdated(oMarketBuyT, dataT, T_FEE)
        assertWalletsUpdated(oStopBuyT, dataT, T_FEE)
 
        refreshSnapshots()
      })
    }
  }
}
