'use strict'

const assert = require('assert')
const { Order } = require('bitfinex-api-node/lib/models')
const { M_FEE, T_FEE } = require('../../config')
const genOrderUtils = require('../../util/gen_order')
const delayPromise = require('../../util/delay_promise')
const genOrderSet = require('../../util/order_set')
const {
  assertNotFilled, assertFullyFilled, assertWalletsUpdated
} = require('../../assert/order')

const {
  assertOrderInserted, assertOrderRemoved
} = require('../../assert/orderbook')

const stepCancelAllOrders = require('../../steps/cancel_all_orders')
const stepRefreshSnapshots = require('../../steps/refresh_data_snapshots')

const { DUST } = require('../../config')

/**
 * Submit TRAILING STOP sell & buy orders, and confirm that they follow the
 * top bid/ask up & down
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
    submitOrder, genTrailingStopBuy, genTrailingStopSell, submitOrders,
    cancelOrders, cancelOrder
  } = genOrderUtils(symbol, amount, dataDelay)

  return {
    id: 'trailing_stop_trail',
    label: 'submit trailing stops & verify trailing behaviour',
    actors: ['maker', 'taker'],
    before: [
      stepCancelAllOrders(),
      stepRefreshSnapshots()
    ],
    exec: ({ dataM, dataT, wsM, wsT, refreshSnapshots }) => {
      const _mp = dataM.midPrice(symbol)
      const midPrice = _mp === 0 ? initialMid : _mp

      // Maker LIMIT orders, to move price
      const oBuyLimitAM = genLimitBuy({ price: midPrice * 1.001 })
      const oBuyLimitBM = genLimitBuy({ price: midPrice * 1.002 })
      const oBuyLimitCM = genLimitBuy({ price: midPrice * 1.003 })

      const oSellLimitAM = genLimitSell({ price: midPrice * 1.006 })
      const oSellLimitBM = genLimitSell({ price: midPrice * 1.005 })
      const oSellLimitCM = genLimitSell({ price: midPrice * 1.004 })

      const delta = midPrice * 0.003

      // Actual taker TRAILING STOP orders
      const oTrailingBuyT = genTrailingStopBuy({ priceTrailing: delta })
      const oTrailingSellT = genTrailingStopSell({ priceTrailing: delta })
      const qCurrency = oTrailingBuyT.getQuoteCurrency()

      // Submit initial ask
      return submitOrder(oSellLimitAM, wsM, dataM).then(() => {
        assertOrderInserted(oSellLimitAM, dataM)

        return submitOrder(oTrailingBuyT, wsT, dataT) // submit trailing buy
      }).then(() => {
        dataM.updateOrder(oSellLimitAM)
        assertNotFilled(oSellLimitAM)
        assertNotFilled(oTrailingBuyT)
        refreshSnapshots()

        return submitOrder(oSellLimitBM, wsM, dataM, 15 * 1000) // bump top ask
      }).then(() => {
        dataT.updateOrder(oTrailingBuyT)

        assertOrderInserted(oSellLimitBM, dataM)
        assertNotFilled(oSellLimitBM)
        assertNotFilled(oTrailingBuyT)
        assert(
          Math.abs((oTrailingBuyT.price - oSellLimitBM.price) - delta) < DUST[qCurrency]
        )

        refreshSnapshots()

        return submitOrder(oSellLimitCM, wsM, dataM, 15 * 1000) // bump top ask
      }).then(() => {
        dataT.updateOrder(oTrailingBuyT)

        assertOrderInserted(oSellLimitCM, dataM)
        assertNotFilled(oSellLimitCM)
        assertNotFilled(oTrailingBuyT)
        assert(
          Math.abs((oTrailingBuyT.price - oSellLimitCM.price) - delta) < DUST[qCurrency]
        )

        refreshSnapshots()

        // Repeat in reverse; first cancel all orders
        return cancelOrders([
          oSellLimitAM,
          oSellLimitBM,
          oSellLimitCM
        ], wsM, dataM).then(() => {
          return cancelOrder(oTrailingBuyT, wsT, dataT)
        })
      }).then(() => {
        assertOrderRemoved(oSellLimitAM, dataM)
        assertOrderRemoved(oSellLimitBM, dataM)
        assertOrderRemoved(oSellLimitCM, dataM)
        refreshSnapshots()

        return submitOrder(oBuyLimitAM, wsM, dataM) // submit initial bid
      }).then(() => {
        assertOrderInserted(oBuyLimitAM, dataM)
        refreshSnapshots()

        return submitOrder(oTrailingSellT, wsT, dataT) // submit trailing sell
      }).then(() => {
        dataM.updateOrder(oBuyLimitAM)
        assertNotFilled(oBuyLimitAM)
        assertNotFilled(oTrailingSellT)
        refreshSnapshots()

        return submitOrder(oBuyLimitBM, wsM, dataM, 15 * 1000) // bump top bid
      }).then(() => {
        dataT.updateOrder(oTrailingSellT)

        assertOrderInserted(oBuyLimitBM, dataM)
        assertNotFilled(oBuyLimitBM)
        assertNotFilled(oTrailingSellT)
        assert(
          Math.abs((oBuyLimitBM.price - oTrailingSellT.price) - delta) < DUST[qCurrency]
        )

        refreshSnapshots()

        return submitOrder(oBuyLimitCM, wsM, dataM, 15 * 1000) // bump top bid
      }).then(() => {
        dataT.updateOrder(oTrailingSellT)

        assertOrderInserted(oBuyLimitCM, dataM)
        assertNotFilled(oBuyLimitCM)
        assertNotFilled(oTrailingSellT)
        assert(
          Math.abs((oBuyLimitCM.price - oTrailingSellT.price) - delta) < DUST[qCurrency]
        )

        refreshSnapshots()
      })
    }
  }
}
