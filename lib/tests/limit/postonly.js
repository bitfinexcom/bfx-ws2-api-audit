'use strict'

const assert = require('assert')
const { Order } = require('bitfinex-api-node/lib/models')
const { M_FEE, T_FEE } = require('../../config')
const Promise = require('bluebird')

const genOrderUtils = require('../../util/gen_order')
const delayPromise = require('../../util/delay_promise')
const {
  assertNotFilled, assertFullyFilled, assertWalletsUpdated, assertCanceled,
  assertNotCanceled
} = require('../../assert/order')

const {
  assertOrderInserted, assertOrderRemoved, assertOrderNotInserted,
  assertOrderNotRemoved
} = require('../../assert/orderbook')

const stepCancelAllOrders = require('../../steps/cancel_all_orders')
const stepRefreshSnapshots = require('../../steps/refresh_data_snapshots')

/**
 * Submit a LIMIT buy/sell order as post-only and verify it is inserted into
 * the order book, and cancelled if it would otherwise immediately fill.
 *
 * @param {Object} args
 * @param {string} args.symbol
 * @param {number} args.amount
 * @param {number} args.initialMid - used as the LIMIT price if the OB is empty
 * @param {number} args.dataDelay - ms to wait after submit before continuing
 * @return {Object} step
 */
module.exports = ({ symbol, amount, initialMid, dataDelay }) => {
  const {
    genBuy, genMarketBuy, genLimitBuy, genSell, genLimitSell, genMarketSell,
    submitOrder
  } = genOrderUtils(symbol, amount, dataDelay)

  return {
    id: 'postonly',
    label: 'submit a POSTONLY order and verifies it only executes if posted',
    actors: ['maker', 'taker'],
    before: [
      stepCancelAllOrders(),
      stepRefreshSnapshots()
    ],
    exec: ({ dataM, dataT, wsM, wsT, refreshSnapshots }) => {
      const _mp = dataM.midPrice()
      const midPrice = _mp === 0 ? initialMid : _mp

      // Maker orders
      const oSellM = genLimitSell({ price: midPrice * 1.1 })
      const oBuyM = genLimitBuy({ price: midPrice * 0.9 })

      // Taker orders
      const oBuyTPostOnlyCanceled = genLimitBuy({
        price: midPrice * 1.2,
        postonly: true
      })

      const oBuyTPostOnlyExec = genLimitBuy({
        price: midPrice * 0.8,
        postonly: true
      })

      const oSellTPostOnlyCanceled = genLimitSell({
        price: midPrice * 0.8,
        postonly: true
      })

      const oSellTPostOnlyExec = genLimitSell({
        price: midPrice * 1.2,
        postonly: true
      })

      // Submit initial maker sell order
      return submitOrder(oSellM, wsM, dataM).then(() => {
        assertNotFilled(oSellM)
        assertOrderInserted(oSellM, dataM)

        // Submit invalid postonly buy
        return submitOrder(oBuyTPostOnlyCanceled, wsT, dataT)
      }).then(() => {
        dataM.updateOrder(oSellM)

        assertNotFilled(oSellM)
        assertOrderNotInserted(oBuyTPostOnlyCanceled, dataT)
        assertCanceled(oBuyTPostOnlyCanceled)

        // Submit valid postonly buy
        return submitOrder(oBuyTPostOnlyExec, wsT, dataT)
      }).then(() => {
        dataM.updateOrder(oSellM)

        assertNotFilled(oSellM)
        assertNotFilled(oBuyTPostOnlyExec)
        assertOrderInserted(oBuyTPostOnlyExec, dataT)
        assertNotCanceled(oBuyTPostOnlyExec)

        return dataM.cancelAllOpenOrders()
      }).then(() => {
        return submitOrder(oBuyM, wsM, dataM) // submit maker buy order
      }).then(() => {
        assertNotFilled(oBuyM)
        assertOrderInserted(oBuyM, dataM)

        // Submit invalid postonly buy
        return submitOrder(oSellTPostOnlyCanceled, wsT, dataT)
      }).then(() => {
        dataM.updateOrder(oBuyM)

        assertNotFilled(oBuyM)
        assertOrderNotInserted(oSellTPostOnlyCanceled, dataT)
        assertCanceled(oBuyTPostOnlyCanceled)

        // Submit valid postonly buy
        return submitOrder(oSellTPostOnlyExec, wsT, dataT)
      }).then(() => {
        dataM.updateOrder(oBuyM)

        assertNotFilled(oBuyM)
        assertNotFilled(oSellTPostOnlyExec)
        assertOrderInserted(oSellTPostOnlyExec, dataT)
        assertNotCanceled(oSellTPostOnlyExec)
      })
    }
  }
}
