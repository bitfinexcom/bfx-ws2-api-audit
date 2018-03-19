'use strict'

const assert = require('assert')
const { Order } = require('bitfinex-api-node/lib/models')
const { M_FEE, T_FEE } = require('../../config')
const genOrderUtils = require('../../util/gen_order')
const delayPromise = require('../../util/delay_promise')
const {
  assertNotFilled, assertFullyFilled, assertWalletsUpdated
} = require('../../assert/order')

const {
  assertOrderInserted, assertOrderRemoved, assertOrderNotRemoved,
  assertOrderNotInserted
} = require('../../assert/orderbook')

const stepCancelAllOrders = require('../../steps/cancel_all_orders')
const stepRefreshSnapshots = require('../../steps/refresh_data_snapshots')

/**
 * Submit a pair of STOP LIMIT orders beyond the market prices, and verify they
 * don't immediately trigger, and no LIMIT order is inserted.
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
    submitOrder, genStopLimitBuy, genStopLimitSell
  } = genOrderUtils(symbol, amount, dataDelay)

  return {
    id: 'stop_no_immediate_trigger',
    label: 'submit a STOP LIMIT order below/above the trigger, and verify no exec',
    actors: ['maker', 'taker'],
    before: [
      stepCancelAllOrders(),
      stepRefreshSnapshots()
    ],
    exec: ({ dataM, dataT, wsM, wsT, refreshSnapshots, amount }) => {
      const _mp = dataM.midPrice()
      const midPrice = _mp === 0 ? initialMid : _mp

      // Maker LIMIT orders, to ensure OB is populated
      const oSellM = genLimitSell({ price: midPrice * 1.002 })
      const oBuyM = genLimitBuy({ price: midPrice * 1.001 })

      // Taker STOP LIMIT orders
      const oStopBuyT = genStopLimitBuy({
        price: midPrice * 1.2,
        priceAuxLimit: midPrice * 0.7
      })

      const oStopSellT = genStopLimitSell({
        price: midPrice * 0.8,
        priceAuxLimit: midPrice * 1.3
      })

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

        assertNotFilled(oBuyM)
        assertNotFilled(oStopSellT)
        assertOrderNotInserted(oStopSellT, dataT)
        assertOrderNotInserted({
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
        assertOrderNotInserted(oStopBuyT, dataT)
        assertOrderNotInserted({
          price: oStopBuyT.priceAuxLimit,
          amountOrig: oStopBuyT.amount
        }, dataT)

        refreshSnapshots()
      })
    }
  }
}
